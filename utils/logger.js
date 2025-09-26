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

  // Arquivo de logs gerais do sistema
  new DailyRotateFile({
    filename: path.join('logs', 'piccadilly-emarsys-system-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    level: 'info',
    format: logFormat,
  }),

  // Arquivo de logs de erros e falhas
  new DailyRotateFile({
    filename: path.join('logs', 'piccadilly-emarsys-errors-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    level: 'error',
    format: logFormat,
  }),

  // Arquivo de logs de requisições HTTP
  new DailyRotateFile({
    filename: path.join('logs', 'piccadilly-emarsys-http-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '7d',
    level: 'http',
    format: logFormat,
  }),

  // Arquivo de logs de sincronização
  new DailyRotateFile({
    filename: path.join('logs', 'piccadilly-emarsys-sync-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    level: 'sync',
    format: logFormat,
  }),

  // Arquivo de logs de reprocessamento
  new DailyRotateFile({
    filename: path.join('logs', 'piccadilly-emarsys-retry-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    level: 'retry',
    format: logFormat,
  }),

  // Arquivo de logs de alertas
  new DailyRotateFile({
    filename: path.join('logs', 'piccadilly-emarsys-alerts-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
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
      filename: path.join('logs', 'piccadilly-emarsys-metrics-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
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
      filename: path.join('logs', 'piccadilly-emarsys-audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '90d',
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
      filename: path.join('logs', 'orders-logs-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '30d',
      level: 'info',
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
      filename: path.join('logs', 'product-logs-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '30d',
      level: 'info',
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
      filename: path.join('logs', 'clients-logs-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '30d',
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
  logHelpers,
};
