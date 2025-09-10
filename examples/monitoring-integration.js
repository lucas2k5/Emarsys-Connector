/**
 * EXEMPLO DE INTEGRAÇÃO DO SISTEMA DE MONITORAMENTO
 * 
 * Este arquivo demonstra como integrar o sistema de logging,
 * métricas e alertas em suas rotas existentes.
 */

const express = require('express');
const router = express.Router();

// Importar sistema de monitoramento
const { logger, logHelpers } = require('../utils/logger');
const { metricsHelpers } = require('../utils/metrics');
const { monitorAsyncOperation, monitorIntegration, monitorFileProcessing } = require('../utils/monitoring');
const alertManager = require('../utils/alerts');

// Exemplo 1: Rota simples com logging básico
router.get('/example-simple', async (req, res) => {
  try {
    // Log de início da operação
    logger.info('Iniciando operação simples', {
      requestId: req.requestId,
      userAgent: req.get('User-Agent')
    });

    // Simular operação
    const result = { message: 'Operação concluída com sucesso' };

    // Log de sucesso
    logger.info('Operação simples concluída', {
      requestId: req.requestId,
      result
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Log de erro
    logHelpers.logError(error, {
      requestId: req.requestId,
      operation: 'example-simple'
    });

    res.status(500).json({
      success: false,
      error: error.message,
      requestId: req.requestId
    });
  }
});

// Exemplo 2: Operação assíncrona com monitoramento
router.post('/example-async', async (req, res) => {
  try {
    const { data } = req.body;

    // Monitorar operação assíncrona
    const result = await monitorAsyncOperation('example-async-operation', async () => {
      // Simular processamento pesado
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simular possível erro
      if (Math.random() < 0.1) {
        throw new Error('Erro simulado na operação');
      }

      return {
        processed: data.length,
        timestamp: new Date().toISOString()
      };
    }, {
      dataSize: data?.length || 0,
      userId: req.user?.id || 'anonymous'
    });

    // Registrar métrica de negócio
    metricsHelpers.recordContactsProcessed(result.processed, 'success', 'example');

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Registrar métrica de erro
    metricsHelpers.recordContactsProcessed(0, 'error', 'example');

    // Gerar alerta se for erro crítico
    if (error.message.includes('crítico')) {
      alertManager.registerAlert(
        'critical_operation_error',
        'critical',
        `Erro crítico na operação: ${error.message}`,
        {
          requestId: req.requestId,
          operation: 'example-async',
          dataSize: req.body.data?.length || 0
        }
      );
    }

    res.status(500).json({
      success: false,
      error: error.message,
      requestId: req.requestId
    });
  }
});

// Exemplo 3: Integração com API externa
router.post('/example-integration', async (req, res) => {
  try {
    const { contacts } = req.body;

    // Monitorar integração com API externa
    const result = await monitorIntegration('emarsys', 'contacts', async () => {
      // Simular chamada para API externa
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simular resposta da API
      return {
        imported: contacts.length,
        failed: 0,
        apiResponse: 'success'
      };
    }, {
      contactCount: contacts.length,
      source: 'api'
    });

    // Registrar métricas de integração
    metricsHelpers.recordIntegrationCall('emarsys', 'contacts', 'success', 2000);
    metricsHelpers.recordContactsImported(result.imported, 'success', 'api-import');

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Registrar métricas de erro
    metricsHelpers.recordIntegrationCall('emarsys', 'contacts', 'error', 0);
    metricsHelpers.recordContactsImported(0, 'error', 'api-import');

    // Gerar alerta para falha de integração
    alertManager.registerAlert(
      'integration_failure',
      'high',
      `Falha na integração com Emarsys: ${error.message}`,
      {
        requestId: req.requestId,
        service: 'emarsys',
        endpoint: 'contacts',
        contactCount: req.body.contacts?.length || 0
      }
    );

    res.status(500).json({
      success: false,
      error: error.message,
      requestId: req.requestId
    });
  }
});

// Exemplo 4: Processamento de arquivo
router.post('/example-file-processing', async (req, res) => {
  try {
    const { fileName, fileType } = req.body;

    // Monitorar processamento de arquivo
    const result = await monitorFileProcessing(fileType, fileName, async () => {
      // Simular processamento de arquivo
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Simular análise do arquivo
      const fileSize = Math.floor(Math.random() * 1000000); // 0-1MB
      
      return {
        processed: Math.floor(Math.random() * 1000),
        fileSize,
        duration: 3000
      };
    }, {
      fileName,
      fileType,
      source: 'upload'
    });

    // Registrar métricas de arquivo
    metricsHelpers.recordFileProcessed(fileType, 'success', result.fileSize);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Registrar métricas de erro
    metricsHelpers.recordFileProcessed(req.body.fileType || 'unknown', 'error', 0);

    res.status(500).json({
      success: false,
      error: error.message,
      requestId: req.requestId
    });
  }
});

// Exemplo 5: Job em background
router.post('/example-background-job', async (req, res) => {
  try {
    const { jobType, data } = req.body;

    // Iniciar job em background (não aguardar conclusão)
    setImmediate(async () => {
      try {
        // Simular job em background
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Simular processamento
        const processed = Math.floor(Math.random() * 100);
        
        // Registrar métricas do job
        metricsHelpers.recordBackgroundJob(jobType, 'success', 5000);
        
        logger.info('Job em background concluído', {
          jobType,
          processed,
          duration: 5000
        });
      } catch (error) {
        // Registrar métricas de erro
        metricsHelpers.recordBackgroundJob(jobType, 'error', 0);
        
        // Gerar alerta para falha de job
        alertManager.registerAlert(
          'background_job_failure',
          'medium',
          `Falha no job em background: ${error.message}`,
          {
            jobType,
            error: error.message
          }
        );
      }
    });

    res.json({
      success: true,
      message: 'Job em background iniciado',
      jobType,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      requestId: req.requestId
    });
  }
});

// Exemplo 6: Rota com validação e auditoria
router.post('/example-audit', async (req, res) => {
  try {
    const { action, data } = req.body;
    const userId = req.user?.id || 'anonymous';

    // Log de auditoria
    logHelpers.logAudit(action, userId, {
      requestId: req.requestId,
      dataSize: data?.length || 0,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Validar dados
    if (!action || !data) {
      throw new Error('Ação e dados são obrigatórios');
    }

    // Simular operação
    const result = {
      action,
      processed: data.length,
      userId,
      timestamp: new Date().toISOString()
    };

    // Registrar métrica de auditoria
    metricsHelpers.recordContactsProcessed(data.length, 'success', 'audit');

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Log de erro de auditoria
    logHelpers.logAudit('error', req.user?.id || 'anonymous', {
      requestId: req.requestId,
      error: error.message,
      action: req.body.action
    });

    res.status(400).json({
      success: false,
      error: error.message,
      requestId: req.requestId
    });
  }
});

// Exemplo 7: Rota com verificação de saúde
router.get('/example-health', async (req, res) => {
  try {
    // Verificar métricas do sistema
    const memUsage = process.memoryUsage();
    const memUsagePercent = memUsage.heapUsed / memUsage.heapTotal;

    // Gerar alerta se uso de memória estiver alto
    if (memUsagePercent > 0.8) {
      alertManager.registerAlert(
        'high_memory_usage',
        'high',
        `Uso de memória alto: ${(memUsagePercent * 100).toFixed(2)}%`,
        {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          rss: memUsage.rss
        }
      );
    }

    const health = {
      status: 'healthy',
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        usagePercent: Math.round(memUsagePercent * 100) + '%'
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      requestId: req.requestId
    });
  }
});

module.exports = router;
