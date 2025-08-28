const express = require('express');
const router = express.Router();
const syncService = require('../utils/syncService');


/**
 * @route POST /api/cron/sync-orders
 * @desc Executa sincronização de orders (simula cron job)
 * @access Public
 */
router.post('/sync-orders', async (req, res) => {
  try {
    console.log('🕐 [Local Cron] Iniciando sincronização de orders...');
    
    const result = await syncService.executeOrdersSync();
    
    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro ao executar sync-orders:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/cron/sync-orders-batched
 * @desc Executa sincronização combinada de orders e produtos (simula cron job)
 * @access Public
 */
router.post('/sync-orders-batched', async (req, res) => {
  try {
    console.log('🕐 [Local Cron] Iniciando sincronização combinada...');
    
    const result = await syncService.executeFullSync();
    
    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro ao executar sync-orders-batched:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      orders: { total: 0, success: false },
      products: { total: 0, success: false },
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/cron/sync-products
 * @desc Executa sincronização de produtos (simula cron job)
 * @access Public
 */
router.post('/sync-products', async (req, res) => {
  try {
    console.log('🕐 [Local Cron] Iniciando sincronização de produtos...');
    
    const result = await syncService.executeProductsSync();
    
    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro ao executar sync-products:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/cron/products-csv
 * @desc Gera CSV de produtos (simula cron job)
 * @access Public
 */
router.post('/products-csv', async (req, res) => {
  try {
    console.log('🕐 [Local Cron] Gerando CSV de produtos...');
    
    const result = await syncService.generateProductsCsv();
    
    if (!result.success) {
      return res.status(404).json({
        ...result,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro ao gerar CSV de produtos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/cron/status
 * @desc Obtém status dos cron jobs do Vercel
 * @access Public
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Cron jobs gerenciados pelo Vercel',
    endpoints: {
      'POST /api/cron/sync-orders': 'Sincronização de orders',
      'POST /api/cron/sync-orders-batched': 'Sincronização combinada (orders + produtos)',
      'POST /api/cron/sync-products': 'Sincronização de produtos',
      'POST /api/cron/products-csv': 'Geração de CSV de produtos'
    },
    vercelSchedules: {
      'sync-orders-batched': '0 */10 * * * (a cada 10 horas)',
      'sync-orders': '0 */12 * * * (a cada 12 horas)',
      'sync-products': '0 */14 * * * (a cada 14 horas)',
      'products-csv': '15 * * * * (a cada hora, 15 minutos)'
    },
    timestamp: new Date().toISOString()
  });
});



module.exports = router;
