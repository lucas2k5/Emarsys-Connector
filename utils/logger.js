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
  alert: 'red'
};

winston.addColors(colors);

// Formato personalizado para timestamp brasileiro
const brazilianTimestamp = winston.format.timestamp({
  format: () => getBrazilianTimestamp()
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
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`;
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
  logHelpers,
};
