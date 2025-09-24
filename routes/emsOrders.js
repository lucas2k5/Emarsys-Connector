const express = require('express');
const router = express.Router();
const emsOrdersService = require('../services/emsOrdersService');

/**
 * @route POST /api/ems-orders/reprocess-unsent
 * @desc Reprocessa pedidos não enviados para Emarsys
 * @access Public
 */
router.post('/reprocess-unsent', async (req, res) => {
  try {
    console.log('🔄 [ROUTE] Iniciando reprocessamento de pedidos não enviados...');
    
    const result = await emsOrdersService.reprocessUnsentOrders();
    
    res.json({
      success: result.success,
      message: result.message || 'Reprocessamento concluído',
      processed: result.processed || 0,
      failed: result.failed || 0,
      details: result.details || null,
      error: result.error || null,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [ROUTE] Erro ao reprocessar pedidos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/ems-orders/process-pending
 * @desc Processa pedidos pendentes de sincronização
 * @access Public
 */
router.post('/process-pending', async (req, res) => {
  try {
    console.log('🔄 [ROUTE] Processando pedidos pendentes...');
    
    const result = await emsOrdersService.processPendingOrders();
    
    res.json({
      success: result.success,
      message: result.message || 'Processamento concluído',
      sent: result.sent || 0,
      failed: result.failed || 0,
      details: result.details || null,
      error: result.error || null,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [ROUTE] Erro ao processar pedidos pendentes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/ems-orders/pending
 * @desc Lista pedidos pendentes de sincronização
 * @access Public
 */
router.get('/pending', async (req, res) => {
  try {
    console.log('📋 [ROUTE] Listando pedidos pendentes...');
    
    const pending = await emsOrdersService.listEmsOrdersV2PendingSync();
    
    // Retorna apenas os orderIds
    const orderIds = pending.map(order => order.order || order.orderId).filter(Boolean);
    
    res.json({
      success: true,
      total: orderIds.length,
      pendingOrderIds: orderIds,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [ROUTE] Erro ao listar pedidos pendentes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/ems-orders/fetch-and-store
 * @desc Busca pedidos da VTEX e armazena na emsOrdersV2
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
    console.error('❌ [ROUTE] Erro ao buscar e armazenar pedidos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/ems-orders/stats
 * @desc Obtém estatísticas dos pedidos
 * @access Public
 */
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 [ROUTE] Obtendo estatísticas dos pedidos...');
    
    const pending = await emsOrdersService.listEmsOrdersV2PendingSync();
    
    res.json({
      success: true,
      stats: {
        totalPending: pending.length,
        pendingByDate: pending.reduce((acc, order) => {
          const date = order.timestamp ? new Date(order.timestamp).toISOString().split('T')[0] : 'unknown';
          acc[date] = (acc[date] || 0) + 1;
          return acc;
        }, {}),
        oldestPending: pending.length > 0 ? Math.min(...pending.map(o => new Date(o.timestamp || 0).getTime())) : null,
        newestPending: pending.length > 0 ? Math.max(...pending.map(o => new Date(o.timestamp || 0).getTime())) : null
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [ROUTE] Erro ao obter estatísticas:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/ems-orders/test-connection
 * @desc Testa a conexão com a entidade emsOrdersV2
 * @access Public
 */
router.get('/test-connection', async (req, res) => {
  try {
    console.log('🔍 [ROUTE] Testando conexão com emsOrdersV2...');
    
    const pending = await emsOrdersService.listEmsOrdersV2PendingSync();
    
    res.json({
      success: true,
      message: 'Conexão com emsOrdersV2 funcionando',
      totalRecords: pending.length,
      sampleRecord: pending.length > 0 ? pending[0] : null,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [ROUTE] Erro ao testar conexão:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Erro ao conectar com emsOrdersV2',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/ems-orders/test-order-validation
 * @desc Testa a validação de orderId
 * @access Public
 */
router.post('/test-order-validation', async (req, res) => {
  try {
    const { orderIds } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds)) {
      return res.status(400).json({
        success: false,
        error: 'orderIds deve ser um array',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('🔍 [ROUTE] Testando validação de orderIds...');
    
    const results = orderIds.map(orderId => {
      // Aplica a mesma lógica de validação do vtexOrdersService
      const isMarketplacePattern = /^[a-zA-Z]|^marketplace|^MP|^shopee|^mercadolivre|^amazon/i;
      const hasNumbers = /\d/.test(orderId);
      
      const isMarketplace = isMarketplacePattern.test(orderId) || !hasNumbers;
      
      return {
        orderId,
        isValid: !isMarketplace,
        isMarketplace,
        hasNumbers,
        reason: isMarketplace ? 'marketplace_order_pattern' : 'valid'
      };
    });
    
    res.json({
      success: true,
      message: 'Teste de validação concluído',
      results,
      summary: {
        total: orderIds.length,
        valid: results.filter(r => r.isValid).length,
        marketplace: results.filter(r => r.isMarketplace).length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [ROUTE] Erro ao testar validação:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/ems-orders/test-order-lookup
 * @desc Testa a busca de pedidos na emsOrdersV2
 * @access Public
 */
router.post('/test-order-lookup', async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId é obrigatório',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🔍 [ROUTE] Testando busca do pedido ${orderId} na emsOrdersV2...`);
    
    const pending = await emsOrdersService.listEmsOrdersV2PendingSync();
    const foundOrder = pending.find(o => o.order === orderId || o.orderId === orderId || o.id === orderId);
    
    res.json({
      success: true,
      message: 'Teste de busca concluído',
      orderId,
      totalRecords: pending.length,
      found: !!foundOrder,
      orderData: foundOrder || null,
      sampleRecords: pending.slice(0, 3).map(o => ({
        order: o.order,
        email: o.email,
        item: o.item,
        price: o.price
      })),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [ROUTE] Erro ao testar busca:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
