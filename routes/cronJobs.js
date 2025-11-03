const express = require('express');
const router = express.Router();
const syncService = require('../utils/syncService');


/**
 * @route POST /api/cron/sync-orders
 * @desc Executa sincronização de orders (simula cron job)
 * @access Public
 * @deprecated Esta rota foi desabilitada - use /api/background/cron-orders (nova versão com SQLite)
 */
// router.post('/sync-orders', async (req, res) => {
//   try {
//     console.log('🕐 [Local Cron] Iniciando sincronização de orders...');
//     
//     const result = await syncService.executeOrdersSync();
//     
//     res.json({
//       ...result,
//       timestamp: new Date().toISOString()
//     });
//     
//   } catch (error) {
//     console.error('❌ Erro ao executar sync-orders:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       timestamp: new Date().toISOString()
//     });
//   }
// });

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
    message: 'Cron jobs gerenciados pelo servidor',
    endpoints: {
      // 'POST /api/cron/sync-orders': 'Sincronização de orders (DESABILITADA - use /api/background/cron-orders)',
      'POST /api/cron/sync-products': 'Sincronização de produtos',
      'POST /api/cron/products-csv': 'Geração de CSV de produtos',
      'POST /api/background/cron-orders': 'Sincronização de orders (NOVA - com SQLite)'
    },
    timestamp: new Date().toISOString()
  });
});



module.exports = router;
