const express = require('express');
const router = express.Router();
const IntegrationService = require('../services/integrationService');
const VtexOrdersService = require('../services/vtexOrdersService');
const RetryService = require('../services/retryService');
const { convertToBrazilianTime, getBrazilianTimestamp } = require('../utils/dateUtils');
const { logHelpers } = require('../utils/logger');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Calcula desconto individual de um item usando priceTags
 * @param {Object} item - Item do pedido
 * @returns {string} Valor do desconto formatado
 */
function calculateItemDiscount(item) {
  let totalDiscount = 0;

  if (item.priceTags && Array.isArray(item.priceTags)) {
    // Somar todos os descontos do item (valores negativos nos priceTags)
    item.priceTags.forEach((priceTag) => {
      if (priceTag.value < 0) { // Descontos são valores negativos
        totalDiscount += Math.abs(priceTag.value); // Converter para positivo
      }
    });

    // Converter de centavos para valor decimal
    const discountValue = totalDiscount / 100;
    return discountValue.toFixed(2);
  }

  return '0.00';
}

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

/**
 * Busca pedidos não sincronizados na EMS via API externa
 * @returns {Promise<Array>} Array de pedidos com isSync=false
 */
async function fetchUnsyncedEmsOrders() {
  try {
    console.log('🌐 Fazendo requisição para API externa de pedidos EMS...');
    
    const url = 'https://ems--piccadilly.myvtex.com/_v/orders/list';
    const params = {
      '_where': '(isSync%3Dfalse)', // URL encoded: (isSync=false)
      'page': 1,
      'pageSize': 1000
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Cookie': 'VtexWorkspace=master%3A-'
    };
    
    const response = await axios.get(url, {
      params,
      headers,
      timeout: 30000 // 30 segundos de timeout
    });
    
    const orders = Array.isArray(response.data) ? response.data : [];
    console.log(`✅ ${orders.length} pedidos não sincronizados encontrados via API externa`);
    
    return orders;
    
  } catch (error) {
    console.error('❌ Erro ao buscar pedidos não sincronizados na EMS:', error?.response?.data || error.message);
    return []; // Retorna array vazio em caso de erro
  }
}

/**
 * Busca um registro específico na EMS por order e isSync
 * @param {string} orderId - ID do pedido
 * @param {boolean} isSync - Status de sincronização
 * @returns {Promise<Object|null>} Registro encontrado ou null
 */
async function fetchEmsOrderByFilter(orderId, isSync = false) {
  try {
    console.log(`🔍 Buscando registro na EMS: order=${orderId}, isSync=${isSync}`);
    
    const url = 'https://ems--piccadilly.myvtex.com/_v/orders/filter';
    const params = {
      'order': orderId,
      'isSync': isSync.toString()
    };
    
    const headers = {
      'Accept': 'application/json'
    };
    
    const response = await axios.get(url, {
      params,
      headers,
      timeout: 30000 // 30 segundos de timeout
    });
    
    const data = response.data;
    if (data && data.success && data.data && data.data.length > 0) {
      console.log(`✅ Registro encontrado na EMS para ${orderId}`);
      return data.data[0]; // Retorna o primeiro registro encontrado
    } else {
      console.log(`\x1b[41m\x1b[30mℹ️ Nenhum registro encontrado na EMS para ${orderId} com isSync=${isSync}\x1b[0m`);
      return null;
    }
    
  } catch (error) {
    console.error(`❌ Erro ao buscar registro na EMS para ${orderId}:`, error?.response?.data || error.message);
    return null;
  }
}

/**
 * Busca um registro específico na EMS por order (independente do isSync)
 * @param {string} orderId - ID do pedido
 * @returns {Promise<Object|null>} Registro encontrado ou null
 */
async function fetchEmsOrderByOrderId(orderId) {
  try {
    console.log(`🔍 Buscando registro na EMS por order: ${orderId}`);
    
    const url = 'https://ems--piccadilly.myvtex.com/_v/orders/filter';
    const params = {
      'order': orderId
      // Não especifica isSync para buscar independente do status
    };
    
    const headers = {
      'Accept': 'application/json'
    };
    
    const response = await axios.get(url, {
      params,
      headers,
      timeout: 30000 // 30 segundos de timeout
    });
    
    const data = response.data;
    if (data && data.success && data.data && data.data.length > 0) {
      console.log(`✅ Registro encontrado na EMS para ${orderId} (isSync: ${data.data[0].isSync})`);
      return data.data[0]; // Retorna o primeiro registro encontrado
    } else {
      console.log(`ℹ️ Nenhum registro encontrado na EMS para ${orderId}`);
      return null;
    }
    
  } catch (error) {
    console.error(`❌ Erro ao buscar registro na EMS para ${orderId}:`, error?.response?.data || error.message);
    return null;
  }
}

/**
 * Busca registros na EMS por múltiplos filtros (order, item, order_status)
 * @param {string} orderId - ID do pedido
 * @param {string} item - Item do pedido
 * @param {string} orderStatus - Status do pedido
 * @returns {Promise<Object|null>} Registro encontrado ou null
 */
async function fetchEmsOrderByFilters(orderId, item, orderStatus) {
  try {
    console.log(`🔍 Buscando registro na EMS por filtros: order=${orderId}, item=${item}, order_status=${orderStatus}`);
    
    const url = 'https://ems--piccadilly.myvtex.com/_v/orders/filter';
    const params = {
      'order': orderId,
      'item': item,
      'order_status': orderStatus
      // Não especifica isSync para buscar independente do status
    };
    
    const headers = {
      'Accept': 'application/json'
    };
    
    const response = await axios.get(url, {
      params,
      headers,
      timeout: 30000 // 30 segundos de timeout
    });
    
    const data = response.data;
    if (data && data.success && data.data && data.data.length > 0) {
      console.log(`✅ Registro encontrado na EMS para order=${orderId}, item=${item}, order_status=${orderStatus} (isSync: ${data.data[0].isSync})`);
      return data.data[0]; // Retorna o primeiro registro encontrado
    } else {
      console.log(`ℹ️ Nenhum registro encontrado na EMS para order=${orderId}, item=${item}, order_status=${orderStatus}`);
      return null;
    }
    
  } catch (error) {
    console.error(`❌ Erro ao buscar registro na EMS por filtros:`, error?.response?.data || error.message);
    return null;
  }
}

/**
 * Sincroniza um pedido específico na EMS usando PATCH
 * @param {string} orderId - ID do pedido a ser sincronizado
 * @returns {Promise<Object>} Resultado da sincronização
 */
async function syncOrderInEms(orderId) {
  try {
    console.log(`🔄 Sincronizando pedido ${orderId} na EMS...`);
    
    const url = `https://ems--piccadilly.myvtex.com/_v/orders/${orderId}/sync`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Cookie': 'VtexWorkspace=master%3A-'
    };
    const data = {
      isSync: true
    };
    
    const response = await axios.patch(url, data, {
      headers,
      timeout: 30000 // 30 segundos de timeout
    });
    
    console.log(`✅ Pedido ${orderId} sincronizado com sucesso na EMS`);
    return {
      success: true,
      orderId,
      status: response.status,
      data: response.data
    };
    
  } catch (error) {
    console.error(`❌ Erro ao sincronizar pedido ${orderId} na EMS:`, error?.response?.data || error.message);
    return {
      success: false,
      orderId,
      status: error?.response?.status,
      error: error?.response?.data || error.message
    };
  }
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
 * @route GET /api/integration/orders-extract-all
 * @desc Extrai TODOS os pedidos do período (com paginação automática)
 * @param {string} brazilianDate - Data brasileira (YYYY-MM-DD) OU
 * @param {string} startDate - Data inicial UTC (ISO) OU
 * @param {string} toDate - Data final UTC (ISO) OU
 * @param {string} startTime - Horário inicial brasileiro (HH:MM, opcional, padrão: 00:00)
 * @param {string} endTime - Horário final brasileiro (HH:MM, opcional, padrão: 23:59)
 * @param {number} per_page - Número de pedidos por página (opcional, padrão: 100)
 * @param {boolean} batching - Usar processamento em lotes (opcional)
 * @desc Se nenhum parâmetro for fornecido, usa período baseado em ORDERS_SYNC_CRON
 * @example /orders-extract-all?brazilianDate=2025-09-03
 * @example /orders-extract-all?brazilianDate=2025-09-03&startTime=08:00&endTime=18:00
 * @example /orders-extract-all (usa período do cron automaticamente)
 * @access Public
 */
router.get('/orders-extract-all', async (req, res) => {
  try {
    let startDate = req.query.startDate;
    let toDate = req.query.toDate;
    const brazilianDate = req.query.brazilianDate;
    const startTime = req.query.startTime;
    const endTime = req.query.endTime;
    const perPage = parseInt(req.query.per_page) || 50; // Reduzido de 100 para 50
    const useBatching = req.query.batching === 'true';
    const daysPerBatch = parseInt(req.query.daysPerBatch) || 3; // Reduzido de 7 para 3 dias
    const maxOrders = parseInt(req.query.maxOrders) || 200; // Limite máximo de pedidos por execução

    // Novo: Suporte para data brasileira
    if (brazilianDate) {
      const { getBrazilianTimeRangeInUTC } = require('../utils/dateUtils');
      const range = getBrazilianTimeRangeInUTC(brazilianDate, startTime, endTime);
      startDate = range.startUTC;
      toDate = range.endUTC;
      
      // Define dataInicial e dataFinal para compatibilidade
      dataInicial = startDate;
      dataFinal = toDate;
      
      console.log('🇧🇷 Usando data brasileira:', {
        brazilianDate,
        startTime: range.startTime,
        endTime: range.endTime,
        convertedStartUTC: startDate,
        convertedEndUTC: toDate
      });
    } else if (!startDate || !toDate) {
      // Se não há parâmetros, usar período baseado no cron ORDERS_SYNC_CRON
      console.log('🕐 Nenhum parâmetro fornecido, calculando período baseado no cron...');
      
      const { calculatePeriodFromCron } = require('../utils/cronPeriodCalculator');
      const period = calculatePeriodFromCron();
      
      if (period) {
        startDate = period.startDate;
        toDate = period.toDate;
        dataInicial = startDate;
        dataFinal = toDate;
        
        console.log('🕐 Período calculado baseado no cron:', {
          cronExpression: process.env.ORDERS_SYNC_CRON,
          startDate,
          toDate,
          periodType: period.type
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Forneça startDate+toDate (UTC) OU brazilianDate (ex: brazilianDate=2025-09-03&startTime=08:00&endTime=18:00) OU configure ORDERS_SYNC_CRON'
        });
      }
    }

    console.log('🚀 Iniciando extração completa de pedidos (GET):', {
      startDate,
      toDate,
      perPage,
      useBatching      
    });

    // Busca TODOS os pedidos do período usando getAllOrdersInPeriod
    const vtexOrdersService = new (require('../services/vtexOrdersService'))();
    
    try {
      // VALIDAÇÃO DE LOTE DUPLICADO - Antes da ETAPA 1
      console.log('🔍 VALIDAÇÃO: Verificando se lote já existe...');
      
      const fs = require('fs-extra');
      const path = require('path');
      const outputDir = path.join(__dirname, '..', 'exports');
      
      // Verifica se já existe algum arquivo CSV para este período
      const files = await fs.readdir(outputDir);
      const existingBatch = files.find(f => {
        // Procura por arquivos que contenham a data/hora do início do período
        // Exemplo: ems-sl-pcdly-2025-09-02T00-01-00-...
        if (!f.startsWith('ems-sl-pcdly-') || !f.endsWith('.csv')) return false;
        
        // Extrai a data do arquivo e compara com o período solicitado
        const startDateObj = new Date(startDate);
        const year = startDateObj.getUTCFullYear();
        const month = String(startDateObj.getUTCMonth() + 1).padStart(2, '0');
        const day = String(startDateObj.getUTCDate()).padStart(2, '0');
        const hour = String(startDateObj.getUTCHours()).padStart(2, '0');
        const minute = String(startDateObj.getUTCMinutes()).padStart(2, '0');
        
        const expectedStart = `${year}-${month}-${day}T${hour}-${minute}`;
        return f.includes(expectedStart);
      });
      
      if (existingBatch) {
        console.log('⚠️ Lote já existe para este período:', existingBatch);
        const stats = await fs.stat(path.join(outputDir, existingBatch));
        return res.json({
          success: false,
          error: 'Lote já existe para este período',
          message: 'Este período já foi processado. Não é possível executar novamente.',
          existingBatch: {
            filename: existingBatch,
            createdAt: stats.birthtime,
            size: stats.size
          },
          period: {
            brazilianDate,
            startTime,
            endTime,
            startUTC: startDate,
            endUTC: toDate
          },
          timestamp: new Date().toISOString()
        });
      }
      
      console.log('✅ Lote não existe, prosseguindo com a busca...');
      
      console.log('📦 ETAPA 1: Buscando pedidos por período...');
      console.log('📦 -------------OPN-EMS-SALES-SYNC[1]----------------------------');
      
      // Calcula a diferença em dias para decidir automaticamente a estratégia
      const startDateObj = new Date(startDate);
      const toDateObj = new Date(toDate);
      const diffInDays = Math.ceil((toDateObj - startDateObj) / (1000 * 60 * 60 * 24));
      
      // Decide automaticamente: períodos > 7 dias usam lotes (reduzido para economizar memória)
      const shouldUseBatching = diffInDays > 7 || useBatching; // Reduzido de 30 para 7 dias
      
      let ordersList;
      if (shouldUseBatching) {
        console.log(`🔄 Período longo detectado (${diffInDays} dias), usando busca em lotes para evitar limite de páginas...`);
        ordersList = await vtexOrdersService.getAllOrdersInPeriodBatched(startDate, toDate, daysPerBatch);
      } else {
        console.log(`🔄 Período curto (${diffInDays} dias), usando busca normal...`);
        ordersList = await vtexOrdersService.getAllOrdersInPeriod(startDate, toDate, false);
      }
      
      if (!ordersList || ordersList.length === 0) {
        console.log('⚠️ Nenhum pedido encontrado, retornando resposta vazia');
        const { convertToBrazilianTime } = require('../utils/dateUtils');
        const periodBrazil = {
          startDate: convertToBrazilianTime(startDate),
          toDate: convertToBrazilianTime(toDate)
        };
        return res.json({
          success: true,
          message: 'Nenhum pedido encontrado no período especificado',
          data: {
            orders: [],
            totalOrders: 0,
            period: periodBrazil,
            perPage,
            useBatching
          },
          timestamp: new Date().toISOString()
        });
      }

      console.log(`✅ ETAPA 1 concluída: ${ordersList.length} pedidos encontrados`);
      
      // Aplica limite de pedidos para evitar sobrecarga de memória
      if (ordersList.length > maxOrders) {
        console.log(`⚠️ Limite de ${maxOrders} pedidos aplicado (encontrados: ${ordersList.length})`);
        ordersList = ordersList.slice(0, maxOrders);
      }
      
      console.log(`🔍 Iniciando ETAPA 2: Busca de detalhes com envio incremental para o hook (total=${ordersList.length})...`);
      console.log('📦 -------------OPN-EMS-SALES-SYNC[2]----------------------------');
      // ETAPA 2 + 3: Busca detalhes e envia para hook de forma incremental (por pedido)
      const detailedOrders = [];
      const hookResults = {
        total: 0, // Será atualizado baseado nos pedidos que realmente precisam ser enviados
        success: 0,
        failed: 0,
        skipped: 0, // Novos contadores
        alreadySynced: 0,
        errors: []
      };
      
      for (let i = 0; i < ordersList.length; i++) {
        const order = ordersList[i];
        const orderId = order.orderId || order.id;
        
        if (!orderId) {
          console.warn(`⚠️ Pedido sem ID encontrado:`, order);
          continue;
        }

        try {
          const marketplaceValidator = require('../utils/marketplaceValidator');
          console.log(`🔍 Buscando detalhes do pedido ${orderId} (${i + 1}/${ordersList.length})`);

          if (marketplaceValidator.isMarketplaceOrder(orderId)) {
            console.log(`🔄 Pulando pedido de marketplace: ${orderId}`);
            hookResults.skipped++;
          }

          const orderDetail = await vtexOrdersService.getOrderById(orderId);
          if (orderDetail) {
            detailedOrders.push(orderDetail);
            console.log(`✅ Detalhes obtidos para ${orderId} (${detailedOrders.length}/${ordersList.length})`);

              // Extrai dados do pedido para verificação mais precisa
            const item = orderDetail?.items?.[0]?.refId || orderDetail?.items?.[0]?.id;
            const orderStatus = orderDetail?.status;
              
              // Buscar registro na EMS com filtros específicos (order, item, order_status)
            const emsRecord = await fetchEmsOrderByFilters(orderId, item, orderStatus);
              
            if (emsRecord && emsRecord.isSync === false) {
                  console.log(`✅ Pedido ${orderId} já existe no SQLite com isSync=false - pulando processamento`);
                  hookResults.alreadySynced++;
              } else {
                // Registro não existe no SQLite, pode processar
                console.log(`🆕 Pedido ${orderId} não existe no SQLite - processando...`);
                
                // Salvar diretamente no SQLite
                try {
                  const { getDatabase } = require('../database/sqlite');
                  const db = getDatabase();
                  await db.init();
                  
                  // orderDetail já foi buscado anteriormente (linha 900)
                  // Transformar para formato SQLite
                  const formattedOrders = [];
                  if (orderDetail.items && Array.isArray(orderDetail.items)) {
                    for (const item of orderDetail.items) {
                      // Prioriza refId, que é o identificador correto do item
                      const itemRefId = item.refId;
                      
                      // Calcular desconto individual do item usando priceTags
                      const itemDiscount = calculateItemDiscount(item);
                      
                      formattedOrders.push({
                        order: orderId,
                        item: itemRefId,
                        email: orderDetail.clientProfileData?.email || orderDetail.customerEmail || null,
                        quantity: item.quantity || 1,
                        price: item.price || item.sellingPrice || 0,
                        timestamp: orderDetail.creationDate || orderDetail.invoiceCreatedDate || new Date().toISOString(),
                        isSync: false,
                        order_status: orderDetail.status || orderDetail.orderStatus || null,
                        s_channel_source: orderDetail.salesChannel || orderDetail.channel || 'web',
                        s_store_id: 'piccadilly',
                        s_sales_channel: orderDetail.salesChannel || 'ecommerce',
                        s_discount: itemDiscount // Desconto calculado dos priceTags
                      });
                    }
                  } else {
                    // Se não há itens, não deve criar um registro com item igual ao orderId
                    // Isso é um erro de dados - loga mas não cria registro inválido
                    console.warn(`⚠️ Pedido ${orderId} não possui itens - pulando criação de registro`);
                  }
                  
                  // Salvar no SQLite
                  if (formattedOrders.length > 0) {
                    const insertResult = db.insertBatch(formattedOrders);
                    console.log(`✅ Pedido ${orderId} salvo no SQLite (${insertResult.inserted || 0} inseridos, ${insertResult.updated || 0} atualizados)`);
                    hookResults.success++;
                  } else {
                    console.warn(`⚠️ Pedido ${orderId} sem itens para salvar`);
                    hookResults.failed++;
                  }
                } catch (dbError) {
                  console.error(`❌ Falha ao salvar pedido ${orderId} no SQLite:`, dbError.message);
                  hookResults.failed++;
                  hookResults.errors.push({ 
                    orderId, 
                    step: 'sqlite_save', 
                    error: dbError.message
                  });
                }
            }
            

          }

          // Pausa entre requisições para não sobrecarregar (aumentada para reduzir pressão na memória)
          if (i < ordersList.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Aumentado de 500ms para 1000ms
          }
          
          // Força garbage collection a cada 10 pedidos para liberar memória
          if (i % 10 === 0 && global.gc) {
            global.gc();
            console.log(`🧹 Garbage collection executado após ${i + 1} pedidos`);
          }

        } catch (error) {
          console.error(`❌ Erro ao buscar detalhes do pedido ${orderId}:`, error?.data || error.message);
          // Continua com os próximos pedidos mesmo se um falhar
        }
      }

      console.log(`✅ ETAPA 2/3 concluídas: ${detailedOrders.length} detalhes obtidos`);
      console.log(`📊 Estatísticas do Processamento: ${hookResults.success}/${hookResults.total} processados com sucesso (${hookResults.failed} falhas, ${hookResults.alreadySynced} já sincronizados, ${hookResults.skipped} pulados)`);
      console.log(`📊 ETAPA 3: GERAR CSV`);
      console.log('📦 -------------OPN-EMS-SALES-SYNC[3]----------------------------');
      
      let csvResult = null;
      if (detailedOrders.length > 0) {
        console.log('📄 ETAPA 4: Iniciando geração de CSV via syncOrders...');
        console.log('📦 -------------OPN-EMS-SALES-SYNC[4]----------------------------');
        try {
          const syncResult = await vtexOrdersService.syncOrders({
            orders: detailedOrders,
            dataInicial: startDate,
            dataFinal: toDate,
            pageSize: 100
            
          });
          
          csvResult = {
            success: syncResult.success,
            csvGenerated: syncResult.csvResult?.success || false,
            emarsysSent: syncResult.emarsysSendResult?.success || false,
            totalOrders: syncResult.totalOrders || 0,
            transformedOrders: syncResult.transformedOrders || 0,
            message: syncResult.message || 'CSV gerado com sucesso'
          };
          
          console.log(`✅ ETAPA 4 concluída: CSV ${csvResult.csvGenerated ? 'gerado' : 'falhou'}, Emarsys ${csvResult.emarsysSent ? 'enviado' : 'falhou'}`);
        } catch (syncError) {
          console.error('❌ Erro na ETAPA 4 (syncOrders):', syncError);
          csvResult = {
            success: false,
            error: syncError.message,
            csvGenerated: false,
            emarsysSent: false
          };
        }
      } else {
        console.log('⏭️ ETAPA 4 pulada: Nenhum pedido para gerar CSV');
        csvResult = {
          success: true,
          skipped: true,
          message: 'Nenhum pedido para gerar CSV'
        };
      }
      
      console.log('🎉 Fluxo completo concluído, enviando resposta...');
      // Resposta final
      const { convertToBrazilianTime } = require('../utils/dateUtils');
      const periodBrazil = {
        startDate: convertToBrazilianTime(startDate),
        toDate: convertToBrazilianTime(toDate)
      };
      res.json({
        success: true,
        message: 'Fluxo completo executado: Extração → Hook → CSV → Emarsys',
        data: {
          totalOrdersDetailed: detailedOrders.length,
          period: periodBrazil,
          perPage,
          useBatching,
          summary: {
            ordersFound: ordersList.length,
            ordersWithDetails: detailedOrders.length,
            ordersFailed: ordersList.length - detailedOrders.length,
            hookSent: hookResults.success,
            hookFailed: hookResults.failed,
            hookSkipped: hookResults.skipped,
            hookAlreadySynced: hookResults.alreadySynced,
          },
          csv: csvResult,
          hookErrorsSample: hookResults.errors.slice(0, 5),
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
    const { hoursToKeep = parseInt(process.env.PROCESSED_ORDERS_RETENTION_HOURS) || 720 } = req.body || {};
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

// ===== ENDPOINTS DE REPROCESSAMENTO E RETRY =====

/**
 * @route GET /api/integration/retry-stats
 * @desc Obtém estatísticas da fila de reprocessamento
 * @access Public
 */
router.get('/retry-stats', async (req, res) => {
  try {
    const retryService = new RetryService();
    const stats = await retryService.getRetryStats();
    
    res.json({
      success: true,
      data: stats,
      timestamp: getBrazilianTimestamp()
    });
  } catch (error) {
    logHelpers.logFailure('retry-stats', error, req, { endpoint: '/api/integration/retry-stats' });
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: getBrazilianTimestamp()
    });
  }
});

/**
 * @route POST /api/integration/process-retry-queue
 * @desc Processa manualmente a fila de reprocessamento
 * @access Public
 */
router.post('/process-retry-queue', async (req, res) => {
  try {
    const retryService = new RetryService();
    const result = await retryService.processRetryQueue();
    
    logHelpers.logRetry('manual-process', 1, 'completed', result);
    
    res.json({
      success: true,
      message: 'Fila de reprocessamento processada',
      data: result,
      timestamp: getBrazilianTimestamp()
    });
  } catch (error) {
    logHelpers.logFailure('process-retry-queue', error, req, { endpoint: '/api/integration/process-retry-queue' });
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: getBrazilianTimestamp()
    });
  }
});

/**
 * @route POST /api/integration/retry-failed-sync
 * @desc Reprocessa uma sincronização que falhou
 * @access Public
 * @body {string} startDate - Data inicial
 * @body {string} toDate - Data final
 * @body {string} type - Tipo de reprocessamento (sync-orders, csv-generation, emarsys-sync)
 */
router.post('/retry-failed-sync', async (req, res) => {
  try {
    const { startDate, toDate, type = 'sync-orders' } = req.body;
    
    if (!startDate || !toDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate e toDate são obrigatórios',
        timestamp: getBrazilianTimestamp()
      });
    }

    const retryService = new RetryService();
    const retryId = await retryService.addToRetryQueue({
      type,
      payload: { startDate, toDate },
      error: { message: 'Reprocessamento manual solicitado' },
      context: { manual: true, requestedBy: req.ip }
    });

    logHelpers.logRetry(retryId, 1, 'manual-request', { startDate, toDate, type });
    
    res.json({
      success: true,
      message: 'Reprocessamento adicionado à fila',
      data: { retryId, type, startDate, toDate },
      timestamp: getBrazilianTimestamp()
    });
  } catch (error) {
    logHelpers.logFailure('retry-failed-sync', error, req, { body: req.body });
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: getBrazilianTimestamp()
    });
  }
});

/**
 * @route POST /api/integration/cleanup-retry-queue
 * @desc Limpa a fila de reprocessamento (remove itens antigos)
 * @access Public
 * @body {number} daysToKeep - Dias para manter (padrão: 7)
 */
router.post('/cleanup-retry-queue', async (req, res) => {
  try {
    const { daysToKeep = 7 } = req.body;
    const retryService = new RetryService();
    const result = await retryService.cleanupRetryQueue(daysToKeep);
    
    logHelpers.logAudit('cleanup-retry-queue', req.ip, { daysToKeep, removed: result.removed });
    
    res.json({
      success: true,
      message: 'Fila de reprocessamento limpa',
      data: result,
      timestamp: getBrazilianTimestamp()
    });
  } catch (error) {
    logHelpers.logFailure('cleanup-retry-queue', error, req, { body: req.body });
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: getBrazilianTimestamp()
    });
  }
});

/**
 * @route GET /api/integration/sync-status
 * @desc Obtém status completo da sincronização
 * @access Public
 */
router.get('/sync-status', async (req, res) => {
  try {
    const vtexOrdersService = new VtexOrdersService();
    const retryService = new RetryService();
    
    const [lastSyncInfo, retryStats] = await Promise.all([
      vtexOrdersService.getLastSyncInfo(),
      retryService.getRetryStats()
    ]);
    
    // Converte datas para fuso horário brasileiro
    const brazilianLastSync = {
      ...lastSyncInfo,
      lastSync: lastSyncInfo.lastSync ? convertToBrazilianTime(lastSyncInfo.lastSync) : null
    };
    
    res.json({
      success: true,
      data: {
        lastSync: brazilianLastSync,
        retryQueue: retryStats,
        systemStatus: {
          healthy: retryStats.pending === 0,
          hasFailures: retryStats.failed > 0,
          needsAttention: retryStats.pending > 0 || retryStats.failed > 0
        }
      },
      timestamp: getBrazilianTimestamp()
    });
  } catch (error) {
    logHelpers.logFailure('sync-status', error, req, { endpoint: '/api/integration/sync-status' });
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: getBrazilianTimestamp()
    });
  }
});

/**
 * @route GET /api/integration/system-monitor
 * @desc Obtém monitoramento completo do sistema
 * @access Public
 */
router.get('/system-monitor', async (req, res) => {
  try {
    const SystemMonitor = require('../services/systemMonitor');
    const systemMonitor = new SystemMonitor();
    const systemStats = await systemMonitor.getSystemStats();
    
    res.json({
      success: true,
      data: systemStats,
      timestamp: getBrazilianTimestamp()
    });
  } catch (error) {
    logHelpers.logFailure('system-monitor', error, req, { endpoint: '/api/integration/system-monitor' });
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: getBrazilianTimestamp()
    });
  }
});

/**
 * @route GET /api/integration/restart-log
 * @desc Obtém log de reinicializações do sistema
 * @access Public
 */
router.get('/restart-log', async (req, res) => {
  try {
    const fs = require('fs-extra');
    const path = require('path');
    const restartLogFile = path.join(__dirname, '..', 'data', 'restart-log.json');
    
    let restartLog = [];
    if (await fs.pathExists(restartLogFile)) {
      restartLog = await fs.readJson(restartLogFile);
    }
    
    // Converte timestamps para fuso horário brasileiro
    const brazilianRestartLog = restartLog.map(entry => ({
      ...entry,
      timestamp: convertToBrazilianTime(entry.timestamp)
    }));
    
    res.json({
      success: true,
      data: {
        restarts: brazilianRestartLog,
        totalRestarts: restartLog.length,
        lastRestart: restartLog.length > 0 ? convertToBrazilianTime(restartLog[restartLog.length - 1].timestamp) : null
      },
      timestamp: getBrazilianTimestamp()
    });
  } catch (error) {
    logHelpers.logFailure('restart-log', error, req, { endpoint: '/api/integration/restart-log' });
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: getBrazilianTimestamp()
    });
  }
});

module.exports = router; 