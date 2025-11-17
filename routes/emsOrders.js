const express = require('express');
const router = express.Router();
const emsOrdersService = require('../services/emsOrdersService');
const OrderSyncHelper = require('../helpers/orderSyncHelper');


/**
 * @route POST /api/ems-orders/fetch-and-store
 * @access Public
 */
router.post('/fetch-and-store', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate e endDate são obrigatórios',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`📅 [ROUTE] Buscando e armazenando pedidos de ${startDate} até ${endDate}...`);
    
    const result = await emsOrdersService.fetchAndStoreOrders(startDate, endDate);
    
    res.json({
      success: result.success,
      message: result.message || 'Operação concluída',
      stored: result.stored || 0,
      totalFound: result.totalFound || 0,
      pendingOrderIds: result.pendingOrders ? result.pendingOrders.map(order => order.order || order.orderId).filter(Boolean) : [],
      error: result.error || null,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [ROUTE] Erro ao buscar e armazenar pedidos:', error?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});


/**
 * @route POST /api/ems-orders/sync-flow
 * @desc Executa o fluxo completo de sincronização: busca pedidos com isSync=false e os marca como sincronizados
 * @access Public
 */
router.post('/sync-flow', async (req, res) => {
  try {
    console.log('🚀 [ROUTE] Iniciando fluxo de sincronização...');
    
    const appKey = req.query.appKey || req.get('X-VTEX-API-AppKey') || process.env.VTEX_APP_KEY;
    const appToken = req.query.appToken || req.get('X-VTEX-API-AppToken') || process.env.VTEX_APP_TOKEN;

    if (!appKey || !appToken) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetros appKey e appToken são obrigatórios',
        timestamp: new Date().toISOString()
      });
    }

    const headers = {
      'X-VTEX-API-AppKey': appKey,
      'X-VTEX-API-AppToken': appToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Inicializa o OrderSyncHelper
    const orderSyncHelper = new OrderSyncHelper(
      emsOrdersService.vtexBaseUrl, 
      emsOrdersService.entity, 
      () => headers
    );

    // Executa o fluxo de sincronização
    const result = await orderSyncHelper.processSyncFlow(headers);

    console.log(`📊 [ROUTE] Fluxo de sincronização concluído:`, result);

    res.json({
      success: result.success,
      message: `Sincronização concluída: ${result.updated} pedidos atualizados, ${result.errors} erros de ${result.total} processados`,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [ROUTE] Erro no fluxo de sincronização:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
