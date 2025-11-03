require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
// const morgan = require('morgan');

// Importar sistema de logging e métricas
const { logger, logHelpers } = require('./utils/logger');
const { metricsMiddleware } = require('./utils/metrics');
const { monitoringMiddleware, errorMonitoringMiddleware } = require('./utils/monitoring');
const { httpLogger } = require('./utils/httpLogger');

// Importar monitoramento de recursos
const SystemMonitor = require('./services/systemMonitor');
const ResourceMonitor = require('./middleware/resourceMonitor');

// Inicializar SQLite database
const { getDatabase } = require('./database/sqlite');
const db = getDatabase();
db.init().then(() => {
  console.log('✅ SQLite database initialized successfully');
}).catch((error) => {
  console.error('❌ Failed to initialize SQLite database:', error);
});

const emarsysRoutes = require('./routes/emarsys');
const vtexProductRoutes = require('./routes/vtexProducts');
const emarsysSalesRoutes = require('./routes/emarsysSales');
const emarsysCsvRoutes = require('./routes/emarsysCsv');
const emarsysContactsRoutes = require('./routes/emarsysContacts');
const emsClientsRoutes = require('./routes/emsClients');
const emsOrdersRoutes = require('./routes/emsOrders');
const metricsRoutes = require('./routes/metrics');
const alertsRoutes = require('./routes/alerts');
const contactErrorsRoutes = require('./routes/contactErrors');

const integrationRoutes = require('./routes/integration');
const backgroundJobsRoutes = require('./routes/backgroundJobs');
const cronJobsRoutes = require('./routes/cronJobs');
const cronManagementRoutes = require('./routes/cronManagement');
const crashProtectionRoutes = require('./routes/crashProtection');
const { getBrazilianTimestamp } = require('./utils/dateUtils');
const CronService = require('./utils/cronService');

const app = express();
const PORT = process.env.PORT;
const HOST = process.env.HOST;
const cronService = new CronService();

// Early deny de paths suspeitos
app.use((req, res, next) => {
  const bad = [
    /^\/\./,                                          // dotfiles
    /\.(env|ini|ya?ml|log|gz|sql|zip|bak|old)$/i,
    /\/(phpmyadmin|wp-admin|wp-login|vendor|\.git)/i
  ];
  if (bad.some(r => r.test(req.path))) {
    return res.sendStatus(404);
  }
  return next();
});

// Bloqueio de rotas não pertencentes à aplicação + rate limit (5 tentativas/30min)
const ALLOWED_PREFIXES = [
  '/api/emarsys',
  '/api/vtex',
  '/api/ems-orders',
  '/api/integration',
  '/api/background',
  '/api/cron',
  '/api/cron-management',
  '/api/crash-protection',
  '/api/metrics',
  '/api/alerts',
  '/api/contact-errors',
  '/health',
  '/favicon.ico'
];

const unknownRouteAttempts = new Map();
const UNKNOWN_WINDOW_MS = 30 * 60 * 1000; // 30 minutos
const UNKNOWN_MAX_ATTEMPTS = 5; // permite 5, bloqueia a partir da 6ª

app.use((req, res, next) => {
  const path = req.path || req.originalUrl || '';
  if (ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix))) {
    return next();
  }

  const now = Date.now();
  const ip = req.ip || req.headers['x-forwarded-for'] || (req.connection && req.connection.remoteAddress) || 'unknown';
  let entry = unknownRouteAttempts.get(ip);

  if (!entry || (now - entry.firstSeen) > UNKNOWN_WINDOW_MS) {
    entry = { count: 0, firstSeen: now };
  }

  entry.count += 1;
  unknownRouteAttempts.set(ip, entry);

  if (entry.count > UNKNOWN_MAX_ATTEMPTS) {
    // Log de acesso bloqueado
    logHelpers.logAccessAttempt(req, 429, true, entry.count);
    
    return res.status(429).json({
      error: 'too_many_requests',
      message: 'Muitas tentativas em rotas inválidas. Tente novamente mais tarde.'
    });
  }

  // Log de tentativa de acesso a rota inválida
  logHelpers.logAccessAttempt(req, 404, false, entry.count);

  return res.status(404).json({ error: 'Route not found' });
});

// Middleware de segurança
app.use(helmet({
  contentSecurityPolicy: false,
  referrerPolicy: { policy: 'no-referrer' }
}));

// Middleware de CORS
app.use(cors());

// Middleware de métricas
app.use(metricsMiddleware);

// Inicializar monitoramento de recursos
const resourceMonitor = new ResourceMonitor();

// Middleware de monitoramento de recursos
app.use(resourceMonitor.monitorResources());
app.use(resourceMonitor.resourceFailureDetector());

// Middleware para validar Content-Type antes do parsing
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const contentType = req.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      // Validar se o Content-Type está correto
      if (!contentType.includes('charset=utf-8') && !contentType.includes('charset=UTF-8')) {
        console.warn('⚠️ Content-Type sem charset especificado:', {
          contentType,
          url: req.url,
          method: req.method,
          ip: req.ip
        });
      }
    }
  }
  next();
});

// Middleware de parsing
app.use(express.json({ 
  limit: '2mb',
  verify: (req, res, buf, encoding) => {
    // Armazenar o buffer original para debug
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Middleware específico para tratar erros de parsing JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('❌ Erro de parsing JSON:', {
      message: err.message,
      status: err.status,
      type: err.type,
      body: err.body,
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      rawBody: req.rawBody ? req.rawBody.toString('utf8').substring(0, 200) + '...' : 'N/A'
    });
    
    return res.status(400).json({
      success: false,
      error: 'JSON malformado',
      detail: err.message,
      position: err.message.match(/position (\d+)/)?.[1] || 'desconhecida',
      timestamp: new Date().toISOString()
    });
  }
  next(err);
});

// Middleware de logging HTTP estruturado (JSON)
app.use(httpLogger);

// Middleware de monitoramento personalizado
app.use(monitoringMiddleware);

// Rotas da aplicação
app.use('/api/emarsys', emarsysRoutes);
app.use('/api/vtex/products', vtexProductRoutes);
app.use('/api/emarsys/sales', emarsysSalesRoutes);
app.use('/api/emarsys/csv', emarsysCsvRoutes);
app.use('/api/emarsys/contacts', emarsysContactsRoutes);
app.use('/api/emarsys/ems-clients', emsClientsRoutes);
app.use('/api/ems-orders', emsOrdersRoutes);
app.use('/api/integration', integrationRoutes);

// Background Jobs e Cron Jobs: Rotas diferentes, sem colisão
// - /api/background/sync-orders: Execução manual em background (backgroundJobs.js)
// - /api/cron/sync-orders: Simulação de cron local (cronJobs.js)
app.use('/api/background', backgroundJobsRoutes);
app.use('/api/cron', cronJobsRoutes);
app.use('/api/cron-management', cronManagementRoutes);
app.use('/api/crash-protection', crashProtectionRoutes);

// Rotas de métricas e monitoramento
app.use('/api/metrics', metricsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/contact-errors', contactErrorsRoutes);

// Health check básico
app.get('/health', (req, res) => res.status(200).json({ ok: true }));

// Middleware de tratamento de erros
app.use(errorMonitoringMiddleware);

app.use((err, req, res, next) => {
  // disponibiliza o erro para o httpLogger anexar no JSON
  res.locals.error = { name: err.name, message: err.message, stack: err.stack };
  logHelpers.logError(err, {
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  });
  
  res.status(500).json({ 
    error: 'Openflow - Emarsys - internal_error', 
    detail: err.message,
    requestId: req.requestId
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Opn - Ems - Route not found' });
});

module.exports = app;

if (require.main === module) {
  const server = app.listen(PORT, HOST, () => {
    logger.info('🚀 Servidor iniciado com sucesso', {
      port: PORT,
      host: HOST,
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      uptime: process.uptime()
    });
    
    console.log(`Server running on port ${PORT}`);
    console.log(`Up on ${HOST}:${PORT}`)
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Metrics Dashboard: http://localhost:${PORT}/api/metrics/dashboard`);
    console.log(`Prometheus Metrics: http://localhost:${PORT}/api/metrics/prometheus`);
    console.log(`Emarsys API: http://localhost:${PORT}/api/emarsys`);
    console.log(`VTEX Products API: http://localhost:${PORT}/api/vtex/products`);
    console.log(`Emarsys Sales API: http://localhost:${PORT}/api/emarsys/sales`);
    console.log(`Emarsys CSV API: http://localhost:${PORT}/api/emarsys/csv`);
    console.log(`Emarsys Contacts API: http://localhost:${PORT}/api/emarsys/contacts`);
    console.log(`EMS Clients API: http://localhost:${PORT}/api/emarsys/ems-clients`);
    console.log(`EMS Orders API: http://localhost:${PORT}/api/ems-orders`);
    console.log(`Integration API: http://localhost:${PORT}/api/integration`);
    console.log(`Background Jobs API: http://localhost:${PORT}/api/background`);
    console.log(`Cron Jobs API: http://localhost:${PORT}/api/cron`);
    console.log(`Cron Management API: http://localhost:${PORT}/api/cron-management`);
    console.log(`Crash Protection API: http://localhost:${PORT}/api/crash-protection`);
    console.log(`Alerts API: http://localhost:${PORT}/api/alerts`);
    console.log(`Contact Errors API: http://localhost:${PORT}/api/contact-errors`);
    
    logger.info('🚀 Iniciando cron jobs nativos para sincronização automática...');
    app.set('cronService', cronService);
    
    cronService.startAll();
  });
}

process.on('SIGTERM', () => {
  logger.info('🛑 Recebido SIGTERM, parando cron jobs...');
  console.log('🛑 Recebido SIGTERM, parando cron jobs...');
  cronService.stopAll();
  websocketService.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('🛑 Recebido SIGINT, parando cron jobs...');
  console.log('🛑 Recebido SIGINT, parando cron jobs...');
  cronService.stopAll();
  process.exit(0);
});

// Capturar erros não tratados
process.on('uncaughtException', (error) => {
  logger.error('❌ Erro não capturado:', error);
  console.error('❌ Erro não capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Promise rejeitada não tratada:', { reason, promise });
  console.error('❌ Promise rejeitada não tratada:', reason);
});