const { logHelpers } = require('./logger');
const { metricsHelpers } = require('./metrics');
const alertManager = require('./alerts');

// Middleware para monitoramento completo de requisições
const monitoringMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const startMemory = process.memoryUsage();
  
  // Adicionar ID único para rastreamento
  req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Log de início da requisição
  logHelpers.logRequest(req, res, 0, {
    requestId: req.requestId,
    memoryBefore: startMemory,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer'),
  });

  // Interceptar o método send para capturar métricas
  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function (body) {
    const duration = Date.now() - startTime;
    const endMemory = process.memoryUsage();
    const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
    
    // Registrar métricas
    metricsHelpers.recordHttpRequest(req.method, req.route?.path || req.path, res.statusCode, duration);
    
    // Log de fim da requisição
    logHelpers.logRequest(req, res, duration, {
      requestId: req.requestId,
      memoryAfter: endMemory,
      memoryDelta,
      responseSize: Buffer.byteLength(body || '', 'utf8'),
    });

    // Log de performance se a requisição demorou muito
    if (duration > 5000) { // 5 segundos
      logHelpers.logPerformance('slow_request', duration, {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
      });
      
      // Gerar alerta para requisições lentas
      alertManager.checkResponseTime(duration);
    }

    originalSend.call(this, body);
  };

  res.json = function (obj) {
    const duration = Date.now() - startTime;
    const endMemory = process.memoryUsage();
    const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
    
    // Registrar métricas
    metricsHelpers.recordHttpRequest(req.method, req.route?.path || req.path, res.statusCode, duration);
    
    // Log de fim da requisição
    logHelpers.logRequest(req, res, duration, {
      requestId: req.requestId,
      memoryAfter: endMemory,
      memoryDelta,
      responseSize: Buffer.byteLength(JSON.stringify(obj || {}), 'utf8'),
    });

    originalJson.call(this, obj);
  };

  next();
};

// Middleware para capturar erros
const errorMonitoringMiddleware = (err, req, res, next) => {
  const duration = Date.now() - (req.startTime || Date.now());
  
  // Log do erro
  logHelpers.logError(err, {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    duration,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  });

  // Registrar métrica de erro
  metricsHelpers.recordHttpRequest(req.method, req.route?.path || req.path, res.statusCode || 500, duration);

  // Gerar alerta para erros críticos
  if (res.statusCode >= 500) {
    alertManager.registerAlert(
      'server_error',
      'high',
      `Erro interno do servidor: ${err.message}`,
      {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        error: err.message,
      }
    );
  }

  next(err);
};

// Função para monitorar operações assíncronas
const monitorAsyncOperation = async (operationName, operation, context = {}) => {
  const startTime = Date.now();
  const startMemory = process.memoryUsage();
  
  try {
    logHelpers.logPerformance(operationName, 0, {
      ...context,
      status: 'started',
      memoryBefore: startMemory,
    });

    const result = await operation();
    
    const duration = Date.now() - startTime;
    const endMemory = process.memoryUsage();
    
    logHelpers.logPerformance(operationName, duration, {
      ...context,
      status: 'completed',
      memoryAfter: endMemory,
      memoryDelta: endMemory.heapUsed - startMemory.heapUsed,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logHelpers.logError(error, {
      operation: operationName,
      duration,
      ...context,
    });

    throw error;
  }
};

// Função para monitorar integrações externas
const monitorIntegration = async (service, endpoint, operation, context = {}) => {
  const startTime = Date.now();
  
  try {
    logHelpers.logIntegration(service, endpoint, 'started', context);
    
    const result = await operation();
    
    const duration = Date.now() - startTime;
    
    logHelpers.logIntegration(service, endpoint, 'completed', {
      ...context,
      duration,
    });

    // Registrar métricas
    metricsHelpers.recordIntegrationCall(service, endpoint, 'success', duration);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logHelpers.logIntegration(service, endpoint, 'error', {
      ...context,
      duration,
      error: error.message,
    });

    // Registrar métricas de erro
    metricsHelpers.recordIntegrationCall(service, endpoint, 'error', duration);
    
    throw error;
  }
};

// Função para monitorar jobs em background
const monitorBackgroundJob = async (jobType, job, context = {}) => {
  const startTime = Date.now();
  
  try {
    logHelpers.logPerformance(`background_job_${jobType}`, 0, {
      ...context,
      status: 'started',
    });

    const result = await job();
    
    const duration = Date.now() - startTime;
    
    logHelpers.logPerformance(`background_job_${jobType}`, duration, {
      ...context,
      status: 'completed',
    });

    // Registrar métricas
    metricsHelpers.recordBackgroundJob(jobType, 'success', duration);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logHelpers.logError(error, {
      jobType,
      duration,
      ...context,
    });

    // Registrar métricas de erro
    metricsHelpers.recordBackgroundJob(jobType, 'error', duration);
    
    throw error;
  }
};

// Função para monitorar processamento de arquivos
const monitorFileProcessing = async (fileType, fileName, operation, context = {}) => {
  const startTime = Date.now();
  const fs = require('fs');
  const path = require('path');
  
  let fileSize = 0;
  try {
    const filePath = path.join(process.cwd(), 'exports', fileName);
    const stats = fs.statSync(filePath);
    fileSize = stats.size;
  } catch (error) {
    // Arquivo pode não existir ainda
  }

  try {
    logHelpers.logPerformance(`file_processing_${fileType}`, 0, {
      ...context,
      fileName,
      fileSize,
      status: 'started',
    });

    const result = await operation();
    
    const duration = Date.now() - startTime;
    
    logHelpers.logPerformance(`file_processing_${fileType}`, duration, {
      ...context,
      fileName,
      fileSize,
      status: 'completed',
    });

    // Registrar métricas
    metricsHelpers.recordFileProcessed(fileType, 'success', fileSize);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logHelpers.logError(error, {
      fileType,
      fileName,
      fileSize,
      duration,
      ...context,
    });

    // Registrar métricas de erro
    metricsHelpers.recordFileProcessed(fileType, 'error', fileSize);
    
    throw error;
  }
};

// Função para monitorar operações de banco de dados (simulado)
const monitorDatabaseOperation = async (operation, table, context = {}) => {
  const startTime = Date.now();
  
  try {
    logHelpers.logPerformance(`db_${operation}`, 0, {
      ...context,
      table,
      status: 'started',
    });

    const result = await operation();
    
    const duration = Date.now() - startTime;
    
    logHelpers.logPerformance(`db_${operation}`, duration, {
      ...context,
      table,
      status: 'completed',
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logHelpers.logError(error, {
      operation,
      table,
      duration,
      ...context,
    });
    
    throw error;
  }
};

module.exports = {
  monitoringMiddleware,
  errorMonitoringMiddleware,
  monitorAsyncOperation,
  monitorIntegration,
  monitorBackgroundJob,
  monitorFileProcessing,
  monitorDatabaseOperation,
};
