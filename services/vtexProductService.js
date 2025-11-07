const axios = require('axios');
const rateLimit = require('axios-rate-limit');
const MemoryOptimizer = require('../utils/memoryOptimizer');
const fs = require('fs-extra');
const path = require('path');
const { getBrazilianTimestamp, getBrazilianTimestampForFilename } = require('../utils/dateUtils');
const { Client } = require('ssh2');
require('dotenv').config();

class VtexProductService {
  constructor() {
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
      'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
    };
    
    const baseURL = process.env.VTEX_BASE_URL;
    this.client = rateLimit(axios.create({
      baseURL: baseURL,
      headers
    }), { maxRequests: 3900, perMilliseconds: 1000 });
    
    // Initialize axios-retry asynchronously
    this._initializeAxiosRetry();
    
    // Configurações de diretórios
    const defaultDataDir =  path.join(__dirname, '..', 'data');
    const defaultExports =  path.join(__dirname, '..', 'exports');
    this.dataDir = process.env.DATA_DIR || defaultDataDir;
    this.exportsDir = process.env.EXPORTS_DIR || defaultExports;
    
    // Arquivos de dados
    this.productsFile = path.join(this.dataDir, 'products.json');
    this.lastProductSyncFile = path.join(this.dataDir, 'last-product-sync.json');
    
    // Controle de sincronização
    this._isSyncRunning = false;
    
    // Otimizador de memória
    this.memoryOptimizer = new MemoryOptimizer();
    
    // Configurações SFTP para Emarsys
    this.sftpConfig = {
      host: process.env.SFTP_HOST,
      port: parseInt(process.env.SFTP_PORT),
      username: process.env.SFTP_USERNAME,
      password: process.env.SFTP_PASSWORD,
      readyTimeout: parseInt(process.env.SFTP_READY_TIMEOUT) || 60000, // Aumentado para 60 segundos
      keepaliveInterval: parseInt(process.env.SFTP_KEEPALIVE_INTERVAL) || 15000,
      keepaliveCountMax: parseInt(process.env.SFTP_KEEPALIVE_COUNT_MAX) || 5,
      // Configurações para compatibilidade com servidores FTP/SFTP
      algorithms: {
        kex: [
          'diffie-hellman-group1-sha1',
          'diffie-hellman-group14-sha1',
          'diffie-hellman-group-exchange-sha1',
          'diffie-hellman-group-exchange-sha256'
        ],
        cipher: [
          'aes128-ctr',
          'aes192-ctr',
          'aes256-ctr',
          'aes128-gcm',
          'aes256-gcm',
          'aes128-cbc',
          'aes192-cbc',
          'aes256-cbc',
          '3des-cbc'
        ],
        serverHostKey: [
          'ssh-rsa',
          'ssh-dss',
          'ecdsa-sha2-nistp256',
          'ecdsa-sha2-nistp384',
          'ecdsa-sha2-nistp521'
        ],
        hmac: [
          'hmac-sha2-256',
          'hmac-sha2-512',
          'hmac-sha1'
        ]
      }
    };
    this.sftpRemotePath = process.env.SFTP_REMOTE_PATH;
    
    // Validação das configurações SFTP
    this._validateSftpConfig();
  }

  // Aguarda até que um arquivo exista e tenha tamanho mínimo
  async _waitUntilFileReady(filePath, { timeoutMs = 60000, intervalMs = 200, minSize = 1 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const stats = await fs.stat(filePath);
        if (stats.size >= minSize) return true;
      } catch (_) { /* arquivo ainda não existe */ }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`Arquivo não ficou pronto a tempo: ${filePath}`);
  }

  /**
   * Busca todos os produtos da API da VTEX - STEP1
   * @param {number} limit - Limite de produtos
   * @returns {Promise<Array>} Array de produtos
   */
  async getAllProductsFromApi(limit = null) {
    console.log('🔍 Buscando produtos da API da VTEX...');
    
    const productData = await this.getProductIdsAndSkusFromPrivateApi();
    
    if (!productData || Object.keys(productData).length === 0) {
      console.log('⚠️ Nenhum produto encontrado na API');
      return [];
    }
    
    // Filtrar produtos que têm SKUs válidos (ignorar produtos com array vazio)
    const allProductIds = Object.keys(productData);
    let productsWithSkus = 0;
    let productsWithoutSkus = 0;
    
    const productIds = allProductIds
      .map(id => parseInt(id))
      .filter(id => {
        const skus = productData[id]?.skus || [];
        if (skus.length === 0) {
          productsWithoutSkus++;
          console.log(`⏭️ Ignorando produto ${id}: sem SKUs na API privada`);
          return false;
        }
        productsWithSkus++;
        return true;
      });
    
    console.log(`📊 Estatísticas da API privada:`);
    console.log(`   ✅ Produtos com SKUs: ${productsWithSkus}`);
    console.log(`   ⏭️ Produtos ignorados (sem SKUs): ${productsWithoutSkus}`);
    console.log(`   📋 Total a processar: ${productIds.length}`);
    
    if (limit) {
      productIds.splice(limit);
      console.log(`📋 Aplicando limite: ${limit} produtos`);
    }
    
    const products = [];
    const batchSize = 10; // Reduzido para melhor controle
    let processedCount = 0;
    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);
      console.log(`\n🔄 Processando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(productIds.length/batchSize)}: produtos ${i+1} a ${Math.min(i+batchSize, productIds.length)}`);
      
      const batchPromises = batch.map(async (productId) => {
        try {
          const skuIds = productData[productId]?.skus || [];
          const productDetails = await this.fetchProductDetails(productId, skuIds);
          
          if (productDetails) {
            successCount++;
            console.log(`   ✅ Produto ${productId}: processado com sucesso`);
            return productDetails;
          } else {
            failureCount++;
            console.log(`   ⚠️ Produto ${productId}: não foi possível obter detalhes`);
            return null;
          }
        } catch (error) {
          failureCount++;
          console.error(`   ❌ Produto ${productId}: erro - ${error.message}`);
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      products.push(...batchResults.filter(p => p !== null));
      processedCount += batch.length;
      
      console.log(`   📊 Progresso: ${processedCount}/${productIds.length} (Sucesso: ${successCount}, Falha: ${failureCount})`);
      
      // Aguarda entre lotes
      if (i + batchSize < productIds.length) {
        console.log(`   ⏳ Aguardando 500ms antes do próximo lote...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`\n✅ Processamento concluído!`);
    console.log(`   📦 Produtos válidos: ${products.length}`);
    console.log(`   ✅ Sucesso: ${successCount}`);
    console.log(`   ❌ Falha: ${failureCount}`);
    
    return products;
  }

  /**
   * Valida as configurações SFTP
   */
  _validateSftpConfig() {
    const requiredVars = ['SFTP_HOST', 'SFTP_PORT', 'SFTP_USERNAME', 'SFTP_PASSWORD'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.warn(`⚠️ Variáveis de ambiente SFTP ausentes: ${missingVars.join(', ')}`);
      console.warn('📤 Upload SFTP será desabilitado até que as variáveis sejam configuradas');
    } else {
      console.log('✅ Configurações SFTP validadas');
      console.log(`   🌐 Host: ${this.sftpConfig.host}`);
      console.log(`   🔌 Porta: ${this.sftpConfig.port}`);
      console.log(`   👤 Usuário: ${this.sftpConfig.username}`);
      console.log(`   📂 Caminho remoto: ${this.sftpRemotePath}`);
    }
  }

  _initializeAxiosRetry() {
    try {
      // Configurar retry automático simples
      this.client.interceptors.response.use(
        response => response,
        async error => {
          const config = error.config;
          config.retryCount = config.retryCount || 0;
          
          if (config.retryCount < 3 && (
            !error.response || 
            error.response.status >= 500 || 
            error.code === 'ECONNRESET' ||
            error.code === 'ETIMEDOUT'
          )) {
            config.retryCount++;
            console.log(`🔄 Tentativa ${config.retryCount}/3 para ${config.url}`);
            
            // Aguarda antes de tentar novamente (backoff exponencial)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, config.retryCount) * 1000));
            
            return this.client.request(config);
          }
          
          return Promise.reject(error);
        }
      );
      console.log('✅ Retry nativo configurado com sucesso');
    } catch (error) {
      console.error('Failed to initialize retry nativo:', error);
    }
  }

  /**
   * Garante que o diretório de dados existe
   */
  async ensureDataDirectory() {
    try {
      await fs.ensureDir(this.dataDir);
      await fs.ensureDir(this.exportsDir);
    } catch (error) {
      console.error('Erro ao criar diretório de dados:', error);
      throw error;
    }
  }

  /**
   * Testa a conectividade com a API da VTEX
   * @returns {Promise<Object>} Resultado do teste de conectividade
   */
  async testConnectivity() {
    console.log('🌐 Testando conectividade com a API da VTEX...');
    
    try {
      const response = await this.client.get('/api/catalog_system/pvt/products/GetProductAndSkuIds?_from=0&_to=9');
      
      console.log(`✅ Conectividade OK - Status: ${response.status}`);
      
      return {
        success: true,
        status: response.status,
        message: 'Conectividade com a API da VTEX está funcionando'
      };
      
    } catch (error) {
      console.error('❌ Erro de conectividade com a API da VTEX:', error.message);
      
      let errorType = 'Desconhecido';
      if (error.code === 'ECONNABORTED') {
        errorType = 'Timeout';
      } else if (error.code === 'ENOTFOUND') {
        errorType = 'DNS não encontrado';
      } else if (error.code === 'ECONNREFUSED') {
        errorType = 'Conexão recusada';
      } else if (error.response) {
        errorType = `HTTP ${error.response.status}`;
      }
      
      return {
        success: false,
        error: error.message,
        errorType,
        message: `Falha na conectividade: ${errorType}`
      };
    }
  }

  /**
   * Busca todos os produtos
   * @returns {Promise<Object>} Lista de produtos
   */
  async getAllProducts() {
    try {
      const response = await this.client.get('/api/catalog_system/pvt/products/GetProductAndSkuIds');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca e armazena todos os productIds e SKUs da API privada da VTEX
   * @returns {Promise<Object>} Objeto com productIds e SKUs
   */
  async getProductIdsAndSkusFromPrivateApi() {
    console.log('🔍 Buscando productIds na API privada da VTEX...');
    
    try {
      const allProductData = {};
      let currentPage = 0;
      const pageSize = 250;
      let hasMore = true;
      let totalProducts = 0;
      
      console.log(`🔄 Iniciando paginação com ${pageSize} produtos por página...`);
      
      while (hasMore) {
        const from = currentPage * pageSize;
        const to = from + pageSize - 1;
        const url = `/api/catalog_system/pvt/products/GetProductAndSkuIds?_from=${from}&_to=${to}`;
        
        console.log(`📄 Página ${currentPage + 1}: buscando produtos ${from} a ${to}...`);
        
        const response = await this.client.get(url);
        
        if (!response.data) {
          console.log(`⚠️ Página ${currentPage + 1}: Resposta vazia`);
          break;
        }
        
        // Processar resposta baseado na estrutura
        if (typeof response.data === 'object') {
          // Verificar se há range info para paginação
          if (response.data.range) {
            totalProducts = response.data.range.total || 0;
            hasMore = response.data.range.to < totalProducts - 1;
            console.log(`📊 Total de produtos: ${totalProducts}, Tem mais páginas: ${hasMore}`);
          }
          
          // Processar os dados dos produtos
          if (response.data.data && typeof response.data.data === 'object') {
            const productKeys = Object.keys(response.data.data);
            
            // Se for um objeto com productIds como chaves
            if (productKeys.length > 0 && !isNaN(parseInt(productKeys[0]))) {
              productKeys.forEach(key => {
                const productId = parseInt(key);
                const skuData = response.data.data[key];
                
                if (Array.isArray(skuData) && skuData.length > 0) {
                  const validSkus = skuData.filter(sku => typeof sku === 'number' && sku > 0);
                  allProductData[productId] = {
                    productId: productId,
                    skus: validSkus,
                    lastUpdated: new Date().toISOString()
                  };
                }
              });
            }
          }
          // Fallback: se não tem .data, tenta processar response.data diretamente
          else {
            const keys = Object.keys(response.data);
            
            // Se for um objeto com productIds como chaves
            if (keys.length > 0 && !isNaN(parseInt(keys[0]))) {
              keys.forEach(key => {
                const productId = parseInt(key);
                const skuData = response.data[key];
                
                if (Array.isArray(skuData) && skuData.length > 0) {
                  const validSkus = skuData.filter(sku => typeof sku === 'number' && sku > 0);
                  allProductData[productId] = {
                    productId: productId,
                    skus: validSkus,
                    lastUpdated: new Date().toISOString()
                  };
                }
              });
            }
          }
        }
        
        // Se não encontrou produtos nesta página, para a paginação
        const foundProductsInPage = response.data.data ? Object.keys(response.data.data).length : 0;
        if (foundProductsInPage === 0) {
          console.log(`⚠️ Página ${currentPage + 1}: Nenhum produto encontrado, parando paginação`);
          break;
        }
        
        currentPage++;
        
        // Pausa mínima entre páginas
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      }
      
      const foundProducts = Object.keys(allProductData).length;
      console.log(`✅ Paginação concluída! Total de produtos encontrados: ${foundProducts}`);
      
      return allProductData;
      
    } catch (error) {
      console.error('❌ Erro na API privada:', error.message);
      throw error;
    }
  }

  /**
   * Testa diferentes endpoints da API privada da VTEX
   * @returns {Promise<Object>} Resultados dos testes
   */
  async testPrivateApiEndpoints() {
    console.log('🔍 Testando diferentes endpoints da API privada da VTEX...');
    
    const endpoints = [
      {
        name: 'GetProductAndSkuIds',
        url: `/api/catalog_system/pvt/products/GetProductAndSkuIds?_from=0&_to=9`,
        description: 'Lista produtos com paginação'
      },
      {
        name: 'GetProductAndSkuIds (sem paginação)',
        url: `/api/catalog_system/pvt/products/GetProductAndSkuIds`,
        description: 'Lista produtos sem paginação'
      }
    ];
    
    const results = {};
    
    for (const endpoint of endpoints) {
      try {
        console.log(`🔍 Testando endpoint: ${endpoint.name}`);
        
        const response = await this.client.get(endpoint.url);
        
        results[endpoint.name] = {
          success: true,
          status: response.status,
          dataType: typeof response.data,
          isArray: Array.isArray(response.data),
          length: Array.isArray(response.data) ? response.data.length : 'N/A',
          sample: Array.isArray(response.data) && response.data.length > 0 ? response.data[0] : null,
          description: endpoint.description
        };
        
        console.log(`✅ ${endpoint.name}: ${response.status} - ${Array.isArray(response.data) ? response.data.length : 'N/A'} items`);
        
      } catch (error) {
        results[endpoint.name] = {
          success: false,
          error: error.message,
          status: error.response?.status,
          description: endpoint.description
        };
        
        console.log(`❌ ${endpoint.name}: ${error.response?.status || 'No response'} - ${error.message}`);
      }
      
      // Pausa entre testes
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return results;
  }

  /**
   * Carrega os productIds e SKUs do arquivo JSON
   * @returns {Promise<Object>} Dados dos produtos
   */
  async loadProductIdsFromFile() {
    try {
      const filePath = path.join(this.dataDir, 'vtex-product-ids.json');
      
      if (!await fs.pathExists(filePath)) {
        console.log('📋 Arquivo de productIds não encontrado');
        return null;
      }
      
      const data = await fs.readJson(filePath);
      console.log(`📋 ProductIds carregados: ${Object.keys(data.products || {}).length} produtos`);
      return data;
    } catch (error) {
      console.error('❌ Erro ao carregar productIds:', error.message);
      return null;
    }
  }

  /**
   * Carrega produtos do arquivo JSON
   * @returns {Promise<Array>} Array de produtos
   */
  async loadProductsFromFile() {
    try {
      if (await fs.pathExists(this.productsFile)) {
        const products = await fs.readJson(this.productsFile);
        console.log(`📖 ${products.length} produtos carregados de ${this.productsFile}`);
        return products;
      } else {
        console.log('📖 Arquivo de produtos não encontrado, retornando array vazio');
        return [];
      }
    } catch (error) {
      console.error('❌ Erro ao carregar produtos:', error.message);
      return [];
    }
  }

  /**
   * Salva produtos no arquivo JSON
   * @param {Array} products - Array de produtos
   */
  async saveProductsToFile(products) {
    try {
      console.log(`💾 Salvando ${products.length} produtos...`);
      await this.ensureDataDirectory();
      await fs.writeJson(this.productsFile, products, { spaces: 0 });
      console.log(`✅ ${products.length} produtos salvos em ${this.productsFile}`);
    } catch (error) {
      console.error('❌ Erro ao salvar produtos:', error.message);
      throw error;
    }
  }

  /**
   * Salva produtos no arquivo JSON de forma otimizada (sem formatação)
   * @param {Array} products - Array de produtos
   */
  async saveProductsToFileOptimized(products) {
    try {
      console.log(`💾 Salvando ${products.length} produtos (otimizado)...`);
      await this.ensureDataDirectory();
      
      // Usa JSON.stringify diretamente para economizar memória
      const jsonString = JSON.stringify(products);
      const fsPromises = require('fs').promises;
      await fsPromises.writeFile(this.productsFile, jsonString, 'utf8');
      
      // Força garbage collection após salvar
      if (global.gc) {
        console.log('🧹 Executando garbage collection após salvar produtos...');
        global.gc();
      }
      
      console.log(`✅ ${products.length} produtos salvos em ${this.productsFile} (otimizado)`);
    } catch (error) {
      console.error('❌ Erro ao salvar produtos (otimizado):', error.message);
      throw error;
    }
  }

  /**
   * Salva informações da última sincronização
   * @param {Object} syncInfo - Informações da sincronização
   */
  async saveLastSyncInfo(syncInfo) {
    try {
      await this.ensureDataDirectory();
      await fs.writeJson(this.lastProductSyncFile, syncInfo, { spaces: 2 });
      console.log(`💾 Informações de sincronização salvas`);
    } catch (error) {
      console.error('❌ Erro ao salvar informações de sincronização:', error.message);
    }
  }

  /**
   * Obtém informações da última sincronização
   * @returns {Promise<Object>} Informações da última sincronização
   */
  async getLastSyncInfo() {
    try {
      if (await fs.pathExists(this.lastProductSyncFile)) {
        return await fs.readJson(this.lastProductSyncFile);
      } else {
        return null;
      }
    } catch (error) {
      console.error('❌ Erro ao carregar informações de sincronização:', error.message);
      return null;
    }
  }

  /**
   * Obtém estatísticas dos produtos
   * @returns {Promise<Object>} Estatísticas
   */
  async getStats() {
    try {
      const products = await this.loadProductsFromFile();
      const lastSync = await this.getLastSyncInfo();
      
      return {
        totalProducts: products.length,
        lastSync: lastSync?.timestamp || 'Nunca',
        lastSyncSuccess: lastSync?.success || false,
        fileSize: await fs.pathExists(this.productsFile) ? (await fs.stat(this.productsFile)).size : 0
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error.message);
      return {
        totalProducts: 0,
        lastSync: 'Erro',
        lastSyncSuccess: false,
        fileSize: 0
      };
    }
  }

  /**
   * Busca SKUs de um produto via API privada (para produtos inativos)
   * @param {number} productId - ID do produto
   * @param {number} retryCount - Contador de tentativas
   * @returns {Promise<Array>} Array de SKUs
   */
  async fetchSkusByProductId(productId, retryCount = 0) {
    const maxRetries = 3;
    const baseDelay = 2000; // 2 segundos base
    
    try {
      const response = await this.client.get(`/api/catalog_system/pvt/sku/stockkeepingunitByProductId/${productId}`);
      const skus = response.data || [];
      
      // Valida se os SKUs têm RefId válido
      const validSkus = skus.filter(sku => sku && sku.RefId && sku.RefId.trim() !== '');
      
      if (validSkus.length === 0 && skus.length > 0 && retryCount < maxRetries) {
        // Se não há SKUs válidos mas existem SKUs, tenta novamente com delay maior
        const delay = baseDelay * Math.pow(2, retryCount); // Backoff exponencial
        console.log(`⚠️ Produto ${productId}: SKUs sem RefId válido, tentativa ${retryCount + 1}/${maxRetries} em ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return await this.fetchSkusByProductId(productId, retryCount + 1);
      }
      
      if (validSkus.length === 0 && skus.length > 0) {
        console.warn(`⚠️ Produto ${productId}: Todos os SKUs sem RefId válido após ${maxRetries} tentativas`);
        // Retorna os SKUs mesmo sem RefId válido, mas com fallback
        return skus.map(sku => ({
          ...sku,
          RefId: sku.RefId || `SKU-${sku.Id || 'UNKNOWN'}` // Fallback para ID do SKU
        }));
      }
      
      return validSkus;
    } catch (error) {
      console.error(`❌ Erro ao buscar SKUs do produto ${productId}:`, error.message);
      
      // Retry em caso de erro de rede/timeout
      if (retryCount < maxRetries && (
        error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' || 
        error.response?.status >= 500
      )) {
        const delay = baseDelay * Math.pow(2, retryCount);
        console.log(`🔄 Produto ${productId}: Erro de rede, tentativa ${retryCount + 1}/${maxRetries} em ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return await this.fetchSkusByProductId(productId, retryCount + 1);
      }
      
      return [];
    }
  }

  /**
   * Busca detalhes de um SKU específico via API privada
   * @param {number} skuId - ID do SKU
   * @returns {Promise<Object>} Detalhes do SKU
   */
  async fetchSkuDetailsFromPrivateApi(skuId) {
    try {
      const url = `/api/catalog/pvt/stockkeepingunit/${skuId}`;
      const response = await this.client.get(url);
      
      if (response.data && response.data.Id) {
        return response.data;
      }
      
      return null;
    } catch (error) {
      if (error.response?.status === 404) {
        // SKU não existe
        return null;
      }
      throw error;
    }
  }

  /**
   * Busca dados completos do produto na API privada da VTEX
   * @param {number} productId - ID do produto
   * @returns {Promise<Object>} Dados completos do produto
   */
  async fetchProductDetailsFromPrivateApi(productId) {
    try {
      const url = `https://piccadilly.vtexcommercestable.com.br/api/catalog/pvt/product/${productId}`;
      const response = await this.client.get(url);
      
      if (response.data) {
        return response.data;
      }
      
      return null;
    } catch (error) {
      console.warn(`⚠️ Erro ao buscar detalhes do produto ${productId} na API privada:`, error.message);
      return null;
    }
  }

  /**
   * Constrói um objeto produto a partir de SKUs da API privada
   * @param {number} productId - ID do produto
   * @param {Array} skus - Array de SKUs com detalhes
   * @param {Object} productDetails - Dados do produto da API privada (opcional)
   * @returns {Promise<Object>} Objeto produto estruturado
   */
  async buildProductFromSkus(productId, skus, productDetails = null) {
    if (!skus || skus.length === 0) {
      return null;
    }

    // Se não recebeu productDetails, busca agora
    if (!productDetails) {
      productDetails = await this.fetchProductDetailsFromPrivateApi(productId);
    }
    
    // Extrai dados do produto
    let productName = '';
    let productDescription = '';
    let productCategory = '';
    let productIsActive = false;
    let productLinkId = '';
    let extractedCategory = 'inativo'; // Padrão: inativo
    
    if (productDetails) {
      productName = productDetails.Name || productDetails.name || '';
      productDescription = productDetails.Description || '';
      productCategory = productDetails.CategoryName || '';
      productIsActive = productDetails.IsActive === true || productDetails.isActive === true;
      productLinkId = productDetails.LinkId || productId.toString();
      
      // Validação de categoria conforme overview.md
      // Se não tem CategoryName ou é vazio, usar "inativo"
      if (productCategory && productCategory.trim() !== '') {
        extractedCategory = productCategory.trim();
      } else {
        // Sem categoria = inativo
        extractedCategory = 'inativo';
      }
      
      console.log(`         ✓ Nome: "${productName}"`);
      console.log(`         ✓ Categoria: "${extractedCategory}"`);
      console.log(`         ✓ Ativo: ${productIsActive}`);
    } else {
      console.log(`         ⚠️ Sem dados do produto na API privada`);
      productLinkId = productId.toString();
    }
    
    // Verifica se a categoria indica produto inativo
    const isCategoryInactive = extractedCategory.toLowerCase().includes('inativo');
    
    // Pega o primeiro SKU como base para alguns campos
    const firstSku = skus[0];
    
    // Constrói o objeto produto no formato esperado pela planilha
    const product = {
      productId: productId,
      productName: productName,
      description: productDescription,
      link: `https://www.piccadilly.com.br/${productLinkId}/p`,
      category: extractedCategory,
      categories: [extractedCategory],
      releaseDate: firstSku.DateUpdated || firstSku.CreationDate || '',
      price: 0, // API privada não retorna preço
      listPrice: 0,
      images: [],
      // Constrói os items (SKUs) no formato esperado
      items: skus.map(sku => {
        // Validação robusta do RefId
        let refId = '';
        
        if (sku.RefId && typeof sku.RefId === 'string' && sku.RefId.trim() !== '') {
          refId = sku.RefId.trim();
        } else if (sku.Id) {
          refId = `SKU-${sku.Id}`;
          console.warn(`         ⚠️ SKU ${sku.Id}: usando ID como RefId fallback`);
        } else {
          refId = `PROD-${productId}-UNKNOWN`;
          console.warn(`         ⚠️ SKU sem ID: RefId gerado automaticamente`);
        }
        
        // Determina disponibilidade
        // Produto deve estar ativo E SKU deve estar ativo E categoria não pode ser "inativo"
        const skuIsActive = sku.IsActive === true || sku.ActivateIfPossible === true;
        const isAvailable = productIsActive && skuIsActive && !isCategoryInactive;
        
        return {
          referenceId: [{ Value: refId }],
          ean: sku.EAN || '',
          images: [],
          sellers: [{
            commertialOffer: {
              Price: 0,
              ListPrice: 0,
              IsAvailable: isAvailable,
              AvailableQuantity: isAvailable ? 0 : 0 // API privada não retorna estoque
            }
          }],
          Tamanho: sku.Name || '',
          releaseDate: sku.DateUpdated || sku.CreationDate || ''
        };
      })
    };

    return product;
  }

  /**
   * Busca detalhes de um produto específico
   * @param {number} productId - ID do produto
   * @param {Array} skuIds - Array de IDs dos SKUs do produto (da API privada)
   * @param {number} retryCount - Contador de tentativas
   * @returns {Promise<Object>} Detalhes do produto
   */
  async fetchProductDetails(productId, skuIds = [], retryCount = 0) {
    const maxRetries = 2;
    const baseDelay = 1000; // 1 segundo base
    
    try {
      // PASSO 1: Tentar API pública primeiro (produtos ativos com dados completos)
      const url = `https://www.piccadilly.com.br/api/catalog_system/pub/products/search?fq=productId%3A${productId}`;
      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 8000,
        validateStatus: function (status) {
          return status < 500;
        }
      });

      // Se encontrou na API pública, retorna (produto ativo)
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const product = response.data[0];
        console.log(`      ✓ API pública: produto ativo encontrado`);
        return product;
      }

      // PASSO 2: API pública não retornou dados, tentar API privada (produtos inativos)
      console.log(`      ℹ️ API pública: sem dados, buscando na API privada...`);
      
      // Busca detalhes do produto pela API privada
      const productDetails = await this.fetchProductDetailsFromPrivateApi(productId);
      
      if (!productDetails) {
        console.log(`      ❌ API privada: produto não encontrado`);
        return null;
      }
      
      console.log(`      ✓ API privada: dados do produto encontrados`);
      
      // Busca SKUs individuais para obter detalhes completos
      const skusDetails = [];
      
      if (skuIds && skuIds.length > 0) {
        console.log(`      🔍 Buscando detalhes de ${skuIds.length} SKUs...`);
        
        // Busca detalhes de cada SKU
        for (const skuId of skuIds) {
          try {
            const skuDetail = await this.fetchSkuDetailsFromPrivateApi(skuId);
            if (skuDetail && skuDetail.RefId) {
              skusDetails.push(skuDetail);
            } else {
              console.log(`         ⚠️ SKU ${skuId}: sem RefId válido`);
            }
          } catch (skuError) {
            console.log(`         ⚠️ SKU ${skuId}: erro ao buscar detalhes`);
          }
        }
      }
      
      if (skusDetails.length === 0) {
        console.log(`      ❌ Nenhum SKU com dados válidos encontrado`);
        return null;
      }
      
      console.log(`      ✓ ${skusDetails.length} SKUs válidos encontrados`);
      
      // Constrói objeto produto a partir dos dados da API privada
      return await this.buildProductFromSkus(productId, skusDetails, productDetails);

    } catch (error) {
      console.error(`      ❌ Erro ao buscar produto ${productId}:`, error.message);
      
      // Retry em caso de erro de rede/timeout
      if (retryCount < maxRetries && (
        error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ECONNABORTED' ||
        error.response?.status >= 500
      )) {
        const delay = baseDelay * Math.pow(2, retryCount);
        console.log(`      🔄 Retry ${retryCount + 1}/${maxRetries} em ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return await this.fetchProductDetails(productId, skuIds, retryCount + 1);
      }
      
      return null;
    }
  }

  /**
   * Gera CSV específico para importação de produtos no Emarsys
   * @param {Array} products - Array de produtos
   * @param {Object} filters - Filtros opcionais
   * @param {Object} options - Opções
   * @returns {Promise<Object>} Dados do CSV
   */
  async generateEmarsysProductCsv(products, filters = {}, options = {}) {
    try {
      if (!products || products.length === 0) {
        throw new Error('Nenhum produto fornecido para gerar CSV');
      }
      
      console.log(`📊 Iniciando geração de CSV com ${products.length} produtos...`);
      
      const timestamp = getBrazilianTimestampForFilename();
      const filename = options.filename || `emarsys-products-import-${timestamp}.csv`;
      
      // Usa a nova função otimizada do emarsysCsvService
      const emarsysCsvService = require('./emarsysCsvService');
      const result = await emarsysCsvService.generateCatalogCsv(products, filename, {
        ...options,
        generateGz: true // Sempre gera o arquivo .gz para produtos
      });
      
      return {
        ...result,
        format: 'SAP Emarsys Product Import'
      };
      
    } catch (error) {
      console.error('❌ Erro ao gerar CSV Emarsys:', error.message);
      throw error;
    }
  }

  /**
   * Testa a conectividade SFTP com o Emarsys
   * @returns {Promise<Object>} Resultado do teste
   */
  async testSftpConnectivity() {
    return new Promise((resolve, reject) => {
      console.log('🌐 Testando conectividade SFTP com Emarsys...');

      const conn = new Client();

      conn.on('ready', () => {
        console.log('✅ Conexão SFTP estabelecida com sucesso');
        
        // Lista o diretório raiz para verificar permissões
        conn.sftp((err, sftp) => {
          if (err) {
            console.error('❌ Erro ao criar sessão SFTP:', err.message);
            conn.end();
            reject({
              success: false,
              error: err.message,
              message: 'Falha na conectividade SFTP com Emarsys'
            });
            return;
          }

          // Primeiro lista o diretório raiz
          sftp.readdir('/', (rootErr, rootList) => {
            if (rootErr) {
              console.warn('⚠️ Não foi possível listar diretório raiz:', rootErr.message);
            } else {
              console.log('📂 Conteúdo do diretório raiz:');
              rootList.forEach(item => {
                console.log(`   - ${item.filename} (${item.attrs.size} bytes)`);
              });
            }
            
            // Depois tenta listar o diretório catalog
            sftp.readdir('/catalog', (catalogErr, catalogList) => {
              if (catalogErr) {
                console.warn('⚠️ Não foi possível listar diretório catalog:', catalogErr.message);
                console.log('📂 Tentando upload para catalog mesmo assim...');
              } else {
                console.log('📂 Conteúdo do diretório catalog:');
                catalogList.forEach(item => {
                  console.log(`   - ${item.filename} (${item.attrs.size} bytes)`);
                });
              }
              
              conn.end();
              resolve({
                success: true,
                message: 'Conectividade SFTP com Emarsys está funcionando',
                host: this.sftpConfig.host,
                port: this.sftpConfig.port,
                username: this.sftpConfig.username,
                canListRoot: !rootErr,
                canListCatalog: !catalogErr,
                rootItems: rootList?.length || 0,
                catalogItems: catalogList?.length || 0
              });
            });
          });
        });
      });

      conn.on('error', (err) => {
        console.error('❌ Erro de conexão SFTP:', err.message);
        reject({
          success: false,
          error: err.message,
          message: 'Falha na conectividade SFTP com Emarsys'
        });
      });

      conn.connect(this.sftpConfig);
    });
  }


  /**
   * Upload do arquivo para Emarsys via SFTP
   * @param {string} localFilePath - Caminho do arquivo local
   * @returns {Promise<Object>} Resultado do upload
   */
  async uploadToEmarsys(localFilePath) {
    console.log('📤 Iniciando upload para Emarsys via SFTP...');
    const maxRetries = 3;
    const baseDelayMs = 2000;
    let attempt = 0;

    const tryOnce = () => new Promise((resolve, reject) => {
      const conn = new Client();
      let timedOut = false;
      const overallTimeout = setTimeout(() => {
        timedOut = true;
        console.error('❌ Timeout geral do upload atingido');
        try { conn.end(); } catch (_) {}
        reject(new Error('SFTP upload timeout'));
      }, 120000); // 2 minutos por tentativa

      const cleanup = () => clearTimeout(overallTimeout);

      conn.on('ready', () => {
        console.log('✅ Conexão SFTP estabelecida');
        conn.sftp((err, sftp) => {
          if (err) {
            cleanup();
            console.error('❌ Erro ao criar sessão SFTP:', err.message);
            conn.end();
            reject(err);
            return;
          }

          console.log('📤 Fazendo upload do arquivo...');
          const readStream = fs.createReadStream(localFilePath);
          const writeStream = sftp.createWriteStream(this.sftpRemotePath, { autoClose: true });

          let bytesSent = 0;
          readStream.on('data', chunk => { bytesSent += chunk.length; });

          writeStream.on('close', () => {
            if (!timedOut) {
              cleanup();
              console.log(`✅ Upload concluído com sucesso (${bytesSent} bytes)`);
              conn.end();
              resolve({ success: true, remotePath: this.sftpRemotePath, localPath: localFilePath, bytesSent });
            }
          });

          writeStream.on('error', (err) => {
            cleanup();
            console.error('❌ Erro durante upload:', err.message);
            conn.end();
            reject(err);
          });

          readStream.on('error', (err) => {
            cleanup();
            console.error('❌ Erro no readStream:', err.message);
            conn.end();
            reject(err);
          });

          readStream.pipe(writeStream);
        });
      });

      conn.on('error', (err) => {
        cleanup();
        console.error('❌ Erro de conexão SFTP:', err.message);
        reject(err);
      });

      conn.connect(this.sftpConfig);
    });

    while (attempt < maxRetries) {
      try {
        return await tryOnce();
      } catch (err) {
        attempt += 1;
        const isLast = attempt >= maxRetries;
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.error(`⚠️ Upload failed (attempt ${attempt}/${maxRetries}): ${err.message}${isLast ? '' : ` - retrying in ${delay}ms`}`);
        if (isLast) {
          return { success: false, error: err.message };
        }
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  

  /**
   * Sincroniza produtos da VTEX
   * @returns {Promise<Object>} Resultado da sincronização
   */
  async syncProducts() {
    try {
      if (this._isSyncRunning) {
        console.warn('⚠️ Uma sincronização já está em execução. Ignorando nova chamada.');
        return { success: false, error: 'Sync already running' };
      }
      this._isSyncRunning = true;
      console.log(`🔄 Iniciando sincronização de produtos`);

      // Testa conectividade antes de iniciar
      const connectivityTest = await this.testConnectivity();
      if (!connectivityTest.success) {
        console.error('❌ Falha no teste de conectividade. Abortando sincronização.');
        return {
          success: false,
          error: connectivityTest.message,
          connectivityTest,
          totalProducts: 0,
          successCount: 0,
          errorCount: 0,
          totalProcessed: 0,
          errors: []
        };
      }

      await this.ensureDataDirectory();

      // Busca todos os produtos da API da VTEX
      console.log('🔍 Buscando todos os produtos da API da VTEX...');
      
      try {
        const allProducts = await this.getAllProductsFromApi();
        
        if (allProducts.length === 0) {
          console.log('⚠️ Nenhum produto encontrado na API da VTEX');
          return {
            success: false,
            error: 'Nenhum produto encontrado na API da VTEX',
            totalProducts: 0,
            successCount: 0,
            errorCount: 0,
            totalProcessed: 0,
            errors: []
          };
        }
        
        console.log(`📋 Encontrados ${allProducts.length} produtos na API da VTEX`);
        
        // Salva produtos usando método otimizado
        let saveSuccess = false;
        try {
          await this.saveProductsToFileOptimized(allProducts);
          saveSuccess = true;
          console.log('✅ Produtos salvos com sucesso!');
        } catch (saveError) {
          console.error('❌ Erro ao salvar produtos:', saveError.message);
          // Fallback para método tradicional
          try {
            await this.saveProductsToFile(allProducts);
            saveSuccess = true;
            console.log('✅ Produtos salvos com método fallback!');
          } catch (fallbackError) {
            console.error('❌ Erro no método fallback:', fallbackError.message);
          }
        }
        
        // Salva informações da sincronização
        await this.saveLastSyncInfo({
          timestamp: getBrazilianTimestamp(),
          totalProducts: allProducts.length,
          successCount: allProducts.length,
          errorCount: 0,
          source: 'API VTEX',
          errors: [],
          saveSuccess: saveSuccess
        });
        
        console.log(`\n🎉 Sincronização de catalog concluída!`);
        console.log(`   ✅ Produtos encontrados: ${allProducts.length}`);
        console.log(`   📊 Total processado: ${allProducts.length}`);
        
        // Gerar CSV após salvar produtos
        let csvResult = null;
        try {
          console.log('📄 Gerando CSV de produtos...');
          csvResult = await this.generateEmarsysProductCsv(allProducts);
          console.log(`✅ CSV gerado: ${csvResult.filename}`);
        } catch (csvError) {
          console.error('❌ Erro ao gerar CSV:', csvError.message);
        }
        
        // Tentar upload SOMENTE do arquivo .gz
        let uploadResult = null;
        let gzUploadResult = null;
        if (csvResult && process.env.ENABLE_EMARSYS_UPLOAD === 'true') {
          if (!csvResult.gzFilepath) {
            console.error('❌ Arquivo .gz não foi gerado. Abortando upload.');
          } else {
            try {
              // Aguarda o .gz estar fisicamente pronto no disco
              await this._waitUntilFileReady(csvResult.gzFilepath, { timeoutMs: 120000, intervalMs: 300, minSize: 10 });
              console.log('📤 Enviando arquivo .gz para SFTP...');
              gzUploadResult = await this.uploadToEmarsys(csvResult.gzFilepath);
              console.log('✅ Upload .gz concluído');
            } catch (gzUploadError) {
              console.error('❌ Erro no upload .gz:', gzUploadError.message);
            }
          }
        } else {
          console.log('📤 Upload SFTP desabilitado (ENABLE_EMARSYS_UPLOAD != true)');
        }
        
        return {
          success: saveSuccess,
          totalProducts: allProducts.length,
          successCount: allProducts.length,
          errorCount: 0,
          totalProcessed: allProducts.length,
          errors: [],
          csvGenerated: csvResult?.filename || null,
          gzGenerated: csvResult?.gzFilename || null,
          uploadSuccess: uploadResult?.success || false,
          gzUploadSuccess: gzUploadResult?.success || false,
          message: `Sincronização concluída com ${allProducts.length} produtos da API da VTEX`
        };
        
      } catch (error) {
        console.error('❌ Erro ao buscar produtos da API:', error.message);
        
        return {
          success: false,
          error: `Erro ao buscar produtos da API: ${error.message}`,
          totalProducts: 0,
          successCount: 0,
          errorCount: 0,
          totalProcessed: 0,
          errors: [],
          message: 'Erro na sincronização'
        };
      }
      
    } catch (error) {
      console.error('❌ Erro na sincronização de produtos:', error.message);
      return {
        success: false,
        error: error.message,
        totalProducts: 0,
        successCount: 0,
        errorCount: 0,
        totalProcessed: 0,
        errors: []
      };
    } finally {
      this._isSyncRunning = false;
    }
  }

  /**
   * Envia arquivo de catálogo para Emarsys via WebDAV
   * @param {string} filePath - Caminho do arquivo CSV de catálogo
   * @param {string} remotePath - Caminho remoto (opcional)
   * @returns {Promise<Object>} Resultado do envio
   */
  async uploadCatalogFile(filePath, remotePath = null) {
    try {
      const path = require('path');
      const absolutePath = path.resolve(filePath);
      
      console.log('📤 Enviando arquivo de catálogo para Emarsys via WebDAV...');
      console.log(`📁 Caminho completo do arquivo: ${absolutePath}`);
      if (remotePath) {
        console.log(`📂 Caminho remoto: ${remotePath}`);
      }
      
      const EmarsysWebdavService = require('./emarsysWebdavService');
      const emarsysWebdav = new EmarsysWebdavService();
      
      const result = await emarsysWebdav.uploadCatalogFile(filePath, remotePath);
      
      if (result.success) {
        console.log('✅ Upload de catálogo concluído com sucesso');
        console.log('🎯 RESPOSTA EMARSYS WEBDAV:');
        console.log('   📊 Status: Sucesso');
        console.log('   📁 Arquivo local: ' + absolutePath);
        console.log('   📂 Arquivo remoto: ' + result.remotePath);
        console.log('   📏 Tamanho: ' + result.fileSize + ' MB');
        console.log('   📝 Mensagem: ' + result.message);
      } else {
        console.error('❌ Erro no upload de catálogo:');
        console.error('   📁 Arquivo: ' + absolutePath);
        console.error('   🚨 Erro: ' + result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Erro ao enviar catálogo:', error);
      return {
        success: false,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      };
    }
  }

  /**
   * Testa conexão com VTEX
   * @returns {Promise<Object>} Status da conexão
   */
  async testConnection() {
    try {
      // Tenta buscar uma página de produtos
      await this.getAllProducts();
      return {
        success: true,
        message: 'Conexão VTEX estabelecida com sucesso'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Criar instância singleton para compatibilidade com código existente
const vtexProductService = new VtexProductService();

// Exportar a instância e a classe
module.exports = vtexProductService;
module.exports.VtexProductService = VtexProductService;