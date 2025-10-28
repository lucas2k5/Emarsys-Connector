const express = require('express');
const router = express.Router();
const crashProtection = require('../utils/crashProtection');

/**
 * @route GET /api/crash-protection/stats
 * @desc Obtém estatísticas de proteção contra crashes
 * @access Public
 */
router.get('/stats', (req, res) => {
  try {
    const stats = crashProtection.getStats();
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/crash-protection/reset/:serviceName
 * @desc Reseta contador de crashes de um serviço
 * @access Public
 */
router.post('/reset/:serviceName', (req, res) => {
  try {
    const { serviceName } = req.params;
    crashProtection.resetCrashCount(serviceName);
    
    res.json({
      success: true,
      message: `Contador de crashes resetado para ${serviceName}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/crash-protection/reset-all
 * @desc Reseta todos os contadores de crashes
 * @access Public
 */
router.post('/reset-all', (req, res) => {
  try {
    const stats = crashProtection.getStats();
    for (const serviceName of Object.keys(stats)) {
      crashProtection.resetCrashCount(serviceName);
    }
    
    res.json({
      success: true,
      message: 'Todos os contadores de crashes foram resetados',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
