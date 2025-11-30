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
 * @route POST /api/cron/cleanup-exports
 * @desc Limpa arquivos antigos da pasta exports (semana anterior)
 * @access Public
 */
router.post('/cleanup-exports', async (req, res) => {
  try {
    console.log('🕐 [Local Cron] Iniciando limpeza de exports...');
    
    const ExportsCleanup = require('../scripts/cleanup-old-exports');
    const cleanup = new ExportsCleanup();
    
    const result = await cleanup.cleanup();
    
    if (result.success) {
      res.json({
        ...result,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        ...result,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ Erro ao executar cleanup-exports:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/cron/cleanup-month
 * @desc Limpa arquivos de um mês específico (formato: YYYY-MM)
 * @access Public
 */
router.post('/cleanup-month', async (req, res) => {
  try {
    const { yearMonth } = req.body;
    
    if (!yearMonth || !yearMonth.match(/^\d{4}-\d{2}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetro yearMonth é obrigatório (formato: YYYY-MM)',
        example: { yearMonth: '2025-10' },
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🕐 [Local Cron] Limpando arquivos do mês: ${yearMonth}`);
    
    const ExportsCleanup = require('../scripts/cleanup-old-exports');
    const cleanup = new ExportsCleanup();
    
    const result = await cleanup.cleanupByMonth(yearMonth);
    
    if (result.success) {
      res.json({
        ...result,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        ...result,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ Erro ao executar cleanup-month:', error);
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
      'POST /api/cron/cleanup-exports': 'Limpeza de arquivos antigos (semana anterior)',
      'POST /api/cron/cleanup-month': 'Limpeza de arquivos de um mês específico'
    },
    timestamp: new Date().toISOString()
  });
});



module.exports = router;
