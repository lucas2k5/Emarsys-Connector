const express = require('express');
const router = express.Router();

// Middleware para log de requisições
router.use((req, res, next) => {
  console.log(`🔧 [Cron Management] ${req.method} ${req.path}`);
  next();
});

// GET /api/cron-management/status
// Retorna o status de todos os cron jobs
router.get('/status', (req, res) => {
  try {
    // Acessar a instância do cronService do server.js
    const cronService = req.app.get('cronService');
    
    if (!cronService) {
      return res.status(500).json({
        success: false,
        error: 'Serviço de cron não foi inicializado'
      });
    }

    const status = cronService.getStatus();
    
    res.json({
      success: true,
      status: 'active',
      provider: 'Node.js Native Cron',
      jobs: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao obter status dos cron jobs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/cron-management/start/:jobName
// Inicia um cron job específico
router.post('/start/:jobName', (req, res) => {
  try {
    const { jobName } = req.params;
    const cronService = req.app.get('cronService');
    
    if (!cronService) {
      return res.status(500).json({
        success: false,
        error: 'Serviço de cron não foi inicializado'
      });
    }

    const result = cronService.startJob(jobName);
    
    if (result) {
      res.json({
        success: true,
        message: `Cron job ${jobName} iniciado com sucesso`,
        jobName,
        action: 'started',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Cron job ${jobName} não encontrado`,
        jobName,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error(`❌ Erro ao iniciar cron job ${req.params.jobName}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      jobName: req.params.jobName,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/cron-management/stop/:jobName
// Para um cron job específico
router.post('/stop/:jobName', (req, res) => {
  try {
    const { jobName } = req.params;
    const cronService = req.app.get('cronService');
    
    if (!cronService) {
      return res.status(500).json({
        success: false,
        error: 'Serviço de cron não foi inicializado'
      });
    }

    const result = cronService.stopJob(jobName);
    
    if (result) {
      res.json({
        success: true,
        message: `Cron job ${jobName} parado com sucesso`,
        jobName,
        action: 'stopped',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Cron job ${jobName} não encontrado`,
        jobName,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error(`❌ Erro ao parar cron job ${req.params.jobName}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      jobName: req.params.jobName,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/cron-management/restart-all
// Reinicia todos os cron jobs
router.post('/restart-all', (req, res) => {
  try {
    const cronService = req.app.get('cronService');
    
    if (!cronService) {
      return res.status(500).json({
        success: false,
        error: 'Serviço de cron não foi inicializado'
      });
    }

    // Para todos os jobs
    cronService.stopAll();
    
    // Aguarda um pouco
    setTimeout(() => {
      // Inicia todos os jobs novamente
      cronService.startAll();
    }, 1000);
    
    res.json({
      success: true,
      message: 'Todos os cron jobs foram reiniciados',
      action: 'restart-all',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao reiniciar cron jobs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
