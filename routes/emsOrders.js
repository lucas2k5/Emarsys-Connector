const express = require('express');
const router = express.Router();
const emsOrdersService = require('../services/emsOrdersService');
const { searchOrders } = require('../utils/mdSearch');

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
    console.error('❌ [ROUTE] Erro ao listar pedidos pendentes:', error?.data || error.message);
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
    console.error('❌ [ROUTE] Erro ao buscar e armazenar pedidos:', error?.data || error.message);
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
    console.error('❌ [ROUTE] Erro ao obter estatísticas:', error?.data || error.message);
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
    console.error('❌ [ROUTE] Erro ao testar conexão:', error?.data || error.message);
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
    console.error('❌ [ROUTE] Erro ao testar validação:', error?.data || error.message);
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
    console.error('❌ [ROUTE] Erro ao testar busca:', error?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para testar edição de um registro específico
router.post('/test-edit-single', async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId é obrigatório',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🔍 [ROUTE] Testando edição de registro específico: ${orderId}`);
    
    // 1. Busca o registro na emsOrdersV2
    console.log('📋 Buscando registro na emsOrdersV2...');
    const searchResult = await emsOrdersService.searchEmsOrdersV2ByOrder(orderId);
    
    if (!searchResult.success || searchResult.data.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Registro não encontrado para orderId: ${orderId}`,
        searchResult,
        timestamp: new Date().toISOString()
      });
    }
    
    const record = searchResult.data[0];
    console.log('📋 Registro encontrado:', {
      id: record.id,
      order: record.order,
      isSync: record.isSync,
      email: record.email
    });
    
    // 2. Tenta editar via endpoint customizado
    console.log('🔄 Tentando editar via endpoint customizado...');
    try {
      const axios = require('axios');
      const updateUrl = `${process.env.VTEX_BASE_URL}/_v/orders/${orderId}`;
      
      console.log('🔗 URL do endpoint:', updateUrl);
      console.log('🔑 Headers:', {
        'Content-Type': 'application/json',
        'VtexIdclientAutCookie': process.env.VTEX_AUTH_TOKEN ? '***TOKEN_SET***' : 'TOKEN_NOT_SET'
      });
      
      const updateResponse = await axios.patch(updateUrl, {
        isSync: true,
        updatedAt: new Date().toISOString()
      }, {
        headers: {
          'Content-Type': 'application/json',
          'VtexIdclientAutCookie': process.env.VTEX_AUTH_TOKEN
        },
        timeout: 10000
      });
      
      console.log('✅ Sucesso na edição via endpoint:', {
        status: updateResponse.status,
        data: updateResponse.data
      });
      
      res.json({
        success: true,
        message: 'Edição via endpoint customizado bem-sucedida',
        orderId,
        record,
        updateResponse: {
          status: updateResponse.status,
          data: updateResponse.data
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (endpointError) {
      console.error('❌ Erro no endpoint customizado:', {
        message: endpointError.message,
        status: endpointError.response?.status,
        statusText: endpointError.response?.statusText,
        data: endpointError.response?.data,
        url: endpointError.config?.url,
        method: endpointError.config?.method
      });
      
      // 3. Tenta editar via Master Data API como fallback
      console.log('🔄 Tentando editar via Master Data API como fallback...');
      try {
        const masterDataResult = await emsOrdersService.updateEmsOrdersV2MasterData(record.id, { isSync: true });
        
        console.log('✅ Sucesso na edição via Master Data:', masterDataResult);
        
        res.json({
          success: true,
          message: 'Edição via Master Data API bem-sucedida (fallback)',
          orderId,
          record,
          endpointError: {
            message: endpointError.message,
            status: endpointError.response?.status,
            data: endpointError.response?.data
          },
          masterDataResult,
          timestamp: new Date().toISOString()
        });
        
      } catch (masterDataError) {
        console.error('❌ Erro também no Master Data:', masterDataError);
        
        res.status(500).json({
          success: false,
          error: 'Falha em ambos os métodos de edição',
          orderId,
          record,
          endpointError: {
            message: endpointError.message,
            status: endpointError.response?.status,
            data: endpointError.response?.data,
            url: endpointError.config?.url
          },
          masterDataError: {
            message: masterDataError.message,
            status: masterDataError.response?.status,
            data: masterDataError.response?.data
          },
          timestamp: new Date().toISOString()
        });
      }
    }
    
  } catch (error) {
    console.error('❌ [ROUTE] Erro geral no teste de edição:', error?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// module.exports moved to bottom to ensure routes below are registered

/**
 * @route GET /api/ems-orders/scroll
 * @desc Proxy do VTEX MD Scroll enviando body x-www-form-urlencoded via GET
 *       Headers (AppKey/AppToken) vêm via query params para este teste.
 *       Ex.: /api/ems-orders/scroll?appKey=XXX&appToken=YYY
 * @access Public (não enviar chaves reais em produção)
 */
router.get('/scroll', async (req, res) => {
  try {
    console.log('🔎 [ROUTE] /api/ems-orders/scroll called');
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
      'X-VTEX-API-AppToken': appToken
    };

    const params = {
    _where: req.query.where,
      _fields: req.query.fields,
      _sort: req.query.sort,
      _page: req.query.page || '1',
      _perPage: req.query.perPage || '100'
    };

    const json = await searchOrders(headers, params);

    return res.status(200).json(json);
  } catch (err) {
    console.error('❌ [ROUTE] Erro no scroll:', err?.data || err.message);
    return res.status(502).json({
      success: false,
      error: err.message.data || 'Erro ao consultar VTEX MD scroll',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
