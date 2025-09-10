require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Importar sistema de logging e métricas
const { logger, logHelpers } = require('./utils/logger');
const { metricsMiddleware } = require('./utils/metrics');
const { monitoringMiddleware, errorMonitoringMiddleware } = require('./utils/monitoring');

const emarsysRoutes = require('./routes/emarsys');
const vtexProductRoutes = require('./routes/vtexProducts');
const emarsysSalesRoutes = require('./routes/emarsysSales');
const emarsysCsvRoutes = require('./routes/emarsysCsv');
const emarsysContactsRoutes = require('./routes/emarsysContacts');
const emsClientsRoutes = require('./routes/emsClients');
const metricsRoutes = require('./routes/metrics');
const alertsRoutes = require('./routes/alerts');

const integrationRoutes = require('./routes/integration');
const backgroundJobsRoutes = require('./routes/backgroundJobs');
const cronJobsRoutes = require('./routes/cronJobs');
const cronManagementRoutes = require('./routes/cronManagement');
const { generateOAuth2TokenFromEnv, getEmarsysSettings } = require('./utils/emarsysAuth');
const { getBrazilianTimestamp } = require('./utils/dateUtils');
const CronService = require('./utils/cronService');

const app = express();
const PORT = process.env.PORT;
const HOST = process.env.HOST;
const cronService = new CronService();

// Middleware de segurança
app.use(helmet());

// Middleware de CORS
app.use(cors());

// Middleware de parsing
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Middleware de logging HTTP com Morgan
app.use(morgan('combined', {
  stream: {
    write: (message) => {
      logger.http(message.trim());
    }
  }
}));

// Middleware de monitoramento personalizado
app.use(monitoringMiddleware);

// Rotas da aplicação
app.use('/api/emarsys', emarsysRoutes);
app.use('/api/vtex/products', vtexProductRoutes);
app.use('/api/emarsys/sales', emarsysSalesRoutes);
app.use('/api/emarsys/csv', emarsysCsvRoutes);
app.use('/api/emarsys/contacts', emarsysContactsRoutes);
app.use('/api/emarsys/ems-clients', emsClientsRoutes);
app.use('/api/integration', integrationRoutes);
app.use('/api/background', backgroundJobsRoutes);
app.use('/api/cron', cronJobsRoutes);
app.use('/api/cron-management', cronManagementRoutes);

// Rotas de métricas e monitoramento
app.use('/api/metrics', metricsRoutes);
app.use('/api/alerts', alertsRoutes);

// Health check básico
app.get('/health', (req, res) => res.status(200).json({ ok: true }));

// Middleware de tratamento de erros
app.use(errorMonitoringMiddleware);

app.use((err, req, res, next) => {
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
  res.status(404).json({ error: 'Openflow - Emarsys - Route not found' });
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, HOST, () => {
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
    console.log(`VTEX API: http://localhost:${PORT}/api/vtex`);
    console.log(`VTEX Products API: http://localhost:${PORT}/api/vtex/products`);
    console.log(`Emarsys Sales API: http://localhost:${PORT}/api/emarsys/sales`);
    console.log(`Emarsys CSV API: http://localhost:${PORT}/api/emarsys/csv`);
    console.log(`Emarsys Contacts API: http://localhost:${PORT}/api/emarsys/contacts`);
    console.log(`Integration API: http://localhost:${PORT}/api/integration`);
    console.log(`Background Jobs API: http://localhost:${PORT}/api/background`);
    console.log(`Cron Jobs API: http://localhost:${PORT}/api/cron`);
    
    logger.info('🚀 Iniciando cron jobs nativos para sincronização automática...');
    app.set('cronService', cronService);
    
    cronService.startAll();
  });
}

process.on('SIGTERM', () => {
  logger.info('🛑 Recebido SIGTERM, parando cron jobs...');
  console.log('🛑 Recebido SIGTERM, parando cron jobs...');
  cronService.stopAll();
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