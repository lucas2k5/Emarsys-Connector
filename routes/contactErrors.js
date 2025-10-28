const express = require('express');
const router = express.Router();
const ContactErrorMonitor = require('../utils/contactErrorMonitor');

console.log('ContactErrors routes loaded');

/**
 * @route GET /api/contact-errors/stats
 * @desc Obtém estatísticas de erros de contatos
 * @access Public
 */
router.get('/stats', async (req, res) => {
  try {
    const errorMonitor = new ContactErrorMonitor();
    const stats = await errorMonitor.getErrorStats();
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/contact-errors/recent
 * @desc Obtém erros recentes de contatos
 * @access Public
 */
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const errorMonitor = new ContactErrorMonitor();
    const recentErrors = await errorMonitor.getRecentErrors(limit);
    
    res.json({
      success: true,
      data: {
        errors: recentErrors,
        count: recentErrors.length,
        limit
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao obter erros recentes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/contact-errors/analysis
 * @desc Obtém análise de padrões de erro
 * @access Public
 */
router.get('/analysis', async (req, res) => {
  try {
    const errorMonitor = new ContactErrorMonitor();
    const analysis = await errorMonitor.analyzeErrorPatterns();
    
    if (!analysis) {
      return res.status(500).json({
        success: false,
        error: 'Erro ao analisar padrões de erro',
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      data: analysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao analisar padrões:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/contact-errors/cleanup
 * @desc Limpa logs antigos de erro
 * @access Public
 */
router.post('/cleanup', async (req, res) => {
  try {
    const daysToKeep = parseInt(req.body.daysToKeep) || 7;
    const errorMonitor = new ContactErrorMonitor();
    await errorMonitor.cleanupOldLogs(daysToKeep);
    
    res.json({
      success: true,
      message: `Logs antigos removidos (mantendo últimos ${daysToKeep} dias)`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao limpar logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/contact-errors/health
 * @desc Verifica saúde do sistema de monitoramento de erros
 * @access Public
 */
router.get('/health', async (req, res) => {
  try {
    const errorMonitor = new ContactErrorMonitor();
    const stats = await errorMonitor.getErrorStats();
    const recentErrors = await errorMonitor.getRecentErrors(10);
    
    // Calcula métricas de saúde
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const recentErrorCount = recentErrors.filter(e => 
      new Date(e.timestamp) > oneHourAgo
    ).length;
    
    const healthStatus = {
      status: 'healthy',
      totalErrors: stats.totalErrors,
      recentErrors: recentErrorCount,
      retryableRate: stats.totalErrors > 0 ? 
        ((stats.retryableErrors / stats.totalErrors) * 100).toFixed(2) : 0,
      lastUpdated: stats.lastUpdated,
      recommendations: []
    };
    
    // Adiciona recomendações baseadas na saúde
    if (recentErrorCount > 10) {
      healthStatus.status = 'warning';
      healthStatus.recommendations.push('Alto número de erros recentes detectado');
    }
    
    if (parseFloat(healthStatus.retryableRate) > 50) {
      healthStatus.status = 'warning';
      healthStatus.recommendations.push('Alta taxa de erros retryable');
    }
    
    if (recentErrorCount > 50) {
      healthStatus.status = 'critical';
      healthStatus.recommendations.push('Número crítico de erros recentes');
    }
    
    res.json({
      success: true,
      data: healthStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao verificar saúde:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
