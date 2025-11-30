const express = require('express');
const router = express.Router();
const { logHelpers } = require('../utils/logger');

// Usar armazenamento global para compatibilidade com outros endpoints
if (!global.jobStatus) {
  global.jobStatus = new Map();
}
const jobStatus = global.jobStatus;

// Middleware para log de requisições
router.use((req, res, next) => {
  logHelpers.logOrders('info', '🔄 [Background Jobs] Requisição recebida', {
    method: req.method,
    path: req.path
  });
  next();
});

// POST /api/background/sync-products
// Inicia sincronização de produtos em background
router.post('/sync-products', async (req, res) => {
  try {
    const { maxProducts = 0, forceRefresh = false, batchSize = 50 } = req.body;
    
    console.log(`🚀 [Background] Iniciando sync de produtos: maxProducts=${maxProducts}`);
    
    // Gerar ID único para o job
    const jobId = `sync-products-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Inicializar status do job
    jobStatus.set(jobId, {
      id: jobId,
      type: 'sync-products',
      status: 'starting',
      progress: 0,
      startTime: new Date().toISOString(),
      config: { maxProducts, forceRefresh, batchSize }
    });
    
    // Executar sincronização diretamente em background
    setImmediate(async () => {
      try {
        const vtexProductService = require('../services/vtexProductService');
        const result = await vtexProductService.syncProducts({ maxProducts, forceRefresh, batchSize });
        
        // Atualizar status do job
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'completed',
          progress: 100,
          endTime: new Date().toISOString(),
          result
        });
      } catch (error) {
        console.error(`❌ Erro no sync de produtos ${jobId}:`, error);
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'failed',
          progress: 0,
          endTime: new Date().toISOString(),
          error: error.message
        });
      }
    });
    
    // Atualizar status para running
    jobStatus.set(jobId, {
      ...jobStatus.get(jobId),
      status: 'running',
      progress: 5
    });
    
    res.json({
      success: true,
      jobId,
      message: 'Sincronização de produtos iniciada em background',
      checkStatus: `/api/background/status/${jobId}`,
      config: { maxProducts, forceRefresh, batchSize }
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao iniciar sync de produtos: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST/GET /api/background/cron-orders
// Nova rota para cron jobs usando ordersSyncService (SQLite)
// Inicia sincronização de pedidos em background
// Aceita parâmetros tanto no body (POST) quanto na query string (GET)
async function handleCronOrders(req, res) {
  // LOG ABSOLUTO NO INÍCIO - ANTES DE QUALQUER COISA
  process.stderr.write('🔴 [Background] FUNÇÃO handleCronOrders CHAMADA!\n');
  process.stderr.write(`🔴 [Background] URL: ${req.url}\n`);
  process.stderr.write(`🔴 [Background] Query: ${JSON.stringify(req.query)}\n`);
  
  try {
   // Log imediato para debug - FORÇAR SAÍDA
   console.error('📥 [Background] ========== INÍCIO handleCronOrders ==========');
   console.error('📥 [Background] Requisição recebida (cron-orders):', {
     method: req.method,
     url: req.url,
     originalUrl: req.originalUrl,
     query: req.query,
     body: req.body,
     queryKeys: Object.keys(req.query || {}),
     bodyKeys: Object.keys(req.body || {}),
     queryString: req.url.split('?')[1] || 'N/A'
   });
   
   // Aceita parâmetros do body (POST) ou query string (GET)
   // Se req.query estiver vazio mas houver query string na URL, tentar parsear manualmente
   let queryParams = req.query;
   console.error('🔍 [Background] req.query inicial:', {
     query: req.query,
     queryKeys: Object.keys(req.query || {}),
     url: req.url,
     originalUrl: req.originalUrl,
     hasQueryString: req.url.includes('?')
   });
   
   if (Object.keys(req.query || {}).length === 0 && req.url.includes('?')) {
     const url = require('url');
     // Tentar com req.url e req.originalUrl
     const urlToParse = req.originalUrl || req.url;
     const parsedUrl = url.parse(urlToParse, true);
     queryParams = parsedUrl.query || {};
     console.error('⚠️ [Background] req.query estava vazio, parseando manualmente:', {
       queryString: req.url.split('?')[1],
       originalUrl: req.originalUrl,
       parsedQuery: queryParams,
       parsedKeys: Object.keys(queryParams)
     });
   }
   
   // Prioriza query string se body estiver vazio, caso contrário prioriza body
   const params = Object.keys(req.body || {}).length > 0 
     ? { ...queryParams, ...req.body }  // Body tem prioridade se não estiver vazio
     : { ...queryParams };               // Query string se body estiver vazio
   
   console.error('📥 [Background] Parâmetros mesclados (cron-orders):', {
     params,
     paramsKeys: Object.keys(params)
   });
   const { 
      maxOrders = 0, 
      dateFrom, 
      dateTo, 
      startDate, 
      toDate, 
      brazilianDate, 
      startTime, 
      endTime 
    } = params;
    
    console.error('🔍 [Background] Parâmetros extraídos:', {
      maxOrders,
      dateFrom,
      dateTo,
      startDate,
      toDate,
      brazilianDate,
      startTime,
      endTime,
      hasBrazilianDate: !!brazilianDate,
      hasStartTime: !!startTime,
      hasEndTime: !!endTime
    });
    
    // Converter maxOrders para número se vier da query string
    const maxOrdersNum = parseInt(maxOrders, 10) || 0;
    
    let finalStartDate = null;
    let finalToDate = null;
    const missingParams = [];
    
    // Validação: verificar qual formato de data foi fornecido
    if (brazilianDate) {
      console.log('✅ [Background] brazilianDate encontrado:', brazilianDate);
      // Se brazilianDate foi fornecido, startTime e endTime são obrigatórios
      if (!startTime) {
        missingParams.push('startTime');
      }
      if (!endTime) {
        missingParams.push('endTime');
      }
      
      if (missingParams.length > 0) {
        console.error('❌ [Background] Parâmetros obrigatórios faltando para brazilianDate:', {
          brazilianDate,
          missingParams,
          receivedParams: { brazilianDate, startTime, endTime }
        });
        return res.status(400).json({
          success: false,
          error: `Parâmetros obrigatórios faltando: ${missingParams.join(', ')}`,
          message: `Quando usar brazilianDate, os parâmetros startTime e endTime são obrigatórios`,
          receivedParams: {
            brazilianDate,
            startTime: startTime || null,
            endTime: endTime || null
          },
          requiredParams: {
            brazilianDate: 'Data no formato YYYY-MM-DD',
            startTime: 'Horário inicial no formato HH:MM (ex: 15:00)',
            endTime: 'Horário final no formato HH:MM (ex: 15:25)'
          }
        });
      }
      
      // Processar data brasileira
      const { getBrazilianTimeRangeInUTC } = require('../utils/dateUtils');
      console.log('📅 [Background] Processando data brasileira:', {
        brazilianDate,
        startTime,
        endTime
      });
      const range = getBrazilianTimeRangeInUTC(brazilianDate, startTime, endTime);
      finalStartDate = range.startUTC;
      finalToDate = range.endUTC;
      
      console.log('✅ [Background] Data brasileira convertida:', {
        brazilianDate,
        startTime,
        endTime,
        convertedStartUTC: finalStartDate,
        convertedEndUTC: finalToDate
      });
      
      logHelpers.logOrders('info', '📅 [Background] Data brasileira processada (cron-orders)', {
        brazilianDate,
        startTime,
        endTime,
        convertedStartUTC: finalStartDate,
        convertedEndUTC: finalToDate
      });
    } else {
      // Se brazilianDate não foi fornecido, startDate/toDate são obrigatórios
      finalStartDate = startDate || dateFrom;
      finalToDate = toDate || dateTo;
      
      if (!finalStartDate) {
        missingParams.push('startDate ou dateFrom');
      }
      if (!finalToDate) {
        missingParams.push('toDate ou dateTo');
      }
      
      if (missingParams.length > 0) {
        console.error('❌ [Background] Datas não definidas:', {
          startDate,
          toDate,
          dateFrom,
          dateTo,
          missingParams
        });
        return res.status(400).json({
          success: false,
          error: `Parâmetros obrigatórios faltando: ${missingParams.join(', ')}`,
          message: 'Forneça brazilianDate + startTime + endTime OU startDate/toDate (ou dateFrom/dateTo)',
          receivedParams: {
            brazilianDate: brazilianDate || null,
            startTime: startTime || null,
            endTime: endTime || null,
            startDate: startDate || null,
            toDate: toDate || null,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null
          },
          requiredParams: {
            option1: {
              brazilianDate: 'Data no formato YYYY-MM-DD',
              startTime: 'Horário inicial no formato HH:MM',
              endTime: 'Horário final no formato HH:MM'
            },
            option2: {
              startDate: 'Data inicial em formato ISO UTC (ex: 2025-11-18T15:00:00Z)',
              toDate: 'Data final em formato ISO UTC (ex: 2025-11-18T15:25:00Z)'
            }
          }
        });
      }
      
      console.log('✅ [Background] Usando datas UTC fornecidas:', {
        startDate: finalStartDate,
        toDate: finalToDate
      });
    }
    
    // Validação final: garantir que as datas foram definidas
    console.log('🔍 [Background] Verificando datas finais antes da validação:', {
      finalStartDate,
      finalToDate,
      isStartDateNull: !finalStartDate,
      isEndDateNull: !finalToDate,
      willFailValidation: !finalStartDate || !finalToDate
    });
    
    if (!finalStartDate || !finalToDate) {
      console.error('❌ [Background] ERRO CRÍTICO: Datas não foram definidas após processamento:', {
        brazilianDate,
        startTime,
        endTime,
        startDate,
        toDate,
        dateFrom,
        dateTo,
        finalStartDate,
        finalToDate,
        params: {
          maxOrders,
          dateFrom,
          dateTo,
          startDate,
          toDate,
          brazilianDate,
          startTime,
          endTime
        }
      });
      return res.status(400).json({
        success: false,
        error: 'Datas não foram definidas após processamento',
        message: 'Erro interno: as datas não foram processadas corretamente. Verifique os logs do servidor.',
        debug: {
          receivedParams: {
            brazilianDate: brazilianDate || null,
            startTime: startTime || null,
            endTime: endTime || null,
            startDate: startDate || null,
            toDate: toDate || null,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null
          },
          processedDates: {
            finalStartDate: finalStartDate || null,
            finalToDate: finalToDate || null
          }
        }
      });
    } else {
      console.error('✅ [Background] Validação passou - datas definidas:', {
        finalStartDate,
        finalToDate
      });
    }
    
    console.error('🚀 [Background] ANTES DO LOG FINAL - Verificando variáveis:', {
      maxOrdersNum,
      finalStartDate,
      finalToDate,
      brazilianDate,
      startTime,
      endTime
    });
    
    console.log(`🚀 [Background] Iniciando cron sync de pedidos (SQLite): maxOrders=${maxOrdersNum}, dataInicial=${finalStartDate}, dataFinal=${finalToDate}`);
    
    // Gerar ID único para o job
    const jobId = `cron-orders-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Inicializar status do job
    jobStatus.set(jobId, {
      id: jobId,
      type: 'cron-orders',
      status: 'starting',
      progress: 0,
      startTime: new Date().toISOString(),
      config: { 
        maxOrders: maxOrdersNum, 
        dateFrom: finalStartDate, 
        dateTo: finalToDate,
        brazilianDate,
        startTime,
        endTime
      }
    });
    
    // Executar sincronização de orders diretamente em background usando ordersSyncService
    setImmediate(async () => {
      try {
        console.log('🔍 [Background] Chamando ordersSyncService.syncOrders com:', {
          maxOrders: maxOrdersNum,
          dataInicial: finalStartDate,
          dataFinal: finalToDate,
          brazilianDate,
          startTime,
          endTime
        });
        const OrdersSyncService = require('../services/ordersSyncService');
        const ordersSyncService = new OrdersSyncService();
        const result = await ordersSyncService.syncOrders({ 
          maxOrders: maxOrdersNum, 
          dataInicial: finalStartDate, 
          dataFinal: finalToDate,
          brazilianDate: brazilianDate,
          startTime: startTime,
          endTime: endTime
        });
        console.log('✅ [Background] Resultado do syncOrders:', {
          success: result.success,
          totalOrders: result.totalOrders,
          message: result.message
        });
        
        // Atualizar status do job
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'completed',
          progress: 100,
          endTime: new Date().toISOString(),
          result
        });
      } catch (error) {
        console.error(`❌ Erro no cron sync de orders ${jobId}:`, error);
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'failed',
          progress: 0,
          endTime: new Date().toISOString(),
          error: error.message
        });
      }
    });
    
    // Atualizar status para running
    jobStatus.set(jobId, {
      ...jobStatus.get(jobId),
      status: 'running',
      progress: 5
    });
    
    res.json({
      success: true,
      jobId,
      message: 'Sincronização de pedidos (cron) iniciada em background',
      checkStatus: `/api/background/status/${jobId}`,
      config: { 
        maxOrders: maxOrdersNum, 
        dateFrom: finalStartDate, 
        dateTo: finalToDate,
        brazilianDate,
        startTime,
        endTime
      }
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao iniciar cron sync de pedidos: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Registrar a rota para ambos POST e GET
router.post('/cron-orders', handleCronOrders);
router.get('/cron-orders', handleCronOrders);

// DELETE /api/background/clear-orders
// Limpa registros do SQLite
router.delete('/clear-orders', async (req, res) => {
  try {
    const { onlyPending = false, confirm = false } = req.body;
    
    if (!confirm) {
      return res.status(400).json({
        success: false,
        error: 'Confirmação necessária',
        message: 'Envie { "confirm": true } no body para confirmar a limpeza'
      });
    }
    
    const OrdersSyncService = require('../services/ordersSyncService');
    const ordersSyncService = new OrdersSyncService();
    await ordersSyncService.initDatabase();
    
    const result = ordersSyncService.db.clearOrders(onlyPending);
    
    if (result.success) {
      const stats = ordersSyncService.db.getStats();
      return res.json({
        success: true,
        deleted: result.deleted,
        message: result.message,
        stats: {
          total: stats.total,
          pending: stats.pending,
          synced: stats.synced
        }
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Erro ao limpar orders:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/background/sync-orders
// Rota original mantida intacta (usa serviços antigos)
// Inicia sincronização de pedidos em background
router.post('/sync-orders', async (req, res) => {
  try {
    const { maxOrders = 0, dateFrom, dateTo } = req.body;
    
    console.log(`🚀 [Background] Iniciando sync de pedidos: maxOrders=${maxOrders}`);
    
    // Gerar ID único para o job
    const jobId = `sync-orders-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Inicializar status do job
    jobStatus.set(jobId, {
      id: jobId,
      type: 'sync-orders',
      status: 'starting',
      progress: 0,
      startTime: new Date().toISOString(),
      config: { maxOrders, dateFrom, dateTo }
    });
    
    // Executar sincronização de orders diretamente em background (serviços originais)
    setImmediate(async () => {
      try {
        const VtexOrdersService = require('../services/vtexOrdersService');
        const vtexOrdersService = new VtexOrdersService();
        const result = await vtexOrdersService.syncOrders({ maxOrders, dateFrom, dateTo });
        
        // Atualizar status do job
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'completed',
          progress: 100,
          endTime: new Date().toISOString(),
          result
        });
      } catch (error) {
        console.error(`❌ Erro no sync de orders ${jobId}:`, error);
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'failed',
          progress: 0,
          endTime: new Date().toISOString(),
          error: error.message
        });
      }
    });
    
    // Atualizar status para running
    jobStatus.set(jobId, {
      ...jobStatus.get(jobId),
      status: 'running',
      progress: 5
    });
    
    res.json({
      success: true,
      jobId,
      message: 'Sincronização de pedidos iniciada em background',
      checkStatus: `/api/background/status/${jobId}`,
      config: { maxOrders, dateFrom, dateTo }
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao iniciar sync de pedidos: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/background/orders-extract-all
// Inicia extração completa de pedidos em background (evita timeout)
router.post('/orders-extract-all', async (req, res) => {
  try {
    const { 
      brazilianDate, 
      startDate, 
      toDate, 
      startTime, 
      endTime, 
      per_page = 50, 
      batching = true, 
      daysPerBatch = 1, 
      maxOrders = 100 
    } = req.body;
    
    logHelpers.logOrders('info', '🚀 [Background] Iniciando extração de pedidos', {
      brazilianDate,
      startDate,
      toDate,
      batching,
      daysPerBatch,
      maxOrders
    });
    
    // Gerar ID único para o job
    const jobId = `orders-extract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Inicializar status do job
    jobStatus.set(jobId, {
      id: jobId,
      type: 'orders-extract-all',
      status: 'starting',
      progress: 0,
      startTime: new Date().toISOString(),
      config: { 
        brazilianDate, 
        startDate, 
        toDate, 
        startTime, 
        endTime, 
        per_page, 
        batching, 
        daysPerBatch, 
        maxOrders 
      }
    });
    
    logHelpers.logOrders('info', '📋 [Background] Job criado', {
      jobId,
      type: 'orders-extract-all',
      status: 'starting'
    });
    
    // Executar extração diretamente em background
    setImmediate(async () => {
      try {
        const VtexOrdersService = require('../services/vtexOrdersService');
        const vtexOrdersService = new VtexOrdersService();
        
        // Atualizar status para running
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'running',
          progress: 10
        });
        
        logHelpers.logOrders('info', '▶️ [Background] Job em execução', {
          jobId,
          status: 'running',
          progress: 10
        });
        
        let finalStartDate = startDate;
        let finalToDate = toDate;
        
        // Processar data brasileira se fornecida
        if (brazilianDate) {
          const { getBrazilianTimeRangeInUTC } = require('../utils/dateUtils');
          const range = getBrazilianTimeRangeInUTC(brazilianDate, startTime, endTime);
          finalStartDate = range.startUTC;
          finalToDate = range.endUTC;
          
          logHelpers.logOrders('info', '📅 [Background] Data brasileira processada', {
            jobId,
            brazilianDate,
            convertedStartUTC: finalStartDate,
            convertedEndUTC: finalToDate
          });
        }
        
        // Atualizar progresso
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          progress: 20
        });
        
        let ordersList;
        if (batching) {
          logHelpers.logOrders('info', '🔄 [Background] Usando processamento em lotes', {
            jobId,
            daysPerBatch,
            startDate: finalStartDate,
            toDate: finalToDate
          });
          ordersList = await vtexOrdersService.getAllOrdersInPeriodBatched(finalStartDate, finalToDate, daysPerBatch);
        } else {
          logHelpers.logOrders('info', '🔄 [Background] Usando busca normal', {
            jobId,
            startDate: finalStartDate,
            toDate: finalToDate
          });
          ordersList = await vtexOrdersService.getAllOrdersInPeriod(finalStartDate, finalToDate, false);
        }
        
        logHelpers.logOrders('info', '📊 [Background] Pedidos obtidos da VTEX', {
          jobId,
          totalOrders: ordersList.length,
          startDate: finalStartDate,
          toDate: finalToDate
        });
        
        // Atualizar progresso
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          progress: 60
        });
        
        // Aplicar limite de pedidos se especificado
        if (maxOrders && ordersList.length > maxOrders) {
          logHelpers.logOrders('warn', '⚠️ [Background] Aplicando limite de pedidos', {
            jobId,
            maxOrders,
            totalFound: ordersList.length,
            willProcess: maxOrders
          });
          ordersList = ordersList.slice(0, maxOrders);
        }
        
        // Atualizar progresso
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          progress: 80
        });
        
        if (ordersList.length > 0) {
          logHelpers.logOrders('info', '📤 [Background] Enviando pedidos para o hook', {
            jobId,
            totalToSend: ordersList.length
          });
          
          const hookResults = {
            success: 0,
            failed: 0,
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
              const sendResult = await vtexOrdersService.sendOrderToHook(orderId);
              if (sendResult.success) {
                hookResults.success++;
              } else {
                hookResults.failed++;
                hookResults.errors.push({ 
                  orderId, 
                  error: sendResult.error 
                });
              }
            } catch (hookError) {
              hookResults.failed++;
              hookResults.errors.push({ 
                orderId, 
                error: hookError.message 
              });
              console.error(`❌ Erro ao enviar pedido ${orderId} para hook:`, hookError.message);
            }
            
            // Pequena pausa entre requisições
            if (i < ordersList.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
          
          logHelpers.logOrders('info', '✅ [Background] Envio para hook concluído', {
            jobId,
            totalOrders: ordersList.length,
            successfulSends: hookResults.success,
            failedSends: hookResults.failed,
            errors: hookResults.errors.slice(0, 5) // Log apenas os primeiros 5 erros
          });
          
          logHelpers.logOrders('info', '⏳ [Background] Aguardando processamento do hook...', {
            jobId,
            waitTime: '2 segundos'
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Atualizar progresso
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          progress: 85
        });
        
        // Processar pedidos (gerar CSV, enviar para Emarsys, etc.)
        let processingResult = null;
        if (ordersList.length > 0) {
          logHelpers.logOrders('info', '⚙️ [Background] Iniciando processamento de pedidos', {
            jobId,
            totalToProcess: ordersList.length
          });
          
          // Usa vtexOrdersService.syncOrders que já faz todo o fluxo completo
          processingResult = await vtexOrdersService.syncOrders({
            orders: ordersList,
            dataInicial: finalStartDate,
            dataFinal: finalToDate
          });
          
          logHelpers.logOrders('info', '✅ [Background] Processamento concluído', {
            jobId,
            processingResult
          });
        } else {
          logHelpers.logOrders('info', 'ℹ️ [Background] Nenhum pedido encontrado no período', {
            jobId,
            startDate: finalStartDate,
            toDate: finalToDate
          });
        }
        
        // Atualizar status do job
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'completed',
          progress: 100,
          endTime: new Date().toISOString(),
          result: {
            totalOrders: ordersList.length,
            ordersProcessed: processingResult?.transformedOrders || 0,
            csvGenerated: processingResult?.csvResult?.success || false,
            emarsysSent: processingResult?.emarsysSendResult?.success || false,
            csvFile: processingResult?.csvResult?.filename || null,
            period: {
              startDate: finalStartDate,
              toDate: finalToDate,
              brazilianDate,
              startTime,
              endTime
            }
          }
        });
        
        logHelpers.logOrders('info', '🎉 [Background] Job finalizado com sucesso', {
          jobId,
          status: 'completed',
          totalOrders: ordersList.length,
          csvGenerated: processingResult?.csvResult?.success || false,
          csvFile: processingResult?.csvResult?.filename || null
        });
        
      } catch (error) {
        logHelpers.logOrders('error', '❌ [Background] Erro na extração de pedidos', {
          jobId,
          errorMessage: error.message,
          errorStack: error.stack
        });
        
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'failed',
          progress: 0,
          endTime: new Date().toISOString(),
          error: error.message,
          errorStack: error.stack
        });
      }
    });
    
    res.json({
      success: true,
      jobId,
      message: 'Extração de pedidos iniciada em background - evita timeout de 1 minuto',
      checkStatus: `/api/background/status/${jobId}`,
      config: { 
        brazilianDate, 
        startDate, 
        toDate, 
        startTime, 
        endTime, 
        per_page, 
        batching, 
        daysPerBatch, 
        maxOrders 
      },
      instructions: {
        pt: 'Use o endpoint checkStatus para acompanhar o progresso',
        en: 'Use the checkStatus endpoint to track progress'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao iniciar extração de pedidos: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/background/sync-complete
// Inicia sincronização completa (produtos + pedidos) em background
router.post('/sync-complete', async (req, res) => {
  try {
    const { maxProducts = 0, maxOrders = 0 } = req.body;
    
    console.log(`🚀 [Background] Iniciando sync completo: maxProducts=${maxProducts}, maxOrders=${maxOrders}`);
    
    // Gerar ID único para o job
    const jobId = `sync-complete-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Inicializar status do job
    jobStatus.set(jobId, {
      id: jobId,
      type: 'sync-complete',
      status: 'starting',
      progress: 0,
      startTime: new Date().toISOString(),
      config: { maxProducts, maxOrders }
    });
    
    // Executar sincronização completa diretamente em background
    setImmediate(async () => {
      try {
        // Primeiro sincroniza produtos
        const vtexProductService = require('../services/vtexProductService');
        const productsResult = await vtexProductService.syncProducts({ maxProducts });
        
        // Aguarda um pouco antes de sincronizar orders
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 segundos
        
        // Depois sincroniza orders
        const VtexOrdersService = require('../services/vtexOrdersService');
        const vtexOrdersService = new VtexOrdersService();
        const ordersResult = await vtexOrdersService.syncOrders({ maxOrders });
        
        // Atualizar status do job
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'completed',
          progress: 100,
          endTime: new Date().toISOString(),
          result: {
            products: productsResult,
            orders: ordersResult
          }
        });
      } catch (error) {
        console.error(`❌ Erro no sync completo ${jobId}:`, error);
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'failed',
          progress: 0,
          endTime: new Date().toISOString(),
          error: error.message
        });
      }
    });
    
    // Atualizar status para running
    jobStatus.set(jobId, {
      ...jobStatus.get(jobId),
      status: 'running',
      progress: 5
    });
    
    res.json({
      success: true,
      jobId,
      message: 'Sincronização completa iniciada em background',
      checkStatus: `/api/background/status/${jobId}`,
      config: { maxProducts, maxOrders }
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao iniciar sync completo: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/background/status/:jobId
// Verifica o status de um job específico
router.get('/status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = jobStatus.get(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job não encontrado'
      });
    }
    
    // Calcular tempo de execução
    const startTime = new Date(job.startTime);
    const now = new Date();
    const duration = Math.round((now - startTime) / 1000); // segundos
    
    res.json({
      success: true,
      job: {
        ...job,
        duration,
        durationFormatted: `${Math.floor(duration / 60)}m ${duration % 60}s`
      }
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao verificar status: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/background/jobs
// Lista todos os jobs
router.get('/jobs', (req, res) => {
  try {
    const { status, type, limit = 50 } = req.query;
    
    let jobs = Array.from(jobStatus.values());
    
    // Filtrar por status
    if (status) {
      jobs = jobs.filter(job => job.status === status);
    }
    
    // Filtrar por tipo
    if (type) {
      jobs = jobs.filter(job => job.type === type);
    }
    
    // Ordenar por data de início (mais recentes primeiro)
    jobs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    // Limitar resultados
    jobs = jobs.slice(0, parseInt(limit));
    
    // Calcular estatísticas
    const stats = {
      total: jobStatus.size,
      running: jobs.filter(job => job.status === 'running').length,
      completed: jobs.filter(job => job.status === 'completed').length,
      failed: jobs.filter(job => job.status === 'failed').length
    };
    
    res.json({
      success: true,
      jobs,
      stats,
      total: jobs.length
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao listar jobs: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/background/jobs/:jobId
// Remove um job do histórico
router.delete('/jobs/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = jobStatus.get(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job não encontrado'
      });
    }
    
    // Só permite remover jobs finalizados
    if (job.status === 'running' || job.status === 'starting') {
      return res.status(400).json({
        success: false,
        error: 'Não é possível remover um job em execução'
      });
    }
    
    jobStatus.delete(jobId);
    
    res.json({
      success: true,
      message: 'Job removido com sucesso'
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao remover job: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/background/update-status
// Endpoint interno para atualizar status dos jobs (chamado pelo Inngest)
router.post('/update-status', (req, res) => {
  try {
    const { jobId, status, progress, result, error } = req.body;
    
    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'jobId é obrigatório'
      });
    }
    
    const job = jobStatus.get(jobId);
    
    if (!job) {
      console.warn(`⚠️ [Background] Tentativa de atualizar job inexistente: ${jobId}`);
      return res.status(404).json({
        success: false,
        error: 'Job não encontrado'
      });
    }
    
    // Atualizar status
    const updatedJob = {
      ...job,
      status: status || job.status,
      progress: progress !== undefined ? progress : job.progress,
      endTime: status === 'completed' || status === 'failed' ? new Date().toISOString() : job.endTime,
      result: result || job.result,
      error: error || job.error
    };
    
    jobStatus.set(jobId, updatedJob);
    
    console.log(`✅ [Background] Status atualizado: ${jobId} -> ${status} (${progress}%)`);
    
    res.json({
      success: true,
      job: updatedJob
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao atualizar status: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/background/health
// Health check para background jobs
router.get('/health', (req, res) => {
  try {
    const stats = {
      totalJobs: jobStatus.size,
      runningJobs: Array.from(jobStatus.values()).filter(job => job.status === 'running').length,
      completedJobs: Array.from(jobStatus.values()).filter(job => job.status === 'completed').length,
      failedJobs: Array.from(jobStatus.values()).filter(job => job.status === 'failed').length,
      mode: 'native-background-jobs'
    };
    
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      stats
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro no health check: ${error.message}`);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

module.exports = router;
