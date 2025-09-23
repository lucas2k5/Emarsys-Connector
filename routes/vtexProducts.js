const express = require('express');
const router = express.Router();
const vtexProductService = require('../services/vtexProductService');

/**
 * @route GET /api/vtex/products/test
 * @desc Testa conexão com VTEX
 * @access Public
 */
router.get('/test', async (req, res) => {
  try {
    const result = await vtexProductService.testConnectivity();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/vtex/products/test-sftp
 * @desc Testa conectividade SFTP com Emarsys
 * @access Public
 */
router.get('/test-sftp', async (req, res) => {
  try {
    console.log('🔍 Testando conectividade SFTP com Emarsys...');
    const result = await vtexProductService.testSftpConnectivity();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/vtex/products/test-upload-catalog
 * @desc Testa upload de um arquivo pequeno para o diretório catalog
 * @access Public
 */
router.post('/test-upload-catalog', async (req, res) => {
  try {
    console.log('🧪 Testando upload para diretório catalog...');
    
    // Cria um arquivo de teste pequeno
    const fs = require('fs-extra');
    const path = require('path');
    const testContent = 'Test file for SFTP upload to catalog directory\nGenerated at: ' + new Date().toISOString();
    const testFilePath = path.join(process.env.EXPORTS_DIR || 'exports', 'test-catalog-upload.txt');
    
    await fs.ensureDir(path.dirname(testFilePath));
    await fs.writeFile(testFilePath, testContent);
    
    console.log(`📝 Arquivo de teste criado: ${testFilePath}`);
    
    // Tenta fazer upload para o diretório catalog
    const uploadResult = await vtexProductService.uploadToEmarsys(testFilePath, '/catalog/test-catalog-upload.txt');
    
    // Remove o arquivo de teste local
    await fs.remove(testFilePath);
    
    res.json({
      success: true,
      message: 'Teste de upload para diretório catalog concluído',
      uploadResult,
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
 * @route GET /api/vtex/products/test-sftp-catalog
 * @desc Testa conectividade SFTP e lista o diretório catalog
 * @access Public
 */
router.get('/test-sftp-catalog', async (req, res) => {
  try {
    console.log('🔍 Testando conectividade SFTP e listando diretório catalog...');
    
    const result = await vtexProductService.testSftpConnectivity();
    
    res.json({
      success: true,
      message: 'Teste de conectividade SFTP e listagem do diretório catalog concluído',
      result: result,
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
 * @route GET /api/vtex/products/search-test
 * @desc Testa busca de produtos da API da VTEX
 * @access Public
 */
router.get('/search-test', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    console.log(`🔍 Testando busca de produtos (limite: ${limit})...`);
    
    const products = await vtexProductService.getAllProductsFromApi(parseInt(limit));
    
    res.json({
      success: true,
      data: products,
      count: products.length,
      message: `Encontrados ${products.length} produtos na API da VTEX`,
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
 * @route GET /api/vtex/products/test-private-api
 * @desc Testa a API privada da VTEX para buscar productIds
 * @access Public
 */
router.get('/test-private-api', async (req, res) => {
  try {
    console.log('🔍 Testando API privada da VTEX...');
    
    // Acessa o método diretamente se existir, senão cria uma instância temporária
    const productIds = await vtexProductService.getProductIdsFromPrivateApi(5);
    
    res.json({
      success: true,
      data: productIds,
      count: productIds.length,
      message: `Encontrados ${productIds.length} productIds válidos na API privada`,
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
 * @route GET /api/vtex/products/test-private-endpoints
 * @desc Testa diferentes endpoints da API privada da VTEX
 * @access Public
 */
router.get('/test-private-endpoints', async (req, res) => {
  try {
    console.log('🔍 Testando diferentes endpoints da API privada da VTEX...');
    
    const results = await vtexProductService.testPrivateApiEndpoints();
    
    res.json({
      success: true,
      results,
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
 * @route POST /api/vtex/products/update-product-ids
 * @desc Atualiza apenas os productIds da API privada da VTEX
 * @access Public
 */
router.post('/update-product-ids', async (req, res) => {
  try {
    console.log('🔄 Atualizando productIds da API privada da VTEX...');
    
    const productData = await vtexProductService.getProductIdsAndSkusFromPrivateApi();
    
    res.json({
      success: true,
      message: 'ProductIds atualizados com sucesso',
      totalProducts: Object.keys(productData).length,
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
 * @route GET /api/vtex/products/product-ids-info
 * @desc Obtém informações sobre os productIds armazenados
 * @access Public
 */
router.get('/product-ids-info', async (req, res) => {
  try {
    console.log('📋 Obtendo informações dos productIds...');
    
    const productData = await vtexProductService.loadProductIdsFromFile();
    
    if (!productData) {
      return res.status(404).json({
        success: false,
        message: 'Arquivo de productIds não encontrado',
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      metadata: productData.metadata,
      totalProducts: Object.keys(productData.products || {}).length,
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
 * @route GET /api/vtex/products/stats
 * @desc Obtém estatísticas dos produtos
 * @access Public
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await vtexProductService.getStats();
    res.json({
      success: true,
      stats,
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
 * @route GET /api/vtex/products
 * @desc Lista produtos do arquivo local
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const products = await vtexProductService.loadProductsFromFile();
    
    const paginatedProducts = products.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    
    res.json({
      success: true,
      data: paginatedProducts,
      pagination: {
        total: products.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < products.length
      },
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

// NOTE: Dynamic route moved to the end to avoid capturing specific paths like /sync

/**
 * @route POST /api/vtex/products/sync
 * @desc Sincroniza produtos da VTEX em background
 * @access Public
 */
router.post('/sync', async (req, res) => {
  try {
    console.log(`🚀 Iniciando sincronização de produtos em background`);
    
    const { maxProducts = 0, forceRefresh = false, batchSize = 50 } = req.body || {};
    
    // Gerar ID único para o job
    const jobId = `sync-products-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Usar o sistema de background jobs existente
    const backgroundJobsModule = require('./backgroundJobs');
    
    // Simular uma requisição para o endpoint de background
    const mockReq = {
      body: { maxProducts, forceRefresh, batchSize }
    };
    
    const mockRes = {
      json: (data) => {
        // Retornar resposta imediata
        res.json({
          success: true,
          jobId: data.jobId,
          message: 'Sincronização iniciada em background - o processo continuará mesmo se você fechar esta janela',
          checkStatus: `/api/background/status/${data.jobId}`,
          backgroundEndpoint: `/api/background/sync-products`,
          config: { maxProducts, forceRefresh, batchSize },
          instructions: {
            pt: 'Use o endpoint checkStatus para acompanhar o progresso',
            en: 'Use the checkStatus endpoint to track progress'
          },
          timestamp: new Date().toISOString()
        });
      },
      status: (code) => ({
        json: (data) => res.status(code).json(data)
      })
    };
    
    // Executar a lógica de background job diretamente
    const backgroundRouter = require('./backgroundJobs');
    
    // Armazenamento temporário para status dos jobs (copiado do backgroundJobs.js)
    if (!global.jobStatus) {
      global.jobStatus = new Map();
    }
    
    const jobStatus = global.jobStatus;
    
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
        // Atualizar status para running
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'running',
          progress: 5
        });
        
        const result = await vtexProductService.syncProducts({ maxProducts, forceRefresh, batchSize });
        
        // Atualizar status do job
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'completed',
          progress: 100,
          endTime: new Date().toISOString(),
          result
        });
        
        console.log(`✅ [Background] Sincronização ${jobId} concluída com sucesso`);
      } catch (error) {
        console.error(`❌ [Background] Erro no sync de produtos ${jobId}:`, error);
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'failed',
          progress: 0,
          endTime: new Date().toISOString(),
          error: error.message
        });
      }
    });
    
    // Retornar resposta imediata
    res.json({
      success: true,
      jobId,
      message: 'Sincronização iniciada em background - o processo continuará mesmo se você fechar esta janela',
      checkStatus: `/api/background/status/${jobId}`,
      backgroundEndpoint: `/api/background/sync-products`,
      config: { maxProducts, forceRefresh, batchSize },
      instructions: {
        pt: 'Use o endpoint checkStatus para acompanhar o progresso',
        en: 'Use the checkStatus endpoint to track progress'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Erro ao iniciar sincronização em background:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/vtex/products/test-config
 * @desc Testa configuração das variáveis de ambiente (para debug)
 * @access Public
 */
router.get('/test-config', async (req, res) => {
  try {
    console.log('🧪 Testando configuração das variáveis de ambiente...');
    
    const config = {
      VTEX_BASE_URL: process.env.VTEX_BASE_URL || 'undefined',
      VTEX_APP_KEY: process.env.VTEX_APP_KEY ? '***' + process.env.VTEX_APP_KEY.slice(-4) : 'undefined',
      VTEX_APP_TOKEN: process.env.VTEX_APP_TOKEN ? '***' + process.env.VTEX_APP_TOKEN.slice(-4) : 'undefined',
      NODE_ENV: process.env.NODE_ENV || 'undefined'
    };
    
    res.json({
      success: true,
      data: config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro no teste de configuração:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/vtex/products/test-connectivity
 * @desc Testa apenas a conectividade com a VTEX (para debug)
 * @access Public
 */
router.get('/test-connectivity', async (req, res) => {
  try {
    console.log('🧪 Testando conectividade com VTEX...');
    
    const connectivityTest = await vtexProductService.testConnectivity();
    
    res.json({
      success: true,
      data: connectivityTest,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro no teste de conectividade:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/vtex/products/sync
 * @desc Sincroniza produtos da VTEX em background (modo GET, sem body) — útil em ambientes serverless
 * @access Publica
 */
router.get('/sync', async (req, res) => {
  try {
    console.log(`🚀 Iniciando sincronização de produtos em background [GET]`);
    
    const { maxProducts = '0', forceRefresh = 'false', batchSize = '50' } = req.query;
    
    // Gerar ID único para o job
    const jobId = `sync-products-get-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Armazenamento temporário para status dos jobs
    if (!global.jobStatus) {
      global.jobStatus = new Map();
    }
    
    const jobStatus = global.jobStatus;
    
    // Inicializar status do job
    jobStatus.set(jobId, {
      id: jobId,
      type: 'sync-products-get',
      status: 'starting',
      progress: 0,
      startTime: new Date().toISOString(),
      config: { maxProducts: parseInt(maxProducts) || 0, forceRefresh: forceRefresh === 'true', batchSize: parseInt(batchSize) || 50 }
    });
    
    // Executar sincronização diretamente em background
    setImmediate(async () => {
      try {
        // Atualizar status para running
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'running',
          progress: 5
        });
        
        // Adicionar timeout para evitar operações infinitas
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout: Sincronização de produtos excedeu 30 minutos')), 30 * 60 * 1000);
        });
        
        const syncPromise = vtexProductService.syncProducts({ 
          maxProducts: parseInt(maxProducts) || 0, 
          forceRefresh: forceRefresh === 'true', 
          batchSize: parseInt(batchSize) || 50 
        });
        
        const result = await Promise.race([syncPromise, timeoutPromise]);
        
        // Atualizar status do job
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'completed',
          progress: 100,
          endTime: new Date().toISOString(),
          result
        });
        
        console.log(`✅ [Background] Sincronização GET ${jobId} concluída com sucesso`);
      } catch (error) {
        console.error(`❌ [Background] Erro no sync GET de produtos ${jobId}:`, error);
        console.error(`❌ [Background] Stack trace completo:`, error.stack);
        
        jobStatus.set(jobId, {
          ...jobStatus.get(jobId),
          status: 'failed',
          progress: 0,
          endTime: new Date().toISOString(),
          error: error.message,
          stack: error.stack,
          type: error.constructor.name
        });
        
        // Log adicional para debug em produção
        if (process.env.NODE_ENV === 'production') {
          console.error(`❌ [PRODUCTION ERROR] Product sync failed:`, {
            jobId,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
          });
        }
      }
    });
    
    // Retornar resposta imediata
    res.json({
      success: true,
      jobId,
      message: 'Sincronização iniciada em background [GET] - o processo continuará mesmo se você fechar esta janela',
      checkStatus: `/api/background/status/${jobId}`,
      backgroundEndpoint: `/api/background/sync-products`,
      config: { 
        maxProducts: parseInt(maxProducts), 
        forceRefresh: forceRefresh === 'true', 
        batchSize: parseInt(batchSize) 
      },
      instructions: {
        pt: 'Use o endpoint checkStatus para acompanhar o progresso',
        en: 'Use the checkStatus endpoint to track progress'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Erro ao iniciar sincronização GET em background:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/vtex/products/export
 * @desc Exporta CSV Emarsys para uma lista específica de productIds enviada no body
 * @access Public
 * body: { productIds: number[], skipUpload?: boolean }
 */
router.post('/export', async (req, res) => {
  try {
    const { productIds = [], skipUpload = true } = req.body || {};
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ success: false, error: 'productIds vazio ou inválido' });
    }

    // Busca detalhes em paralelo
    const uniqueIds = [...new Set(productIds.map((v) => parseInt(v)).filter(Number.isFinite))];
    const concurrency = Math.min(10, Math.max(2, parseInt(process.env.PRODUCT_FETCH_CONCURRENCY || '8')));

    let idx = 0;
    const results = [];

    const worker = async () => {
      while (true) {
        const cur = idx++;
        if (cur >= uniqueIds.length) break;
        const id = uniqueIds[cur];
        try {
          const details = await vtexProductService.fetchProductDetails(id);
          if (details) results.push(details);
        } catch (e) {
          // ignora
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    if (results.length === 0) {
      return res.status(404).json({ success: false, error: 'Nenhum produto encontrado para os IDs informados' });
    }

    // Gera CSV sem upload por padrão
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `emarsys-products-export-selection-${timestamp}.csv`;
    const csv = await vtexProductService.generateEmarsysProductCsv(results, {}, { filename, skipUpload });

    res.json({ success: true, totalProducts: results.length, csv });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



/**
 * @route POST /api/vtex/products/generate-csv
 * @desc Gera CSV dos produtos existentes no formato Emarsys
 * @access Public
 */
router.post('/generate-csv', async (req, res) => {
  try {
    console.log('📊 Gerando CSV dos produtos existentes no formato Emarsys...');
    
    const products = await vtexProductService.loadProductsFromFile();
    
    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nenhum produto encontrado para gerar CSV',
        timestamp: new Date().toISOString()
      });
    }
    
    const csvResult = await vtexProductService.generateEmarsysProductCsv(products);
    
    res.json({
      success: true,
      message: 'CSV gerado com sucesso no formato Emarsys',
      csv: csvResult,
      format: 'SAP Emarsys Product Import',
      documentation: 'https://help.sap.com/docs/SAP_EMARSYS/5d44574160f44536b0130abf58cb87cc/fdf6fbc574c11014855de082fd7ded5b.html?locale=en-US#loiofdf6fbc574c11014855de082fd7ded5b__basic-field-set',
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
 * @route GET /api/vtex/products/test-sftp
 * @desc Testa a conectividade SFTP com o Emarsys
 * @access Public
 */
router.get('/test-sftp', async (req, res) => {
  try {
    console.log('🧪 Testando conectividade SFTP com Emarsys...');
    
    const result = await vtexProductService.testSftpConnectivity();
    
    res.json({
      success: true,
      message: 'Teste de conectividade SFTP concluído',
      result: result,
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
 * @route POST /api/vtex/products/generate-emarsys-csv
 * @desc Gera CSV específico para importação no Emarsys e faz upload via SFTP
 * @access Public
 */
router.post('/generate-emarsys-csv', async (req, res) => {
  try {
    console.log('📊 Gerando CSV específico para importação no Emarsys...');
    
    const products = await vtexProductService.loadProductsFromFile();
    
    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nenhum produto encontrado para gerar CSV',
        timestamp: new Date().toISOString()
      });
    }
    
    // Filtros opcionais do body da requisição
    const filters = {
      active: req.body.active !== undefined ? req.body.active : undefined,
      category: req.body.category,
      brand: req.body.brand || undefined
    };
    
    console.log('🔍 Filtros aplicados:', filters);
    
    const csvResult = await vtexProductService.generateEmarsysProductCsv(products, filters);
    
    res.json({
      success: true,
      message: 'CSV Emarsys gerado e enviado com sucesso',
      csv: csvResult,
      format: 'SAP Emarsys Product Import',
      filters: Object.keys(filters).filter(key => filters[key] !== undefined).length > 0 ? filters : null,
      sftpUpload: csvResult.sftpUpload,
      documentation: 'https://help.sap.com/docs/SAP_EMARSYS/5d44574160f44536b0130abf58cb87cc/fdf6fbc574c11014855de082fd7ded5b.html?locale=en-US#loiofdf6fbc574c11014855de082fd7ded5b__basic-field-set',
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
 * @route GET /api/vtex/products/test-csv-format
 * @desc Testa o formato CSV com poucos produtos para validação
 * @access Public
 */
router.get('/test-csv-format', async (req, res) => {
  try {
    console.log('🧪 Testando formato CSV com poucos produtos...');
    
    const products = await vtexProductService.loadProductsFromFile();
    
    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nenhum produto encontrado para teste',
        timestamp: new Date().toISOString()
      });
    }
    
    // Pega apenas os primeiros 5 produtos para teste
    const testProducts = products.slice(0, 5);
    
    const csvResult = await vtexProductService.generateEmarsysProductCsv(testProducts);
    
    res.json({
      success: true,
      message: 'CSV de teste gerado com sucesso',
      csv: csvResult,
      testProducts: testProducts.length,
      format: 'SAP Emarsys Product Import - Test',
      notes: 'CSV gerado com poucos produtos para validação de formato',
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
 * @route GET /api/vtex/products/search
 * @desc Busca produtos por termo
 * @access Public
 */
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 50, offset = 0 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Termo de busca é obrigatório',
        timestamp: new Date().toISOString()
      });
    }
    
    const products = await vtexProductService.loadProductsFromFile();
    
    const searchTerm = q.toLowerCase();
    const filteredProducts = products.filter(product => 
      product.name.toLowerCase().includes(searchTerm) ||
      product.description.toLowerCase().includes(searchTerm) ||
      product.brand.toLowerCase().includes(searchTerm) ||
      product.category.toLowerCase().includes(searchTerm) ||
      product.id.toString().includes(searchTerm)
    );
    
    const paginatedProducts = filteredProducts.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    
    res.json({
      success: true,
      data: paginatedProducts,
      pagination: {
        total: filteredProducts.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < filteredProducts.length
      },
      search: {
        term: q,
        results: filteredProducts.length
      },
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
 * @route GET /api/vtex/products/filter
 * @desc Filtra produtos por critérios
 * @access Public
 */
router.get('/filter', async (req, res) => {
  try {
    const { 
      brand, 
      category, 
      department, 
      active, 
      limit = 50, 
      offset = 0 
    } = req.query;
    
    const products = await vtexProductService.loadProductsFromFile();
    
    let filteredProducts = products;
    
    // Aplica filtros
    if (brand) {
      filteredProducts = filteredProducts.filter(p => 
        p.brand && p.brand.toLowerCase().includes(brand.toLowerCase())
      );
    }
    
    if (category) {
      filteredProducts = filteredProducts.filter(p => 
        p.category && p.category.toLowerCase().includes(category.toLowerCase())
      );
    }
    
    if (department) {
      filteredProducts = filteredProducts.filter(p => 
        p.department && p.department.toLowerCase().includes(department.toLowerCase())
      );
    }
    
    if (active !== undefined) {
      const isActive = active === 'true';
      filteredProducts = filteredProducts.filter(p => p.active === isActive);
    }
    
    const paginatedProducts = filteredProducts.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    
    res.json({
      success: true,
      data: paginatedProducts,
      pagination: {
        total: filteredProducts.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < filteredProducts.length
      },
      filters: {
        brand: brand || null,
        category: category || null,
        department: department || null,
        active: active !== undefined ? active === 'true' : null
      },
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
 * @route GET /api/vtex/products/:id
 * @desc Obtém detalhes de um produto específico
 * @access Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const products = await vtexProductService.loadProductsFromFile();
    
    const product = products.find(p => p.id.toString() === id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produto não encontrado',
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      data: product,
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