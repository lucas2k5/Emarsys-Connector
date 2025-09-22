const express = require('express');
const router = express.Router();
const IntegrationService = require('../services/integrationService');
const VtexOrdersService = require('../services/vtexOrdersService');
const { convertToBrazilianTime, getBrazilianTimestamp } = require('../utils/dateUtils');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// Simple in-memory job manager (non-persistent)
const jobs = new Map();
function createJob(type) {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id,
    type,
    status: 'queued', // queued | running | completed | failed
    progress: 0,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    error: null,
    result: null
  };
  jobs.set(id, job);
  return job;
}
function updateJob(id, updates) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, updates);
  jobs.set(id, job);
  return job;
}
function getJob(id) {
  return jobs.get(id);
}


const integrationService = new IntegrationService();


/**
 * @route GET /api/integration/sales-feed
 * @desc Processa o feed de vendas completo (VTEX -> Emarsys)
 * @access Public
 */
router.get('/sales-feed', async (req, res) => {
  try {
    // Parâmetros da query
    const twoYears = req.query['2y'] === 'true';
    const clientsOnly = req.query.cl === 'true';
    const startDate = req.query.startDate;
    const toDate = req.query.toDate;

    console.log('🚀 Iniciando feed de vendas (GET):', {
      twoYears,
      clientsOnly,
      startDate,
      toDate
    });

    // Processa o feed de vendas
    const result = await integrationService.processSalesFeed({
      twoYears,
      clientsOnly,
      startDate,
      toDate
    });

    res.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro no feed de vendas:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/integration/sales-feed
 * @desc Processa o feed de vendas via POST com body (para automação)
 * @access Public
 */
router.post('/sales-feed', async (req, res) => {
  try {
    const { twoYears, clientsOnly, startDate, toDate, ...otherOptions } = req.body;

    console.log('🚀 Iniciando feed de vendas (POST):', {
      twoYears,
      clientsOnly,
      startDate,
      toDate,
      otherOptions
    });

    // Processa o feed de vendas
    const result = await integrationService.processSalesFeed({
      twoYears,
      clientsOnly,
      startDate,
      toDate,
      ...otherOptions
    });

    res.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro no feed de vendas:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/integration/client-catalog
 * @desc Processa o catálogo de clientes (VTEX -> Emarsys)
 * @access Public
 */
router.get('/client-catalog', async (req, res) => {
  try {
    // Parâmetros da query
    const twoYears = req.query['2y'] === 'true';
    const startDate = req.query.startDate;
    const toDate = req.query.toDate;

    console.log('🚀 Iniciando catálogo de clientes (GET):', {
      twoYears,
      startDate,
      toDate
    });

    // Processa o catálogo de clientes
    const result = await integrationService.processClientCatalog({
      twoYears,
      startDate,
      toDate
    });

    res.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro no catálogo de clientes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/integration/client-catalog
 * @desc Processa o catálogo de clientes via POST com body (para automação)
 * @access Public
 */
router.post('/client-catalog', async (req, res) => {
  try {
    const { twoYears, startDate, toDate, ...otherOptions } = req.body;

    console.log('🚀 Iniciando catálogo de clientes (POST):', {
      twoYears,
      startDate,
      toDate,
      otherOptions
    });

    // Processa o catálogo de clientes
    const result = await integrationService.processClientCatalog({
      twoYears,
      startDate,
      toDate,
      ...otherOptions
    });

    res.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro no catálogo de clientes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/integration/test-connections
 * @desc Testa todas as conexões (VTEX, WebDAV, HAPI)
 * @access Public
 */
router.get('/test-connections', async (req, res) => {
  try {
    console.log('🔍 Testando conexões...');
    
    const result = await integrationService.testConnections();
    
    res.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro ao testar conexões:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/integration/status
 * @desc Obtém status da integração
 * @access Public
 */
router.get('/status', async (req, res) => {
  try {
    const connections = await integrationService.testConnections();
    
    res.json({
      success: true,
      data: {
        connections,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version
      }
    });

  } catch (error) {
    console.error('❌ Erro ao obter status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/integration/export/:filename
 * @desc Exporta arquivo gerado
 * @access Public
 */
router.get('/export/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const auth = req.headers.authorization;

    // Verificação básica de autenticação
    if (auth !== 'Bearer 1234') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const filePath = path.join(__dirname, '..', 'exports', filename);

    if (fs.existsSync(filePath)) {
      res.download(filePath, filename);
    } else {
      res.status(404).json({
        success: false,
        error: 'Arquivo não encontrado'
      });
    }

  } catch (error) {
    console.error('❌ Erro ao exportar arquivo:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/integration/health
 * @desc Health check da integração
 * @access Public
 */
router.get('/health', async (req, res) => {
  try {
    res.json({
      success: true,
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/integration/orders-extract
 * @desc Extrai pedidos por período de forma isolada (sem produtos/Emarsys)
 * @access Public
 */
router.get('/orders-extract', async (req, res) => {
  try {
    // Parâmetros da query
    const startDate = req.query.startDate;
    const toDate = req.query.toDate;
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 100;

    if (!startDate || !toDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate e toDate são obrigatórios (formato ISO: 2025-08-01T00:00:00Z)'
      });
    }

    console.log('🚀 Iniciando extração isolada de pedidos (GET):', {
      startDate,
      toDate,
      page,
      perPage
    });

    // Busca pedidos diretamente da VTEX usando a função unificada
    const vtexOrdersService = new (require('../services/vtexOrdersService'))();
    
    try {
      const orders = await vtexOrdersService.searchOrdersByPeriod(
        startDate,
        toDate,
        page,
        {
          per_page: perPage,
          orderBy: 'creationDate,asc'
        }
      );
      console.log('orders manual extract', orders);
      res.json({
        success: true,
        data: {
          orders: orders.list || [],
          pagination: orders.paging || null,
          totalOrders: orders.list ? orders.list.length : 0,
          period: {
            startDate,
            toDate
          },
          page,
          perPage
        },
        timestamp: new Date().toISOString()
      });

    } catch (vtexError) {
      console.error('❌ Erro na busca VTEX:', vtexError);
      res.status(500).json({
        success: false,
        error: `Erro na busca VTEX: ${vtexError.message}`,
        details: vtexError.response?.data || null,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Erro na extração de pedidos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/integration/orders-extract
 * @desc Extrai pedidos por período via POST (para automação)
 * @access Public
 */
router.post('/orders-extract', async (req, res) => {
  try {
    const { startDate, toDate, page = 1, per_page = 100, ...otherOptions } = req.body;

    if (!startDate || !toDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate e toDate são obrigatórios (formato ISO: 2025-08-01T00:00:00Z)'
      });
    }

    console.log('🚀 Iniciando extração isolada de pedidos (POST):', {
      startDate,
      toDate,
      page,
      per_page,
      otherOptions
    });

    // Busca pedidos diretamente da VTEX usando a função unificada
    const vtexOrdersService = new (require('../services/vtexOrdersService'))();
    
    try {
      const orders = await vtexOrdersService.searchOrdersByPeriod(
        startDate,
        toDate,
        page,
        {
          per_page,
          orderBy: 'creationDate,asc',
          ...otherOptions
        }
      );

      res.json({
        success: true,
        data: {
          orders: orders.list || [],
          pagination: orders.paging || null,
          totalOrders: orders.list ? orders.list.length : 0,
          period: {
            startDate,
            toDate
          },
          page,
          per_page
        },
        timestamp: new Date().toISOString()
      });

    } catch (vtexError) {
      console.error('❌ Erro na busca VTEX:', vtexError);
      res.status(500).json({
        success: false,
        error: `Erro na busca VTEX: ${vtexError.message}`,
        details: vtexError.response?.data || null,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Erro na extração de pedidos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/integration/orders-sync-new-base
 * @desc Sincroniza pedidos usando a nova base de dados
 * @param {string} dataInicial - Data inicial (formato: YYYY-MM-DD)
 * @param {string} dataFinal - Data final (formato: YYYY-MM-DD)
 * @param {number} pageSize - Tamanho da página (padrão: 100)
 * @access Public
 */
router.get('/orders-sync-new-base', async (req, res) => {
  try {
    // Parâmetros da query
    const dataInicial = req.query.dataInicial;
    const dataFinal = req.query.dataFinal;
    const pageSize = parseInt(req.query.pageSize) || 100;

    console.log('🚀 Iniciando sincronização com nova base de dados:', {
      dataInicial,
      dataFinal,
      pageSize
    });

    // Instancia o serviço de pedidos
    const vtexOrdersService = new (require('../services/vtexOrdersService'))();
    
    try {
      // Executa sincronização completa usando nova base
      const syncResult = await vtexOrdersService.syncOrders({
        dataInicial,
        dataFinal,
        pageSize
      });

      res.json({
        success: syncResult.success,
        data: syncResult,
        timestamp: new Date().toISOString()
      });

    } catch (syncError) {
      console.error('❌ Erro na sincronização:', syncError);
      res.status(500).json({
        success: false,
        error: `Erro na sincronização: ${syncError.message}`,
        details: syncError.response?.data || null,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Erro na sincronização com nova base:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/integration/test-new-base
 * @desc Testa a conexão com a nova base de dados
 * @param {number} pageSize - Tamanho da página (padrão: 10)
 * @access Public
 */
router.get('/test-new-base', async (req, res) => {
  try {
    const pageSize = parseInt(req.query.pageSize) || 10;

    console.log('🧪 Testando conexão com nova base de dados...');

    // Instancia o serviço de pedidos
    const vtexOrdersService = new (require('../services/vtexOrdersService'))();
    
    try {
      // Testa apenas uma página para verificar conectividade
      const testResult = await vtexOrdersService.fetchOrdersFromNewBase({
        page: 1,
        pageSize: pageSize
      });

      console.log('✅ Teste da nova base concluído com sucesso');

      res.json({
        success: true,
        message: 'Teste da nova base concluído com sucesso',
        data: {
          testResult,
          pageSize,
          timestamp: new Date().toISOString()
        }
      });

    } catch (testError) {
      console.error('❌ Erro no teste da nova base:', testError);
      res.status(500).json({
        success: false,
        error: `Erro no teste da nova base: ${testError.message}`,
        details: testError.response?.data || null,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Erro no teste da nova base:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/integration/orders-extract-all
 * @desc Extrai TODOS os pedidos do período (com paginação automática)
 * @param {string} brazilianDate - Data brasileira (YYYY-MM-DD) OU
 * @param {string} startDate - Data inicial UTC (ISO)
 * @param {string} toDate - Data final UTC (ISO)
 * @param {string} startTime - Horário inicial brasileiro (HH:MM, opcional, padrão: 00:00)
 * @param {string} endTime - Horário final brasileiro (HH:MM, opcional, padrão: 23:59)
 * @example /orders-extract-all?brazilianDate=2025-09-03
 * @example /orders-extract-all?brazilianDate=2025-09-03&startTime=08:00&endTime=18:00
 * @access Public
 */
router.get('/orders-extract-all', async (req, res) => {
  try {
    // Parâmetros da query
    let startDate = req.query.startDate;
    let toDate = req.query.toDate;
    const brazilianDate = req.query.brazilianDate;
    const startTime = req.query.startTime;
    const endTime = req.query.endTime;
    const perPage = parseInt(req.query.per_page);
    const useBatching = req.query.batching === 'true';
    const daysPerBatch = parseInt(req.query.daysPerBatch) || 7;

    // Novo: Suporte para data brasileira
    if (brazilianDate) {
      const { getBrazilianTimeRangeInUTC } = require('../utils/dateUtils');
      const range = getBrazilianTimeRangeInUTC(brazilianDate, startTime, endTime);
      startDate = range.startUTC;
      toDate = range.endUTC;
      
      console.log('🇧🇷 Usando data brasileira:', {
        brazilianDate,
        startTime: range.startTime,
        endTime: range.endTime,
        convertedStartUTC: startDate,
        convertedEndUTC: toDate
      });
    } else if (!startDate || !toDate) {
      return res.status(400).json({
        success: false,
        error: 'Forneça startDate+toDate (UTC) OU brazilianDate (ex: brazilianDate=2025-09-03&startTime=08:00&endTime=18:00)'
      });
    }

    console.log('🚀 Iniciando extração completa de pedidos (GET):', {
      startDate,
      toDate,
      perPage,
      useBatching,
      daysPerBatch
    });

    // Busca TODOS os pedidos do período usando getAllOrdersInPeriod
    const vtexOrdersService = new (require('../services/vtexOrdersService'))();
    
    try {
      // ETAPA 1: Buscar todos os pedidos por período (só IDs)
      console.log('📦 ETAPA 1: Buscando pedidos por período...');
      
      // Calcula a diferença em dias para decidir automaticamente a estratégia
      const startDateObj = new Date(startDate);
      const toDateObj = new Date(toDate);
      const diffInDays = Math.ceil((toDateObj - startDateObj) / (1000 * 60 * 60 * 24));
      
      // Decide automaticamente: períodos > 30 dias usam lotes
      const shouldUseBatching = diffInDays > 30 || useBatching; // Mantém compatibilidade temporária
      
      let ordersList;
      if (shouldUseBatching) {
        console.log(`🔄 Período longo detectado (${diffInDays} dias), usando busca em lotes para evitar limite de páginas...`);
        ordersList = await vtexOrdersService.getAllOrdersInPeriodBatched(startDate, toDate, daysPerBatch);
      } else {
        console.log(`🔄 Período curto (${diffInDays} dias), usando busca normal...`);
        ordersList = await vtexOrdersService.getAllOrdersInPeriod(startDate, toDate, false);
      }
      
      console.log(`📊 Resultado da ETAPA 1:`, {
        ordersListType: typeof ordersList,
        ordersListLength: ordersList ? ordersList.length : 'null/undefined',
        ordersListSample: ordersList && ordersList.length > 0 ? ordersList[0] : 'nenhum'
      });
      
      if (!ordersList || ordersList.length === 0) {
        console.log('⚠️ Nenhum pedido encontrado, retornando resposta vazia');
        return res.json({
          success: true,
          message: 'Nenhum pedido encontrado no período especificado',
          data: {
            orders: [],
            totalOrders: 0,
            period: { startDate, toDate },
            perPage,
            useBatching
          },
          timestamp: new Date().toISOString()
        });
      }

      console.log(`✅ ETAPA 1 concluída: ${ordersList.length} pedidos encontrados`);
      console.log(`🔍 Iniciando ETAPA 2: Buscar detalhes de TODOS os ${ordersList.length} pedidos...`);

      // ETAPA 2: Buscar detalhes completos de TODOS os pedidos individualmente
      console.log('🔍 ETAPA 2: Buscando detalhes completos de cada pedido...');
      const detailedOrders = [];
      
      for (let i = 0; i < ordersList.length; i++) {
        const order = ordersList[i];
        const orderId = order.orderId || order.id;
        
        if (!orderId) {
          console.warn(`⚠️ Pedido sem ID encontrado:`, order);
          continue;
        }

        try {
          console.log(`🔍 Buscando detalhes do pedido ${orderId} (${i + 1}/${ordersList.length})`);
          const orderDetail = await vtexOrdersService.getOrderById(orderId);
          if (orderDetail) {
            detailedOrders.push(orderDetail);
            console.log(`✅ Pedido ${orderId} processado (${detailedOrders.length}/${ordersList.length})`);
          } else {
            console.warn(`⚠️ Nenhum detalhe encontrado para pedido ${orderId}`);
          }

          // Pausa entre requisições para não sobrecarregar
          if (i < ordersList.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }

        } catch (error) {
          console.error(`❌ Erro ao buscar detalhes do pedido ${orderId}:`, error.message);
          // Continua com os próximos pedidos mesmo se um falhar
        }
      }

      console.log(`✅ ETAPA 2 concluída: ${detailedOrders.length} pedidos com detalhes completos`);
      console.log(`📨 ETAPA 3: Enviando ${detailedOrders.length} pedidos para o hook /_v/order/hook...`);

      const hookResults = {
        total: detailedOrders.length,
        success: 0,
        failed: 0,
        errors: []
      };

      for (let i = 0; i < detailedOrders.length; i++) {
        const orderDetail = detailedOrders[i];
        const orderId = orderDetail.orderId || orderDetail.id;
        console.log(`📨 Enviando pedido ${orderId} para hook (${i + 1}/${detailedOrders.length})...`);
        const result = await vtexOrdersService.sendOrderToHook(orderDetail);
        if (result.success) {
          hookResults.success++;
        } else {
          hookResults.failed++;
          hookResults.errors.push({ orderId, status: result.status, error: result.error, data: result.data });
        }
        if (i < detailedOrders.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }

      console.log(`✅ ETAPA 3 concluída: ${hookResults.success}/${hookResults.total} enviados com sucesso (${hookResults.failed} falhas)`);
      console.log('🎉 Fluxo concluído, enviando resposta...');

      // ETAPA 4: Sincronização de orders usando nova base de dados
      let syncOrdersResult = null;
      try {
        console.log('🔄 Executando sincronização de orders usando nova base de dados...');
        
        const axios = require('axios');
        const syncResponse = await axios({
          method: 'GET',
          url: 'http://localhost:3000/api/integration/orders-sync-new-base',
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 120000 // 2 minutos para sincronização
        });
        
        console.log('✅ Sincronização de orders concluída:', syncResponse.status);
        syncOrdersResult = {
          success: true,
          status: syncResponse.status,
          data: syncResponse.data
        };
        
      } catch (syncError) {
        console.error('❌ Erro na sincronização de orders:', syncError?.message);
        syncOrdersResult = {
          success: false,
          error: syncError?.message,
          status: syncError?.response?.status
        };
      }
 
      // Resposta final
      res.json({
        success: true,
        message: 'Fluxo completo executado: Extração → Hook → Sincronização',
        data: {
          totalOrdersDetailed: detailedOrders.length,
          period: {
            startDate,
            toDate
          },
          perPage,
          useBatching,
          daysPerBatch,
          summary: {
            ordersFound: ordersList.length,
            ordersWithDetails: detailedOrders.length,
            ordersFailed: ordersList.length - detailedOrders.length,
            hookSent: hookResults.success,
            hookFailed: hookResults.failed,
            syncSuccess: syncOrdersResult?.success || false
          },
          hookErrorsSample: hookResults.errors.slice(0, 5),
          syncOrdersResult: syncOrdersResult
        },
        timestamp: new Date().toISOString()
      });

    } catch (vtexError) {
      console.error('❌ Erro na busca VTEX:', vtexError);
      res.status(500).json({
        success: false,
        error: `Erro na busca VTEX: ${vtexError.message}`,
        details: vtexError.response?.data || null,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Erro na extração completa de pedidos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/integration/orders-extract-test
 * @desc Teste da extração - para após ETAPA 1 para debug
 * @access Public
 */
router.get('/orders-extract-test', async (req, res) => {
  try {
    // Parâmetros da query
    let startDate = req.query.startDate;
    let toDate = req.query.toDate;
    const brazilianDate = req.query.brazilianDate;
    const startTime = req.query.startTime;
    const endTime = req.query.endTime;
    const useBatching = req.query.batching === 'true';
    const daysPerBatch = parseInt(req.query.daysPerBatch) || 7;

    // Suporte para data brasileira
    if (brazilianDate) {
      const { getBrazilianTimeRangeInUTC } = require('../utils/dateUtils');
      const range = getBrazilianTimeRangeInUTC(brazilianDate, startTime, endTime);
      startDate = range.startUTC;
      toDate = range.endUTC;
      
      console.log('🇧🇷 [TESTE] Usando data brasileira:', {
        brazilianDate,
        startTime: range.startTime,
        endTime: range.endTime,
        convertedStartUTC: startDate,
        convertedEndUTC: toDate
      });
    } else if (!startDate || !toDate) {
      return res.status(400).json({
        success: false,
        error: 'Forneça startDate+toDate (UTC) OU brazilianDate (ex: brazilianDate=2025-09-03&startTime=08:00&endTime=18:00)'
      });
    }

    console.log('🧪 TESTE: Iniciando extração de pedidos (ETAPA 1 apenas):', {
      startDate,
      toDate,
      useBatching,
      daysPerBatch
    });

    // Busca TODOS os pedidos do período usando getAllOrdersInPeriod
    const vtexOrdersService = new (require('../services/vtexOrdersService'))();
    
    try {
      // ETAPA 1: Buscar todos os pedidos por período (só IDs)
      console.log('📦 ETAPA 1: Buscando pedidos por período...');
      
      let ordersList;
      if (useBatching) {
        console.log('🔄 Usando busca em lotes para evitar limite de páginas...');
        ordersList = await vtexOrdersService.getAllOrdersInPeriodBatched(startDate, toDate, daysPerBatch);
      } else {
        console.log('🔄 Usando busca normal...');
        ordersList = await vtexOrdersService.getAllOrdersInPeriod(startDate, toDate, false);
      }
      
      console.log(`📊 Resultado da ETAPA 1:`, {
        ordersListType: typeof ordersList,
        ordersListLength: ordersList ? ordersList.length : 'null/undefined',
        ordersListSample: ordersList && ordersList.length > 0 ? ordersList[0] : 'nenhum'
      });
      
      if (!ordersList || ordersList.length === 0) {
        console.log('⚠️ Nenhum pedido encontrado, retornando resposta vazia');
        return res.json({
          success: true,
          message: 'Nenhum pedido encontrado no período especificado',
          data: {
            orders: [],
            totalOrders: 0,
            period: { startDate, toDate },
            useBatching
          },
          timestamp: new Date().toISOString()
        });
      }

      console.log(`✅ ETAPA 1 concluída: ${ordersList.length} pedidos encontrados`);
      console.log('🧪 TESTE: Parando aqui para debug - ETAPA 1 funcionou!');

      // Resposta de teste - para após ETAPA 1
      res.json({
        success: true,
        message: 'TESTE: ETAPA 1 concluída com sucesso',
        data: {
          ordersFound: ordersList.length,
          period: { startDate, toDate },
          useBatching,
          daysPerBatch,
          sampleOrder: ordersList.length > 0 ? ordersList[0] : null,
          firstFewOrders: ordersList.slice(0, 3)
        },
        timestamp: new Date().toISOString()
      });

    } catch (vtexError) {
      console.error('❌ Erro na busca VTEX:', vtexError);
      res.status(500).json({
        success: false,
        error: `Erro na busca VTEX: ${vtexError.message}`,
        details: vtexError.response?.data || null,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Erro no teste de extração:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/integration/orders-extract-test-details
 * @desc Teste da ETAPA 2 - busca detalhes de TODOS os pedidos e envia para hook
 * @access Public
 */
router.get('/orders-extract-test-details', async (req, res) => {
  try {
    // Parâmetros da query
    let startDate = req.query.startDate;
    let toDate = req.query.toDate;
    const brazilianDate = req.query.brazilianDate;
    const startTime = req.query.startTime;
    const endTime = req.query.endTime;
    const useBatching = req.query.batching === 'true';
    const daysPerBatch = parseInt(req.query.daysPerBatch) || 7;

    // Suporte para data brasileira
    if (brazilianDate) {
      const { getBrazilianTimeRangeInUTC } = require('../utils/dateUtils');
      const range = getBrazilianTimeRangeInUTC(brazilianDate, startTime, endTime);
      startDate = range.startUTC;
      toDate = range.endUTC;
      
      console.log('🇧🇷 [TESTE DETALHES] Usando data brasileira:', {
        brazilianDate,
        startTime: range.startTime,
        endTime: range.endTime,
        convertedStartUTC: startDate,
        convertedEndUTC: toDate
      });
    } else if (!startDate || !toDate) {
      return res.status(400).json({
        success: false,
        error: 'Forneça startDate+toDate (UTC) OU brazilianDate (ex: brazilianDate=2025-09-03&startTime=08:00&endTime=18:00)'
      });
    }

    console.log('🧪 TESTE ETAPA 2: Iniciando teste de busca de detalhes de TODOS os pedidos:', {
      startDate,
      toDate,
      useBatching,
      daysPerBatch
    });

    // Busca TODOS os pedidos do período usando getAllOrdersInPeriod
    const vtexOrdersService = new (require('../services/vtexOrdersService'))();
    
    try {
      // ETAPA 1: Buscar todos os pedidos por período (só IDs)
      console.log('📦 ETAPA 1: Buscando pedidos por período...');
      
      let ordersList;
      if (useBatching) {
        console.log('🔄 Usando busca em lotes para evitar limite de páginas...');
        ordersList = await vtexOrdersService.getAllOrdersInPeriodBatched(startDate, toDate, daysPerBatch);
      } else {
        console.log('🔄 Usando busca normal...');
        ordersList = await vtexOrdersService.getAllOrdersInPeriod(startDate, toDate, false);
      }
      
      if (!ordersList || ordersList.length === 0) {
        console.log('⚠️ Nenhum pedido encontrado');
        return res.json({
          success: true,
          message: 'Nenhum pedido encontrado no período especificado',
          data: {
            orders: [],
            totalOrders: 0,
            period: { startDate, toDate }
          },
          timestamp: new Date().toISOString()
        });
      }

      console.log(`✅ ETAPA 1 concluída: ${ordersList.length} pedidos encontrados`);
      console.log(`🔍 TESTE ETAPA 2: Buscando detalhes de TODOS os ${ordersList.length} pedidos...`);

      // ETAPA 2: Buscar detalhes de TODOS os pedidos
      const detailedOrders = [];
      
      for (let i = 0; i < ordersList.length; i++) {
        const order = ordersList[i];
        const orderId = order.orderId || order.id;
        
        if (!orderId) {
          console.warn(`⚠️ Pedido sem ID encontrado:`, order);
          continue;
        }

        try {
          console.log(`🔍 TESTE: Buscando detalhes do pedido ${orderId} (${i + 1}/${ordersList.length})`);
          const orderDetail = await vtexOrdersService.getOrderById(orderId);
          
          if (orderDetail) {
            detailedOrders.push(orderDetail);
            console.log(`✅ TESTE: Pedido ${orderId} processado com sucesso`);
          } else {
            console.warn(`⚠️ TESTE: Nenhum detalhe encontrado para pedido ${orderId}`);
          }

          // Pausa entre requisições para não sobrecarregar
          if (i < ordersList.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

        } catch (error) {
          console.error(`❌ TESTE: Erro ao buscar detalhes do pedido ${orderId}:`, error.message);
          // Continua com os próximos pedidos mesmo se um falhar
        }
      }

      console.log(`✅ TESTE ETAPA 2 concluída: ${detailedOrders.length} pedidos com detalhes completos`);

      // ETAPA 3: Enviar pedidos detalhados para o hook
      console.log(`📨 TESTE ETAPA 3: Enviando ${detailedOrders.length} pedidos para o hook...`);
      
      const hookResults = {
        total: detailedOrders.length,
        success: 0,
        failed: 0,
        errors: []
      };

      for (let i = 0; i < detailedOrders.length; i++) {
        const orderDetail = detailedOrders[i];
        const orderId = orderDetail.orderId || orderDetail.id;
        console.log(`📨 TESTE: Enviando pedido ${orderId} para hook (${i + 1}/${detailedOrders.length})...`);
        const result = await vtexOrdersService.sendOrderToHook(orderDetail);
        if (result.success) {
          hookResults.success++;
        } else {
          hookResults.failed++;
          hookResults.errors.push({ orderId, status: result.status, error: result.error, data: result.data });
        }
        if (i < detailedOrders.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }

      console.log(`✅ TESTE ETAPA 3 concluída: ${hookResults.success}/${hookResults.total} enviados com sucesso (${hookResults.failed} falhas)`);

      // Resposta de teste
      res.json({
        success: true,
        message: 'TESTE: Todas as etapas concluídas com sucesso',
        data: {
          ordersFound: ordersList.length,
          ordersWithDetails: detailedOrders.length,
          hookSent: hookResults.success,
          hookFailed: hookResults.failed,
          period: { startDate, toDate },
          useBatching,
          daysPerBatch,
          sampleDetailedOrder: detailedOrders.length > 0 ? detailedOrders[0] : null,
          hookErrorsSample: hookResults.errors.slice(0, 5)
        },
        timestamp: new Date().toISOString()
      });

    } catch (vtexError) {
      console.error('❌ Erro na busca VTEX:', vtexError);
      res.status(500).json({
        success: false,
        error: `Erro na busca VTEX: ${vtexError.message}`,
        details: vtexError.response?.data || null,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Erro no teste de detalhes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/integration/cl-extract
 * @desc Extrai todos os registros da CL (Customer List) usando Range headers da VTEX
 * @access Public
 */
router.get('/cl-extract', async (req, res) => {
  try {
    // Parâmetros da query
    const maxRecords = parseInt(req.query.maxRecords) || 10000;
    const size = parseInt(req.query.size) || 1000;
    const fields = req.query.fields || 'email,id,accountId,accountName,dataEntityId,integrado,createdIn,updatedIn,optIn,document,birthDate,phone';
    const sort = req.query.sort || 'createdIn DESC';

    console.log('🚀 Iniciando extração da CL (Customer List):', {
      maxRecords,
      size,
      fields,
      sort
    });

    // Busca todos os registros da CL usando Range headers
    const contactService = new (require('../services/contactService'))();
    
    try {
      // ETAPA 1: Buscar todos os registros da CL
      console.log('📄 ETAPA 1: Buscando registros da CL usando Range headers...');
      
      const records = await contactService.fetchAllCLRecords({
        maxRecords,
        size,
        fields,
        sort
      });
      
      if (!records || records.length === 0) {
        console.log('⚠️ Nenhum registro encontrado na CL');
        return res.json({
          success: true,
          message: 'Nenhum registro encontrado na CL',
          data: {
            records: [],
            totalRecords: 0,
            csvGenerated: false
          },
          timestamp: new Date().toISOString()
        });
      }

      console.log(`✅ ETAPA 1 concluída: ${records.length} registros encontrados`);
      console.log('📊 ETAPA 2: Gerando CSV dos registros...');

      // ETAPA 2: Gerar CSV
      const csvResult = await contactService.generateCLCSV(records);

      if (!csvResult.success) {
        console.warn('⚠️ Falha ao gerar CSV:', csvResult.error);
      } else {
        console.log(`✅ CSV gerado: ${csvResult.filename}`);
      }

      console.log('🎉 Extração da CL concluída!');

      // Resposta final
      res.json({
        success: true,
        message: 'Extração da CL concluída com sucesso',
        data: {
          totalRecords: records.length,
          sampleRecord: records.length > 0 ? records[0] : null,
          csvGenerated: csvResult.success,
          csvFile: csvResult.success ? csvResult.filename : null,
          csvPath: csvResult.success ? csvResult.filePath : null,
          options: {
            maxRecords,
            size,
            fields,
            sort
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (vtexError) {
      console.error('❌ Erro na busca da CL:', vtexError);
      res.status(500).json({
        success: false,
        error: `Erro na busca da CL: ${vtexError.message}`,
        details: vtexError.response?.data || null,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Erro na extração da CL:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/integration/cl-extract
 * @desc Extrai todos os registros da CL via POST (para automação)
 * @access Public
 */
router.post('/cl-extract', async (req, res) => {
  try {
    const { maxRecords = 10000, size = 1000, fields = 'email,id,accountId,accountName,dataEntityId,integrado,createdIn,updatedIn,optIn,document,birthDate,phone', sort = 'createdIn DESC', ...otherOptions } = req.body;

    console.log('🚀 Iniciando extração da CL (POST):', {
      maxRecords,
      size,
      fields,
      sort,
      otherOptions
    });

    // Busca todos os registros da CL usando Range headers
    const contactService = new (require('../services/contactService'))();
    
    try {
      // ETAPA 1: Buscar todos os registros da CL
      console.log('📄 ETAPA 1: Buscando registros da CL usando Range headers...');
      
      const records = await contactService.fetchAllCLRecords({
        maxRecords,
        size,
        fields,
        sort,
        ...otherOptions
      });
      
      if (!records || records.length === 0) {
        console.log('⚠️ Nenhum registro encontrado na CL');
        return res.json({
          success: true,
          message: 'Nenhum registro encontrado na CL',
          data: {
            records: [],
            totalRecords: 0,
            csvGenerated: false
          },
          timestamp: new Date().toISOString()
        });
      }

      console.log(`✅ ETAPA 1 concluída: ${records.length} registros encontrados`);
      console.log('📊 ETAPA 2: Gerando CSV dos registros...');

      // ETAPA 2: Gerar CSV
      const csvResult = await contactService.generateCLCSV(records);

      if (!csvResult.success) {
        console.warn('⚠️ Falha ao gerar CSV:', csvResult.error);
      } else {
        console.log(`✅ CSV gerado: ${csvResult.filename}`);
      }

      console.log('🎉 Extração da CL concluída!');

      // Resposta final
      res.json({
        success: true,
        message: 'Extração da CL concluída com sucesso',
        data: {
          totalRecords: records.length,
          sampleRecord: records.length > 0 ? records[0] : null,
          csvGenerated: csvResult.success,
          csvFile: csvResult.success ? csvResult.filename : null,
          csvPath: csvResult.success ? csvResult.filePath : null,
          options: {
            maxRecords,
            size,
            fields,
            sort,
            ...otherOptions
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (vtexError) {
      console.error('❌ Erro na busca da CL:', vtexError);
      res.status(500).json({
        success: false,
        error: `Erro na busca da CL: ${vtexError.message}`,
        details: vtexError.response?.data || null,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Erro na extração da CL:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/integration/cl-test
 * @desc Testa a API da CL para descobrir campos disponíveis
 * @access Public
 */
router.get('/cl-test', async (req, res) => {
  try {
    console.log('🧪 Iniciando teste da API da CL...');
    
    const contactService = new (require('../services/contactService'))();
    const testResult = await contactService.testCLAPI();
    
    res.json({
      success: true,
      message: 'Teste da API da CL concluído',
      data: testResult
    });
    
  } catch (error) {
    console.error('❌ Erro no teste da API da CL:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para listar todas as entidades de dados
router.get('/entities-list', async (req, res) => {
  try {
    console.log('🔍 Iniciando listagem de entidades...');
    
    const contactService = new (require('../services/contactService'))();
    const result = await contactService.listDataEntities();
    
    res.json({
      success: true,
      message: 'Listagem de entidades concluída',
      data: result
    });
    
  } catch (error) {
    console.error('❌ Erro na listagem de entidades:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para buscar informações de uma entidade específica
router.get('/entity-info/:entityName', async (req, res) => {
  try {
    const { entityName } = req.params;
    console.log(`🔍 Iniciando busca de informações da entidade: ${entityName}`);
    
    const contactService = new (require('../services/contactService'))();
    const result = await contactService.getEntityInfo(entityName);
    
    res.json({
      success: true,
      message: `Informações da entidade ${entityName} obtidas`,
      data: result
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar informações da entidade:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para testar o comportamento da paginação da CL
router.get('/cl-pagination-test', async (req, res) => {
  try {
    console.log('🧪 Iniciando teste de paginação da CL...');
    
    const contactService = new (require('../services/contactService'))();
    const testResult = await contactService.testPaginationBehavior();
    
    res.json({
      success: true,
      message: 'Teste de paginação da CL concluído',
      data: testResult
    });
    
  } catch (error) {
    console.error('❌ Erro no teste de paginação da CL:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para testar diretamente a API da VTEX (debug)
router.get('/cl-direct-test', async (req, res) => {
  try {
    console.log('🧪 Testando requisições diretas à API da VTEX...');
    
    const axios = require('axios');
    const baseUrl = process.env.VTEX_ENV || process.env.VTEX_BASE_URL || 'https://piccadilly.vtexcommercestable.com.br';
    
    const tests = [];
    
    // Teste 1: API search com _size=1000
    try {
      console.log('🔍 Teste 1: /search com _size=1000...');
      const test1 = await axios({
        method: 'GET',
        url: `${baseUrl}/api/dataentities/CL/search`,
        params: {
          _size: 1000,
          _fields: 'email,id,accountId',
          _sort: 'createdIn DESC'
        },
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
        },
        timeout: 10000
      });
      
      tests.push({
        name: 'search _size=1000',
        url: '/search',
        status: test1.status,
        dataLength: test1.data ? test1.data.length : 0,
        contentRange: test1.headers?.['rest-content-range'],
        hasToken: !!(test1.headers?.['x-vtex-md-token'] || test1.headers?.['x-vtex-page-token'])
      });
    } catch (error) {
      tests.push({
        name: 'search _size=1000',
        error: error.message
      });
    }
    
    // Teste 2: API scroll sem token
    try {
      console.log('🔍 Teste 2: /scroll sem token...');
      const test2 = await axios({
        method: 'GET',
        url: `${baseUrl}/api/dataentities/CL/scroll`,
        params: {
          _size: 1000,
          _fields: 'email,id,accountId'
        },
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
        },
        timeout: 10000
      });
      
      tests.push({
        name: 'scroll sem token',
        url: '/scroll',
        status: test2.status,
        dataLength: test2.data ? test2.data.length : 0,
        contentRange: test2.headers?.['rest-content-range'],
        hasToken: !!(test2.headers?.['x-vtex-md-token'] || test2.headers?.['x-vtex-page-token']),
        token: test2.headers?.['x-vtex-md-token'] || test2.headers?.['x-vtex-page-token'] || null
      });
    } catch (error) {
      tests.push({
        name: 'scroll sem token',
        error: error.message
      });
    }
    
    // Teste 3: API search com _from=1000
    try {
      console.log('🔍 Teste 3: /search com _from=1000...');
      const test3 = await axios({
        method: 'GET',
        url: `${baseUrl}/api/dataentities/CL/search`,
        params: {
          _size: 1000,
          _from: 1000,
          _fields: 'email,id,accountId',
          _sort: 'createdIn DESC'
        },
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
        },
        timeout: 10000
      });
      
      tests.push({
        name: 'search _from=1000',
        url: '/search',
        status: test3.status,
        dataLength: test3.data ? test3.data.length : 0,
        contentRange: test3.headers?.['rest-content-range'],
        hasToken: !!(test3.headers?.['x-vtex-md-token'] || test3.headers?.['x-vtex-page-token'])
      });
    } catch (error) {
      tests.push({
        name: 'search _from=1000',
        error: error.message
      });
    }
    
    res.json({
      success: true,
      message: 'Testes diretos da API da VTEX concluídos',
      tests: tests
    });
    
  } catch (error) {
    console.error('❌ Erro nos testes diretos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para testar a nova abordagem com Range headers
router.get('/cl-range-test', async (req, res) => {
  try {
    console.log('🧪 Iniciando teste da nova abordagem com Range headers...');
    
    const contactService = new (require('../services/contactService'))();
    
    // Testa apenas algumas páginas para verificar se está funcionando
    const testOptions = {
      size: 50,
      maxRequests: 5, // Apenas 5 páginas para teste
      fields: 'email,id,accountId,accountName,dataEntityId,integrado,createdIn,updatedIn,optIn,document,birthDate,phone',
      sort: 'createdIn DESC'
    };
    
    const records = await contactService.fetchAllCLRecordsWithRange(testOptions);
    
    res.json({
      success: true,
      message: 'Teste da nova abordagem com Range headers concluído',
      data: {
        totalRecords: records.length,
        sampleRecords: records.slice(0, 3),
        testOptions
      }
    });
    
  } catch (error) {
    console.error('❌ Erro no teste da nova abordagem:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/integration/test-cl-scroll-improved
 * @desc Testa a busca de CL com melhorias de retry e timeout
 * @access Public
 */
router.get('/test-cl-scroll-improved', async (req, res) => {
  try {
    console.log('🚀 Iniciando teste da busca de CL com melhorias...');
    
    const contactService = new (require('../services/contactService'))();
    
    // Busca usando scroll com melhorias
    const records = await contactService.fetchAllCLRecordsWithVTEXScroll({
      size: 1000,
      maxRequests: 5000,
      maxRetries: 3,
      baseDelay: 2000
    });
    
    console.log(`✅ Busca concluída! Total de registros: ${records.length.toLocaleString()}`);
    
    res.json({
      success: true,
      totalRecords: records.length,
      message: `Busca concluída com sucesso. Total de registros: ${records.length.toLocaleString()}`,
      sampleData: records.slice(0, 5) // Primeiros 5 registros como exemplo
    });
    
  } catch (error) {
    console.error('❌ Erro no teste da busca de CL:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Erro ao testar busca de CL'
    });
  }
});

/**
 * @route GET /api/integration/test-address-api
 * @desc Testa a API de endereços da VTEX
 * @access Public
 */
router.get('/test-address-api', async (req, res) => {
  try {
    console.log('🧪 Testando API de endereços...');
    
    const AddressService = require('../services/addressService');
    const addressService = new AddressService();
    
    const result = await addressService.testAddressAPI();
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ Erro no teste da API de endereços:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Erro ao testar API de endereços'
    });
  }
});

/**
 * @route POST /api/integration/export-cl-with-addresses/start
 * @desc Start export asynchronously and return jobId
 */
router.post('/export-cl-with-addresses/start', async (req, res) => {
  try {
    const job = createJob('export-cl-with-addresses');
    res.status(202).json({ success: true, jobId: job.id });

    // Kick off background work
    const ContactService = require('../services/contactService');
    const contactService = new ContactService();

    updateJob(job.id, { status: 'running', startedAt: new Date().toISOString(), progress: 1 });

    try {
      // Step 1: fetch CL records
      updateJob(job.id, { progress: 10 });
      const records = await contactService.fetchAllCLRecordsWithVTEXScroll({
        size: 1000,
        maxRequests: 5000,
        maxRetries: 3,
        baseDelay: 2000
      });

      updateJob(job.id, { progress: 50 });

      // Step 2: generate CSV with addresses
      const csvResult = await contactService.generateCLCSVWithAddresses(records, {
        addressBatchSize: 20,
        addressDelay: 200
      });

      if (!csvResult.success) {
        throw new Error(csvResult.error || 'Falha ao gerar CSV');
      }

      updateJob(job.id, {
        status: 'completed',
        progress: 100,
        finishedAt: new Date().toISOString(),
        result: {
          totalRecords: records.length,
          filename: csvResult.filename,
          filePath: csvResult.filePath,
          totalAddressesFound: csvResult.totalAddressesFound,
          timestamp: csvResult.timestamp
        }
      });
    } catch (err) {
      updateJob(job.id, {
        status: 'failed',
        progress: 100,
        finishedAt: new Date().toISOString(),
        error: err.message || String(err)
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route GET /api/integration/export-cl-with-addresses/status/:jobId
 * @desc Get export job status
 */
router.get('/export-cl-with-addresses/status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job não encontrado' });
  res.json({ success: true, job });
});

/**
 * @route GET /api/integration/export-cl-with-addresses/download/:jobId
 * @desc Download CSV when job is completed
 */
router.get('/export-cl-with-addresses/download/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job não encontrado' });
  if (job.status !== 'completed') return res.status(409).json({ success: false, error: 'Job não está concluído' });

  const filePath = job.result?.filePath;
  if (!filePath) return res.status(500).json({ success: false, error: 'Arquivo não disponível' });

  res.download(filePath, path.basename(filePath));
});

// Keep the original GET for backward compatibility but advise async flow
router.get('/export-cl-with-addresses', async (req, res) => {
  try {
    // For long-running jobs, recommend async start
    const job = createJob('export-cl-with-addresses');
    res.status(202).json({
      success: true,
      message: 'Exportação iniciada. Consulte o status com o jobId.',
      jobId: job.id
    });

    // Kick off same logic in background
    const ContactService = require('../services/contactService');
    const contactService = new ContactService();

    updateJob(job.id, { status: 'running', startedAt: new Date().toISOString(), progress: 1 });

    try {
      updateJob(job.id, { progress: 10 });
      const records = await contactService.fetchAllCLRecordsWithVTEXScroll({
        size: 1000,
        maxRequests: 5000,
        maxRetries: 3,
        baseDelay: 2000
      });

      updateJob(job.id, { progress: 50 });

      const csvResult = await contactService.generateCLCSVWithAddresses(records, {
        addressBatchSize: 20,
        addressDelay: 200
      });

      if (!csvResult.success) {
        throw new Error(csvResult.error || 'Falha ao gerar CSV');
      }

      updateJob(job.id, {
        status: 'completed',
        progress: 100,
        finishedAt: new Date().toISOString(),
        result: {
          totalRecords: records.length,
          filename: csvResult.filename,
          filePath: csvResult.filePath,
          totalAddressesFound: csvResult.totalAddressesFound,
          timestamp: csvResult.timestamp
        }
      });
    } catch (err) {
      updateJob(job.id, {
        status: 'failed',
        progress: 100,
        finishedAt: new Date().toISOString(),
        error: err.message || String(err)
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para acessar logs de erro
router.get('/sync/error-logs', async (req, res) => {
  try {
    const { type, phase, limit } = req.query;
    const vtexOrdersService = new VtexOrdersService();
    
    const options = {};
    if (type) options.type = type;
    if (phase) options.phase = phase;
    if (limit) options.limit = parseInt(limit);

    const logs = await vtexOrdersService.getErrorLogs(options);
    
    res.json({
      success: true,
      data: logs,
      total: logs.length,
      filters: options
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Rota para acessar estatísticas de sincronização
router.get('/sync/stats', async (req, res) => {
  try {
    const { phase, limit } = req.query;
    const vtexOrdersService = new VtexOrdersService();
    
    const options = {};
    if (phase) options.phase = phase;
    if (limit) options.limit = parseInt(limit);

    const stats = await vtexOrdersService.getSyncStats(options);
    
    res.json({
      success: true,
      data: stats,
      total: stats.length,
      filters: options
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Rota para obter informações da última sincronização (usado pelo cron)
router.get('/last-sync', async (req, res) => {
  try {
    const vtexOrdersService = new VtexOrdersService();
    const lastSyncInfo = await vtexOrdersService.getLastSyncInfo();
    
    // Converte as datas para o fuso horário do Brasil
    const brazilianData = {
      ...lastSyncInfo,
      lastSync: lastSyncInfo.lastSync ? convertToBrazilianTime(lastSyncInfo.lastSync) : null
    };
    
    res.json({
      success: true,
      data: brazilianData,
      timestamp: getBrazilianTimestamp()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: getBrazilianTimestamp()
    });
  }
});

// Rota para limpeza manual de pedidos processados
router.post('/cleanup-processed-orders', async (req, res) => {
  try {
    const { hoursToKeep = 48 } = req.body || {};
    const vtexOrdersService = new VtexOrdersService();
    
    const cleanupResult = await vtexOrdersService.cleanupProcessedOrders(hoursToKeep);
    
    res.json({
      success: cleanupResult.success,
      data: cleanupResult,
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

// Rota para gerar relatório de erros
router.get('/sync/error-report', async (req, res) => {
  try {
    const vtexOrdersService = new VtexOrdersService();
    const report = await vtexOrdersService.generateErrorReport();
    
    res.json({
      success: true,
      report: report
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router; 