const axios = require('axios');
const rateLimit = require('axios-rate-limit');
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
    const defaultDataDir = process.env.VERCEL ? '/tmp/data' : path.join(__dirname, '..', 'data');
    const defaultExports = process.env.VERCEL ? '/tmp/exports' : path.join(__dirname, '..', 'exports');
    this.dataDir = process.env.DATA_DIR || defaultDataDir;
    this.exportsDir = process.env.EXPORTS_DIR || defaultExports;
    
    // Arquivos de dados
    this.productsFile = path.join(this.dataDir, 'products.json');
    this.lastProductSyncFile = path.join(this.dataDir, 'last-product-sync.json');
    
    // Controle de sincronização
    this._isSyncRunning = false;
    
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
    this.sftpRemotePath = process.env.SFTP_REMOTE_PATH || '/catalog/catalog.csv.gz';
    
    // Validação das configurações SFTP
    this._validateSftpConfig();
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
   * Busca SKU específico por ID
   * @param {number} skuId - ID do SKU
   * @returns {Promise<Object>} Dados do SKU
   */
  async skuById(skuId) {
    try {
      const response = await this.client.get(`/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca item específico por ID
   * @param {number} itemId - ID do item
   * @returns {Promise<Object>} Dados do item
   */
  searchItem(itemId) {
    return this.client.get('/api/catalog_system/pub/products/search?fq=skuId:' + itemId, {
      validateStatus: function (status) {
        return status < 500;
      }
    })
      .then(res => res.data)
      .catch(function (error) {
        console.error(`Erro ao buscar item ${itemId}:`, error);
        throw error;
      });
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
   * Busca productIds através da API privada da VTEX
   * @param {number} limit - Limite de productIds a retornar
   * @returns {Promise<Array>} Array de productIds
   */
  async getProductIdsFromPrivateApi(limit = null) {
    const productData = await this.getProductIdsAndSkusFromPrivateApi();
    const productIds = Object.keys(productData).map(id => parseInt(id));
    
    if (limit) {
      return productIds.slice(0, limit);
    }
    
    return productIds;
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
   * Busca detalhes de um produto específico
   * @param {number} productId - ID do produto
   * @returns {Promise<Object>} Detalhes do produto
   */
  async fetchProductDetails(productId) {
    try {
      const url = `https://www.piccadilly.com.br/api/catalog_system/pub/products/search?fq=productId%3A${productId}`;
      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 6000,
        validateStatus: function (status) {
          return status < 500;
        }
      });

      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        return null;
      }

      return response.data[0];
    } catch (error) {
      console.error(`❌ Erro ao buscar produto ${productId}:`, error.message);
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
   * @param {string} remotePath - Caminho remoto (opcional)
   * @returns {Promise<Object>} Resultado do upload
   */
  async uploadToEmarsys(localFilePath, remotePath = null) {
    console.log('📤 Iniciando upload para Emarsys via SFTP...');
    
    // Validação do arquivo local
    if (!localFilePath) {
      console.error('❌ Erro: localFilePath é undefined ou null');
      return { success: false, error: 'localFilePath é undefined ou null' };
    }
    
    try {
      await fs.access(localFilePath);
      const stats = await fs.stat(localFilePath);
      console.log(`📁 Arquivo local: ${localFilePath}`);
      console.log(`📏 Tamanho: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (fileError) {
      console.error(`❌ Erro ao acessar arquivo ${localFilePath}:`, fileError.message);
      return { success: false, error: `Arquivo não encontrado: ${localFilePath}` };
    }
    
    // Validação das configurações SFTP
    const requiredVars = ['SFTP_HOST', 'SFTP_PORT', 'SFTP_USERNAME', 'SFTP_PASSWORD'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error(`❌ Variáveis de ambiente SFTP ausentes: ${missingVars.join(', ')}`);
      return { success: false, error: `Configuração SFTP incompleta: ${missingVars.join(', ')}` };
    }
    
    // Determina o caminho remoto
    let finalRemotePath = remotePath;
    if (!finalRemotePath) {
      const fileName = path.basename(localFilePath);
      if (fileName.endsWith('.gz')) {
        // Para arquivos .gz, usa o diretório catalog
        finalRemotePath = this.sftpRemotePath;
      } else {
        // Para outros arquivos, usa o diretório catalog
        finalRemotePath = `/catalog/${fileName}`;
      }
    }
    
    console.log(`📂 Caminho remoto: ${finalRemotePath}`);
    
    const maxRetries = 3;
    const baseDelayMs = 2000;
    let attempt = 0;

    const tryOnce = () => new Promise((resolve, reject) => {
      const conn = new Client();
      let timedOut = false;
      
      // Timeout para handshake inicial
      const handshakeTimeout = setTimeout(() => {
        timedOut = true;
        console.error('❌ Timeout no handshake SFTP');
        try { conn.end(); } catch (_) {}
        reject(new Error('Timed out while waiting for handshake'));
      }, 30000); // 30 segundos para handshake
      
      // Timeout geral do upload
      const overallTimeout = setTimeout(() => {
        timedOut = true;
        console.error('❌ Timeout geral do upload atingido');
        try { conn.end(); } catch (_) {}
        reject(new Error('SFTP upload timeout'));
      }, 180000); // 3 minutos para upload completo

      const cleanup = () => {
        clearTimeout(handshakeTimeout);
        clearTimeout(overallTimeout);
      };

      conn.on('ready', () => {
        console.log('✅ Conexão SFTP estabelecida');
        clearTimeout(handshakeTimeout); // Limpa o timeout do handshake
        
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
          const writeStream = sftp.createWriteStream(finalRemotePath, { autoClose: true });

          let bytesSent = 0;
          readStream.on('data', chunk => { bytesSent += chunk.length; });

          writeStream.on('close', () => {
            if (!timedOut) {
              cleanup();
              console.log(`✅ Upload concluído com sucesso (${bytesSent} bytes)`);
              conn.end();
              resolve({ success: true, remotePath: finalRemotePath, localPath: localFilePath, bytesSent });
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
        // Teste de conectividade antes de tentar upload
        if (attempt === 0) {
          console.log('🔍 Testando conectividade SFTP antes do upload...');
          try {
            await this.testSftpConnectivity();
            console.log('✅ Conectividade SFTP OK, prosseguindo com upload...');
          } catch (connectivityError) {
            console.error('❌ Falha no teste de conectividade SFTP:', connectivityError.message);
            return { success: false, error: `Falha na conectividade SFTP: ${connectivityError.message}` };
          }
        }
        
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
   * Busca todos os produtos da API da VTEX
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
    
    const productIds = Object.keys(productData).map(id => parseInt(id));
    
    if (limit) {
      productIds.splice(limit);
    }
    
    console.log(`📋 Encontrados ${productIds.length} productIds, buscando detalhes...`);
    
    const products = [];
    const batchSize = 20;
    
    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);
      console.log(`🔄 Processando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(productIds.length/batchSize)}: produtos ${i+1} a ${Math.min(i+batchSize, productIds.length)}`);
      
      const batchPromises = batch.map(async (productId) => {
        try {
          const productDetails = await this.fetchProductDetails(productId);
          return productDetails;
        } catch (error) {
          console.error(`❌ Erro no produto ${productId}:`, error.message);
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      products.push(...batchResults.filter(p => p !== null));
      
      if (i + batchSize < productIds.length) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    
    console.log(`✅ Total de produtos processados: ${products.length}`);
    return products;
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
        
        // Salva produtos
        let saveSuccess = false;
        try {
          await this.saveProductsToFile(allProducts);
          saveSuccess = true;
          console.log('✅ Produtos salvos com sucesso!');
        } catch (saveError) {
          console.error('❌ Erro ao salvar produtos:', saveError.message);
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
        
        // Tentar upload para SFTP se configurado
        let uploadResult = null;
        let gzUploadResult = null;
        if (csvResult && process.env.ENABLE_EMARSYS_UPLOAD === 'true') {
          try {
            console.log('📤 Enviando arquivo CSV para SFTP...');
            uploadResult = await this.uploadToEmarsys(csvResult.filepath);
            console.log('✅ Upload CSV concluído');
          } catch (uploadError) {
            console.error('❌ Erro no upload CSV:', uploadError.message);
          }
          
          // Tentar upload do arquivo .gz se foi gerado
          if (csvResult.gzFilepath) {
            try {
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