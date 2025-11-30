const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const { getBrazilianTimestamp } = require('./dateUtils');

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
  sync: 'cyan',
  retry: 'blue',
  alert: 'red',
  orders: 'blue',
  products: 'green',
  clients: 'yellow'
};

winston.addColors(colors);

// Formato personalizado para timestamp brasileiro
const brazilianTimestamp = winston.format.timestamp({
  format: () => getBrazilianTimestamp()
});

// Formato com divisórias para melhor visualização
const dividerFormat = winston.format.printf(({ timestamp, level, message, module, ...meta }) => {
  const divider = '='.repeat(80);
  const moduleTag = module ? `[${module.toUpperCase()}]` : '';
  let log = `${divider}\n`;
  log += `${timestamp} ${moduleTag} [${level.toUpperCase()}]: ${message}\n`;
  
  if (Object.keys(meta).length > 0) {
    log += `DETALHES:\n${JSON.stringify(meta, null, 2)}\n`;
  }
  
  log += `${divider}\n`;
  return log;
});

const logFormat = winston.format.combine(
  brazilianTimestamp,
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  brazilianTimestamp,
  winston.format.printf(({ timestamp, level, message, module, ...meta }) => {
    const moduleTag = module ? `[${module.toUpperCase()}]` : '';
    let log = `${timestamp} ${moduleTag} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    return log;
  })
);

const transports = [
  // Console transport
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'info',
    format: consoleFormat,
  }),

  // Arquivo de logs combinados (TUDO em um só arquivo) - Rotação diária
  new DailyRotateFile({
    filename: path.join('logs', 'ems-pcy-combined-%DATE%.log'),
    datePattern: 'DD-MM-YYYY',
    maxSize: '20m',        // Reduzido de 50m para evitar arquivos muito grandes
    maxFiles: '7d',        // Manter apenas 7 dias
    zippedArchive: true,   // Comprimir arquivos antigos automaticamente
    level: 'info',
    format: logFormat,
  }),

  // Arquivo de logs gerais do sistema
  new DailyRotateFile({
    filename: path.join('logs', 'ems-pcy-system-%DATE%.log'),
    datePattern: 'DD-MM-YYYY',
    maxSize: '20m',
    maxFiles: '14d',
    level: 'info',
    format: logFormat,
  }),

  // Arquivo de logs de erros e falhas
  new DailyRotateFile({
    filename: path.join('logs', 'ems-pcy-errors-%DATE%.log'),
    datePattern: 'DD-MM-YYYY',
    maxSize: '20m',
    maxFiles: '30d',
    level: 'error',
    format: logFormat,
  }),

  // Arquivo de logs de requisições HTTP
  new DailyRotateFile({
    filename: path.join('logs', 'ems-pcy-http-%DATE%.log'),
    datePattern: 'DD-MM-YYYY',
    maxSize: '20m',
    maxFiles: '7d',
    level: 'http',
    format: logFormat,
  }),

  // Arquivo de logs de sincronização
  new DailyRotateFile({
    filename: path.join('logs', 'ems-pcy-sync-%DATE%.log'),
    datePattern: 'DD-MM-YYYY',
    maxSize: '20m',
    maxFiles: '14d',
    level: 'sync',
    format: logFormat,
  }),

  // Arquivo de logs de reprocessamento
  new DailyRotateFile({
    filename: path.join('logs', 'ems-pcy-retry-%DATE%.log'),
    datePattern: 'DD-MM-YYYY',
    maxSize: '20m',
    maxFiles: '14d',
    level: 'retry',
    format: logFormat,
  }),

  // Arquivo de logs de alertas
  new DailyRotateFile({
    filename: path.join('logs', 'ems-pcy-alerts-%DATE%.log'),
    datePattern: 'DD-MM-YYYY',
    maxSize: '20m',
    maxFiles: '30d',
    level: 'alert',
    format: logFormat,
  }),
];

// Criar o logger principal
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports,
  exitOnError: false,
  levels: winston.config.npm.levels,
});

// Adicionar cores para níveis customizados
winston.addColors({
  sync: 'cyan',
  retry: 'yellow',
  alert: 'magenta'
});

// Logger específico para métricas
const metricsLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    brazilianTimestamp,
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: path.join('logs', 'ems-pcy-metrics-%DATE%.log'),
      datePattern: 'DD-MM-YYYY',
      maxSize: '20m',
      maxFiles: '30d',
    }),
    // Adiciona também ao log combinado - Rotação diária
    new DailyRotateFile({
      filename: path.join('logs', 'ems-pcy-combined-%DATE%.log'),
      datePattern: 'DD-MM-YYYY',
      maxSize: '20m',        // Reduzido para evitar acúmulo
      maxFiles: '7d',
      zippedArchive: true,   // Comprimir automaticamente
      level: 'info',
    }),
  ],
});

// Logger específico para auditoria
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    brazilianTimestamp,
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: path.join('logs', 'ems-pcy-audit-%DATE%.log'),
      datePattern: 'DD-MM-YYYY',
      maxSize: '20m',
      maxFiles: '90d',
    }),
    // Adiciona também ao log combinado - Rotação diária
    new DailyRotateFile({
      filename: path.join('logs', 'ems-pcy-combined-%DATE%.log'),
      datePattern: 'DD-MM-YYYY',
      maxSize: '20m',        // Reduzido para evitar acúmulo
      maxFiles: '7d',
      zippedArchive: true,   // Comprimir automaticamente
      level: 'info',
    }),
  ],
});

// Logger específico para ORDERS
const ordersLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    brazilianTimestamp,
    dividerFormat
  ),
  transports: [
    new winston.transports.Console({
      level: 'info',
      format: consoleFormat,
    }),
    new DailyRotateFile({
      filename: path.join('logs', 'ems-pcy-cro-orders-%DATE%.log'),
      datePattern: 'DD-MM-YYYY',
      maxSize: '50m',
      maxFiles: '30d',
      level: 'info',
    }),
    // Adiciona também ao log combinado - Rotação diária
    new DailyRotateFile({
      filename: path.join('logs', 'ems-pcy-combined-%DATE%.log'),
      datePattern: 'DD-MM-YYYY',
      maxSize: '20m',        // Reduzido para evitar acúmulo
      maxFiles: '7d',
      zippedArchive: true,   // Comprimir automaticamente
      level: 'info',
      format: dividerFormat,
    }),
  ],
});

// Logger específico para PRODUCTS
const productsLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    brazilianTimestamp,
    dividerFormat
  ),
  transports: [
    new winston.transports.Console({
      level: 'info',
      format: consoleFormat,
    }),
    new DailyRotateFile({
      filename: path.join('logs', 'ems-pcy-cro-products-%DATE%.log'),
      datePattern: 'DD-MM-YYYY',
      maxSize: '50m',
      maxFiles: '30d',
      level: 'info',
    }),
    // Adiciona também ao log combinado - Rotação diária
    new DailyRotateFile({
      filename: path.join('logs', 'ems-pcy-combined-%DATE%.log'),
      datePattern: 'DD-MM-YYYY',
      maxSize: '20m',        // Reduzido para evitar acúmulo
      maxFiles: '7d',
      zippedArchive: true,   // Comprimir automaticamente
      level: 'info',
      format: dividerFormat,
    }),
  ],
});

// Logger específico para CLIENTS
const clientsLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    brazilianTimestamp,
    dividerFormat
  ),
  transports: [
    new winston.transports.Console({
      level: 'info',
      format: consoleFormat,
    }),
    new DailyRotateFile({
      filename: path.join('logs', 'ems-pcy-cro-clients-%DATE%.log'),
      datePattern: 'DD-MM-YYYY',
      maxSize: '50m',
      maxFiles: '30d',
      level: 'info',
    }),
    // Adiciona também ao log combinado - Rotação diária
    new DailyRotateFile({
      filename: path.join('logs', 'ems-pcy-combined-%DATE%.log'),
      datePattern: 'DD-MM-YYYY',
      maxSize: '20m',        // Reduzido para evitar acúmulo
      maxFiles: '7d',
      zippedArchive: true,   // Comprimir automaticamente
      level: 'info',
      format: dividerFormat,
    }),
  ],
});

// Logger específico para ACESSOS e REQUESTS
const accessLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    brazilianTimestamp,
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      level: 'warn',
      format: consoleFormat,
    }),
    new DailyRotateFile({
      filename: path.join('logs', 'ems-pcy-access-requests-%DATE%.log'),
      datePattern: 'DD-MM-YYYY',
      maxSize: '20m',
      maxFiles: '30d',
      level: 'info',
    }),
    // Adiciona também ao log combinado - Rotação diária
    new DailyRotateFile({
      filename: path.join('logs', 'ems-pcy-combined-%DATE%.log'),
      datePattern: 'DD-MM-YYYY',
      maxSize: '20m',        // Reduzido para evitar acúmulo
      maxFiles: '7d',
      zippedArchive: true,   // Comprimir automaticamente
      level: 'info',
    }),
  ],
});

// Funções auxiliares para logging estruturado
const logHelpers = {
  // Log de requisição HTTP
  logRequest: (req, res, responseTime) => {
    logger.http('HTTP Request', {
      method: req.method,
      url: req.originalUrl,
      query: req.query && Object.keys(req.query || {}).length ? req.query : undefined,
      body: req.method !== 'GET' && req.body && Object.keys(req.body || {}).length ? req.body : undefined,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: req.user?.id || 'anonymous',
    });
  },

  // Log de erro
  logError: (error, context = {}) => {
    logger.error('Application Error', {
      message: error.message,
      stack: error.stack,
      ...context,
    });
  },

  // Log de métrica de negócio
  logMetric: (metricName, value, tags = {}) => {
    metricsLogger.info('Business Metric', {
      metric: metricName,
      value,
      tags,
    });
  },

  // Log de auditoria
  logAudit: (action, userId, details = {}) => {
    auditLogger.info('Audit Log', {
      action,
      userId,
      details,
    });
  },

  // Log detalhado de falha com payload completo
  logFailure: (failureType, error, requestData = {}, context = {}) => {
    logger.error(`🚨 FALHA CRÍTICA - ${failureType}`, {
      failureType,
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        name: error.name
      },
      request: {
        method: requestData.method,
        url: requestData.url,
        url: requestData.url,
        headers: requestData.headers,
        body: requestData.body,
        query: requestData.query,
        params: requestData.params
      },
      context: {
        ...context,
        timestamp: getBrazilianTimestamp(),
        severity: 'critical'
      }
    });
  },

  // Log de sincronização
  logSync: (syncType, status, details = {}) => {
    logger.log('sync', `🔄 SINCRONIZAÇÃO - ${syncType}`, {
      syncType,
      status,
      details,
      timestamp: getBrazilianTimestamp()
    });
  },

  // Log de reprocessamento
  logRetry: (retryId, attempt, status, details = {}) => {
    logger.log('retry', `🔄 REPROCESSAMENTO - ${retryId}`, {
      retryId,
      attempt,
      status,
      details,
      timestamp: getBrazilianTimestamp()
    });
  },

  // Log de alerta
  logAlert: (alertType, severity, message, details = {}) => {
    logger.log('alert', `🚨 ALERTA [${severity.toUpperCase()}] - ${alertType}`, {
      alertType,
      severity,
      message,
      details,
      timestamp: getBrazilianTimestamp()
    });
  },

  // Log de performance
  logPerformance: (operation, duration, metadata = {}) => {
    logger.info('Performance Log', {
      operation,
      duration: `${duration}ms`,
      ...metadata,
    });
  },

  // Log de integração externa
  logIntegration: (service, action, status, details = {}) => {
    logger.info('Integration Log', {
      service,
      action,
      status,
      ...details,
    });
  },

  // Log específico para ORDERS
  logOrders: (level, message, details = {}) => {
    ordersLogger.log(level, message, {
      module: 'orders',
      ...details,
      timestamp: getBrazilianTimestamp()
    });
  },

  // Log específico para PRODUCTS
  logProducts: (level, message, details = {}) => {
    productsLogger.log(level, message, {
      module: 'products',
      ...details,
      timestamp: getBrazilianTimestamp()
    });
  },

  // Log específico para CLIENTS
  logClients: (level, message, details = {}) => {
    clientsLogger.log(level, message, {
      module: 'clients',
      ...details,
      timestamp: getBrazilianTimestamp()
    });
  },

  // Log de erro específico para ORDERS
  logOrdersError: (error, context = {}) => {
    ordersLogger.error('ORDERS ERROR', {
      module: 'orders',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        name: error.name
      },
      context,
      timestamp: getBrazilianTimestamp()
    });
  },

  // Log de erro específico para PRODUCTS
  logProductsError: (error, context = {}) => {
    productsLogger.error('PRODUCTS ERROR', {
      module: 'products',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        name: error.name
      },
      context,
      timestamp: getBrazilianTimestamp()
    });
  },

  // Log de erro específico para CLIENTS
  logClientsError: (error, context = {}) => {
    clientsLogger.error('CLIENTS ERROR', {
      module: 'clients',
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        name: error.name
      },
      context,
      timestamp: getBrazilianTimestamp()
    });
  },

  // Log de tentativas de acesso a rotas inválidas
  logAccessAttempt: (req, statusCode, blocked = false, attemptCount = 0) => {
    const level = statusCode === 429 ? 'warn' : 'info';
    const message = blocked ? '🚫 ACESSO BLOQUEADO' : '⚠️ ROTA INVÁLIDA';
    
    accessLogger.log(level, message, {
      module: 'access',
      status: statusCode,
      blocked,
      attemptCount,
      request: {
        method: req.method,
        path: req.path || req.originalUrl || '',
        ip: req.ip || req.headers['x-forwarded-for'] || (req.connection && req.connection.remoteAddress) || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        referer: req.get('Referer') || 'none',
        origin: req.get('Origin') || 'none',
      },
      timestamp: getBrazilianTimestamp()
    });
  },
};

// Criar diretório de logs se não existir
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

module.exports = {
  logger,
  metricsLogger,
  auditLogger,
  ordersLogger,
  productsLogger,
  clientsLogger,
  accessLogger,
  logHelpers,
};
