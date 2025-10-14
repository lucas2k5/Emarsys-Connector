const moment = require('moment');
const fs = require('fs-extra');
const path = require('path');

const vtexProductService = require('./vtexProductService');
const VtexOrdersService = require('./vtexOrdersService');
// VtexService removido - usando VtexOrdersService diretamente
const EmarsysWebdavService = require('./emarsysWebdavService');
const EmarsysHapiService = require('./emarsysHapiService');
const emarsysCsvService = require('./emarsysCsvService');
const { getBrazilianTimestamp, getBrazilianTimestampForFilename } = require('../utils/dateUtils');

class IntegrationService {
  constructor() {
    this.vtexProductService = vtexProductService;
    this.vtexOrdersService = new VtexOrdersService();
    // this.vtexService removido - usando vtexOrdersService diretamente
    this.emarsysWebdav = new EmarsysWebdavService();
    this.emarsysHapi = new EmarsysHapiService();
    const defaultDataDir = path.join(__dirname, '..', 'data');
    const defaultExports = path.join(__dirname, '..', 'exports');
    this.dataDir = process.env.DATA_DIR || defaultDataDir;
    this.exportsDir = process.env.EXPORTS_DIR || defaultExports;
  }

  /**
   * Garante que os diretórios necessários existem
   */
  async ensureDirectories() {
    try {
      await fs.ensureDir(this.dataDir);
      await fs.ensureDir(this.exportsDir);
    } catch (error) {
      console.error('Erro ao criar diretórios:', error);
      throw error;
    }
  }

  /**
   * Processa o feed de vendas completo (VTEX -> Emarsys)
   * @param {Object} options - Opções de processamento
   * @returns {Promise<Object>} Resultado do processamento
   */
  async processSalesFeed(options = {}) {
    const startTime = new Date();
    console.log('🚀 Iniciando processamento do feed de vendas...');

    try {
      await this.ensureDirectories();

      // Configurações padrão
      const config = {
        twoYears: options.twoYears || false,
        clientsOnly: options.clientsOnly || false,
        startDate: options.startDate || this.getDefaultStartDate(options.twoYears),
        toDate: options.toDate || moment().format('YYYY-MM-DDTHH:mm:ss\\Z'),
        ...options
      };

      console.log('📅 Período de processamento:', {
        startDate: config.startDate,
        toDate: config.toDate,
        twoYears: config.twoYears,
        clientsOnly: config.clientsOnly
      });

      // 1. Busca pedidos da VTEX usando vtexOrdersService
      const orders = await this.vtexOrdersService.getAllOrdersInPeriod(config.startDate, config.toDate);
      
      if (!orders || orders.length === 0) {
        return {
          success: true,
          message: 'Nenhum pedido encontrado no período especificado',
          ordersCount: 0,
          duration: this.calculateDuration(startTime)
        };
      }

      // 2. Obtém detalhes completos dos pedidos
      const detailedOrders = await this.getDetailedOrders(orders);

      // 3. Processa pedidos e gera dados
      const processedData = await this.processOrders(detailedOrders, config);

      // 4. Gera arquivos CSV
      const csvResults = await this.generateSalesCsv(processedData, config);

      // 5. Envia para Emarsys
      const emarsysResults = await this.sendSalesCsvToEmarsys(csvResults, config);

      // Log dos resultados do Emarsys
      console.log('📊 RESULTADOS DO ENVIO PARA EMARSYS:');
      console.log('📊 Configuração completa:', JSON.stringify(config, null, 2));
      if (emarsysResults.hapi) {
        if (emarsysResults.hapi.success) {
          console.log('✅ HAPI - Upload realizado com sucesso');
          console.log('   📁 Arquivo: ' + emarsysResults.hapi.filePath);
          console.log('   📏 Tamanho: ' + emarsysResults.hapi.fileSize + ' MB');
          console.log('   🌐 URL: ' + emarsysResults.hapi.url);
        } else {
          console.log('❌ HAPI - Erro no upload: ' + emarsysResults.hapi.error);
        }
      } else {
        console.log('⚠️ HAPI - Nenhum arquivo enviado');
        if (config.twoYears) {
          console.log('   🔍 Motivo: Configuração twoYears ativa (não envia para Emarsys)');
        } else if (!csvResults.sales) {
          console.log('   🔍 Motivo: Nenhum arquivo CSV de vendas gerado');
        } else if (!csvResults.sales.success) {
          console.log('   🔍 Motivo: Falha na geração do CSV de vendas');
        }
      }

      const result = {
        success: true,
        ordersCount: detailedOrders.length,
        processedData,
        csvResults,
        emarsysResults,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        duration: this.calculateDuration(startTime),
        config
      };

      console.log('✅ Processamento do feed de vendas concluído com sucesso!');
      return result;

    } catch (error) {
      console.error('❌ Erro no processamento do feed de vendas:', error);
      return {
        success: false,
        error: error.message,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        duration: this.calculateDuration(startTime)
      };
    }
  }

  /**
   * Processa o catálogo de clientes (VTEX -> Emarsys)
   * @param {Object} options - Opções de processamento
   * @returns {Promise<Object>} Resultado do processamento
   */
  async processClientCatalog(options = {}) {
    const startTime = new Date();
    console.log('🚀 Iniciando processamento do catálogo de clientes...');

    try {
      await this.ensureDirectories();

      // Configurações padrão
      const config = {
        twoYears: options.twoYears || false,
        startDate: options.startDate || this.getDefaultStartDate(options.twoYears),
        toDate: options.toDate || moment().format('YYYY-MM-DDTHH:mm:ss\\Z'),
        ...options
      };

      console.log('📅 Período de processamento do catálogo:', {
        startDate: config.startDate,
        toDate: config.toDate,
        twoYears: config.twoYears
      });

      // 1. Busca pedidos da VTEX usando vtexOrdersService
      const orders = await this.vtexOrdersService.getAllOrdersInPeriod(config.startDate, config.toDate);
      
      if (!orders || orders.length === 0) {
        return {
          success: true,
          message: 'Nenhum pedido encontrado para extrair dados de clientes',
          ordersCount: 0,
          duration: this.calculateDuration(startTime)
        };
      }

      // 2. Obtém detalhes completos dos pedidos
      const detailedOrders = await this.getDetailedOrders(orders);

      // 3. Processa apenas dados de clientes
      const processedData = await this.processOrders(detailedOrders, { ...config, clientsOnly: true });

      // 4. Gera arquivo CSV de catálogo
      const csvResults = await this.generateClientCatalogCsv(processedData, config);

      // 5. Envia para Emarsys
      const emarsysResults = await this.sendClientCatalogToEmarsys(csvResults, config);

      // Log dos resultados do Emarsys
      console.log('📊 RESULTADOS DO ENVIO PARA EMARSYS:');
      console.log('📊 Configuração completa:', JSON.stringify(config, null, 2));
      
      // Log do SFTP (.gz)
      if (emarsysResults.sftp) {
        if (emarsysResults.sftp.success) {
          console.log('✅ SFTP - Upload .gz realizado com sucesso');
          console.log('   📁 Arquivo: ' + emarsysResults.sftp.localPath);
          console.log('   📂 Caminho remoto: ' + emarsysResults.sftp.remotePath);
          console.log('   📏 Bytes enviados: ' + emarsysResults.sftp.bytesSent);
        } else {
          console.log('❌ SFTP - Erro no upload .gz: ' + emarsysResults.sftp.error);
        }
      } else {
        console.log('⚠️ SFTP - Nenhum arquivo .gz enviado');
      }
      
      // Log do WebDAV (.csv)
      if (emarsysResults.webdav) {
        if (emarsysResults.webdav.success) {
          console.log('✅ WebDAV - Upload CSV realizado com sucesso');
          console.log('   📁 Arquivo: ' + emarsysResults.webdav.filePath);
          console.log('   📏 Tamanho: ' + emarsysResults.webdav.fileSize + ' MB');
          console.log('   📂 Caminho remoto: ' + emarsysResults.webdav.remotePath);
        } else {
          console.log('❌ WebDAV - Erro no upload CSV: ' + emarsysResults.webdav.error);
        }
      } else {
        console.log('⚠️ WebDAV - Nenhum arquivo CSV enviado');
        if (!csvResults.clients) {
          console.log('   🔍 Motivo: Nenhum arquivo CSV de clientes gerado');
        } else if (!csvResults.clients.success) {
          console.log('   🔍 Motivo: Falha na geração do CSV de clientes');
        }
      }

      const result = {
        success: true,
        ordersCount: detailedOrders.length,
        processedData,
        csvResults,
        emarsysResults,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        duration: this.calculateDuration(startTime),
        config
      };

      console.log('✅ Processamento do catálogo de clientes concluído com sucesso!');
      return result;

    } catch (error) {
      console.error('❌ Erro no processamento do catálogo de clientes:', error);
      return {
        success: false,
        error: error.message,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        duration: this.calculateDuration(startTime)
      };
    }
  }

  /**
   * Processa os pedidos e extrai dados relevantes
   * @param {Array} orders - Array de pedidos
   * @param {Object} config - Configurações
   * @returns {Promise<Object>} Dados processados
   */
  async processOrders(orders, config) {
    console.log('📊 Processando dados dos pedidos...');
    
    const salesData = [];
    const clientsData = [];
    const processedEmails = new Set();

    for (const order of orders) {
      try {
        // Processa dados do cliente
        if (!config.clientsOnly && (config.twoYears || !config.clientsOnly)) {
          const clientData = await this.processClientData(order, processedEmails);
          if (clientData) {
            clientsData.push(clientData);
            processedEmails.add(clientData.email);
          }
        }

        // Processa dados de vendas
        if (!config.clientsOnly) {
          const orderSalesData = this.processSalesData(order);
          salesData.push(...orderSalesData);
        }

      } catch (error) {
        console.error(`❌ Erro ao processar pedido ${order.orderId}:`, error);
      }
    }

    return {
      salesData,
      clientsData,
      totalSales: salesData.length,
      totalClients: clientsData.length
    };
  }

  /**
   * Processa dados do cliente
   * @param {Object} order - Dados do pedido
   * @param {Set} processedEmails - Emails já processados
   * @returns {Promise<Object|null>} Dados do cliente
   */
  async processClientData(order, processedEmails) {
    try {
      const clientProfile = order.clientProfileData;
      const email = clientProfile.email;

      // Evita duplicatas
      if (processedEmails.has(email)) {
        return null;
      }

      // Obtém email real se necessário
      let realEmail = email;
      try {
        const emailMapping = await this.vtexOrdersService.getRealEmail(email);
        if (emailMapping && emailMapping.email) {
          realEmail = emailMapping.email;
        }
      } catch (error) {
        console.warn(`⚠️ Não foi possível obter email real para ${email}`);
      }

      // Busca o status de isNewsletterOptIn da CL (Customer List)
      // Valor inicial vem da trigger (pedido) - campo isNewsletterOptIn
      let optinStatus = clientProfile.isNewsletterOptIn;
      try {
        const clOptIn = await this.vtexOrdersService.getCLOptInStatus(realEmail);
        if (clOptIn !== null) {
          // Usa o valor da CL se disponível (prioridade)
          optinStatus = clOptIn;
        }
        // Se clOptIn for null, mantém o valor da trigger (clientProfile.isNewsletterOptIn)
      } catch (error) {
        console.warn(`⚠️ Erro ao buscar isNewsletterOptIn da CL para ${realEmail}, usando valor da trigger`);
        // Mantém o valor da trigger em caso de erro
      }

      // Processa documento
      const document = clientProfile.document !== '' 
        ? clientProfile.document.replace(/\D+/g, '').slice(0, 11).padStart(11, '0')
        : clientProfile.corporateDocument.replace(/\D+/g, '').slice(0, 14).padStart(14, '0');

      const cleanDocument = (document.replace(/0/g, '') !== '') ? document : '';

      return {
        email: realEmail,
        document: cleanDocument,
        firstName: this.ucFirst(clientProfile.firstName),
        lastName: this.ucFirst(clientProfile.lastName),
        homePhone: (clientProfile.phone && clientProfile.phone.length > 11) ? clientProfile.phone : '',
        street: this.ucFirst(order.shippingData.address.street),
        number: order.shippingData.address.number,
        neighborhood: this.ucFirst(order.shippingData.address.neighborhood),
        city: this.ucFirst(order.shippingData.address.city),
        state: order.shippingData.address.state,
        postalCode: order.shippingData.address.postalCode,
        userProfileId: clientProfile.userProfileId,
        optin: optinStatus
      };

    } catch (error) {
      console.error('❌ Erro ao processar dados do cliente:', error);
      return null;
    }
  }

  /**
   * Processa dados de vendas
   * @param {Object} order - Dados do pedido
   * @returns {Array} Array com dados de vendas
   */
  processSalesData(order) {
    const salesData = [];
    const isCancelled = order.status === 'invoiced' ? 1 : -1;

    for (const item of order.items) {
      const saleRecord = {
        item: `"${item.refId}"`,
        price: ((isCancelled * (item.sellingPrice * item.quantity)) / 100).toFixed(2),
        quantity: isCancelled * item.quantity,
        order: `"${order.orderId}"`,
        timestamp: moment(order.creationDate).format('YYYY-MM-DDTHH:mm:ss\\Z'),
        s_origin: `"${order.marketplace?.name || order.affiliateId || 'VTEX'}"`,
        createdAt: moment(order.creationDate).format('YYYY-MM-DDTHH:mm:ss\\Z'),
        s_market: `"${order.shippingData.address.state}"`,
        f_original_price: ((isCancelled * (item.listPrice * item.quantity)) / 100).toFixed(2),
        s_original_currency: `"${order.storePreferencesData.currencyCode}"`,
        customer: `"${order.clientProfileData.document}"`
      };

      salesData.push(saleRecord);
    }

    return salesData;
  }

  /**
   * Gera arquivo CSV de vendas (orders)
   * @param {Object} processedData - Dados processados contendo salesData
   * @param {Object} config - Configurações (twoYears, etc.)
   * @returns {Promise<Object>} Resultados da geração de CSV
   */
  async generateSalesCsv(processedData, config) {
    console.log('📊 Gerando arquivo CSV de vendas...');
    
    const results = {};
    const timestamp = getBrazilianTimestampForFilename();

    // Gera CSV de vendas (pedidos) usando a função unificada do VtexOrdersService
    if (processedData.salesData && processedData.salesData.length > 0) {
      const salesFilename = `${config.twoYears ? '2y_' : ''}sales_items_${timestamp}-online.csv`;
      
      // 1) Deduplicação por itens já processados em processed-orders.json
      // Normaliza order/item (remove aspas)
      const normalize = (v) => String(v || '').replace(/"/g, '');
      const uniqueItemIds = processedData.salesData
        .map(o => `${normalize(o.order)}_${normalize(o.item)}`)
        .filter(Boolean);

      let filteredSalesData = processedData.salesData;
      try {
        const status = await this.vtexOrdersService.getProcessedItemsStatus(uniqueItemIds);
        if (status?.processed?.length) {
          const processedSet = new Set(status.processed);
          filteredSalesData = processedData.salesData.filter(o => !processedSet.has(`${normalize(o.order)}_${normalize(o.item)}`));
          console.log(`⏭️ Itens já processados ignorados: ${processedData.salesData.length - filteredSalesData.length}`);
        }
      } catch (e) {
        console.warn('⚠️ Falha ao consultar processed-orders.json, seguindo sem filtro:', e.message);
      }

      if (!filteredSalesData.length) {
        console.log('ℹ️ Nenhum item novo para CSV após deduplicação. Pulando geração.');
        return results;
      }

      console.log(`📄 Gerando CSV com ${filteredSalesData.length} registros de vendas...`);
      
      const salesResult = await this.vtexOrdersService.generateCsvFromOrders(filteredSalesData, {
        filename: salesFilename
      });
      
      results.sales = salesResult;
      
      if (salesResult.success) {
        console.log(`✅ CSV de vendas gerado: ${salesResult.filename}`);

        // 2) Persistir itens processados para futuras deduplicações
        try {
          const syncTs = new Date().toISOString();
          const processedItems = filteredSalesData.map(o => ({
            orderId: normalize(o.order),
            itemId: normalize(o.item),
            uniqueItemId: `${normalize(o.order)}_${normalize(o.item)}`
          }));
          await this.vtexOrdersService.saveProcessedOrders(processedItems, syncTs);
        } catch (persistErr) {
          console.warn('⚠️ Não foi possível salvar processed-orders após geração do CSV:', persistErr.message);
        }
      } else {
        console.error(`❌ Erro ao gerar CSV de vendas: ${salesResult.error}`);
      }
    } else {
      console.warn('⚠️ Nenhum dado de vendas encontrado para gerar CSV');
    }

    return results;
  }

  /**
   * Gera arquivo CSV de catálogo de clientes
   * @param {Object} processedData - Dados processados
   * @param {Object} config - Configurações
   * @returns {Promise<Object>} Resultados da geração de CSV
   */
  async generateClientCatalogCsv(processedData, config) {
    console.log('📊 Gerando arquivo CSV de catálogo de clientes...');
    
    const results = {};
    const timestamp = getBrazilianTimestampForFilename();

    // Gera CSV de clientes (catálogo de clientes)
    if (processedData.clientsData.length > 0) {
      const clientsFilename = `clients_${timestamp}.csv`;
      const clientsResult = await emarsysCsvService.generateCatalogCsv(processedData.clientsData, clientsFilename, {
        generateGz: true // Sempre gera o arquivo .gz para clientes
      });
      results.clients = clientsResult;
    }

    return results;
  }

  /**
   * Envia arquivo de vendas para Emarsys via HAPI
   * @param {Object} csvResults - Resultados da geração de CSV
   * @param {Object} config - Configurações
   * @returns {Promise<Object>} Resultados do envio
   */
  async sendSalesCsvToEmarsys(csvResults, config) {
    console.log('📤 Enviando arquivo de vendas para Emarsys via HAPI...');
    console.log('📊 Configuração twoYears:', config.twoYears);
    console.log('📊 CSV Results sales:', csvResults.sales ? 'existe' : 'não existe');
    console.log('📊 CSV Results sales success:', csvResults.sales?.success);
    
    const results = {};

    // Envia arquivo de vendas via HAPI
    if (csvResults.sales && csvResults.sales.success && !config.twoYears) {
      console.log('📤 Enviando arquivo de vendas via HAPI...');
      results.hapi = await this.vtexOrdersService.uploadSalesDataFile(csvResults.sales.filePath);
    } else {
      console.log('⚠️ Condições não atendidas para envio HAPI:');
      console.log('   - csvResults.sales existe:', !!csvResults.sales);
      console.log('   - csvResults.sales.success:', csvResults.sales?.success);
      console.log('   - !config.twoYears:', !config.twoYears);
    }

    return results;
  }

  /**
   * Envia arquivo de catálogo para Emarsys via SFTP (.gz) e WebDAV (.csv)
   * @param {Object} csvResults - Resultados da geração de CSV
   * @param {Object} config - Configurações
   * @returns {Promise<Object>} Resultados do envio
   */
  async sendClientCatalogToEmarsys(csvResults, config) {
    console.log('📤 Enviando arquivo de catálogo para Emarsys...');
    console.log('📊 CSV Results clients:', csvResults.clients ? 'existe' : 'não existe');
    console.log('📊 CSV Results clients success:', csvResults.clients?.success);
    
    const results = {};

    // Envia arquivo de clientes
    if (csvResults.clients && csvResults.clients.success) {
      // Log das informações do arquivo .gz
      if (csvResults.clients.gzFilepath) {
        console.log('📦 Informações do arquivo .gz:');
        console.log(`   📁 Arquivo: ${csvResults.clients.gzFilepath}`);
        console.log(`   📏 Tamanho: ${csvResults.clients.gzSize} bytes (${(csvResults.clients.gzSize / 1024).toFixed(2)} KB)`);
        console.log(`   📄 Nome: ${csvResults.clients.gzFilename}`);
      }
      
      // Envia arquivo .gz via SFTP (principal)
      if (csvResults.clients.gzFilepath) {
        console.log('📤 Enviando arquivo .gz para Emarsys via SFTP...');
        try {
          results.sftp = await this.vtexProductService.uploadToEmarsys(csvResults.clients.gzFilepath);
          console.log('✅ Upload .gz via SFTP concluído');
        } catch (sftpError) {
          console.error('❌ Erro no upload .gz via SFTP:', sftpError.message);
          results.sftp = { success: false, error: sftpError.message };
        }
      } else {
        console.log('⚠️ Arquivo .gz não encontrado');
      }
      
      // Envia arquivo CSV via WebDAV (backup)
      console.log('📤 Enviando arquivo CSV para Emarsys via WebDAV...');
      results.webdav = await this.vtexProductService.uploadCatalogFile(csvResults.clients.filePath);
    } else {
      console.log('⚠️ Condições não atendidas para envio:');
      console.log('   - csvResults.clients existe:', !!csvResults.clients);
      console.log('   - csvResults.clients.success:', csvResults.clients?.success);
    }

    return results;
  }

  /**
   * Obtém data inicial padrão
   * @param {boolean} twoYears - Se deve buscar 2 anos atrás
   * @returns {string} Data inicial formatada
   */
  getDefaultStartDate(twoYears = false) {
    if (twoYears) {
      return moment().subtract(2, 'y').format('YYYY-MM-DDTHH:mm:ss\\Z');
    }
    
    // Busca último arquivo de sincronização
    const lastSyncFile = path.join(this.dataDir, 'last-sync.json');
    if (fs.existsSync(lastSyncFile)) {
      try {
        const lastSync = fs.readJsonSync(lastSyncFile);
        if (lastSync.lastSync) {
          return moment(lastSync.lastSync).format('YYYY-MM-DDTHH:mm:ss\\Z');
        }
      } catch (error) {
        console.warn('⚠️ Erro ao ler último sync:', error);
      }
    }
    
    // Padrão: 1 dia atrás
    return moment().subtract(1, 'd').format('YYYY-MM-DDTHH:mm:ss\\Z');
  }

  /**
   * Calcula duração do processamento
   * @param {Date} startTime - Tempo inicial
   * @returns {string} Duração formatada
   */
  calculateDuration(startTime) {
    const durationMs = new Date() - startTime;
    const durationMinutes = Math.floor(durationMs / (1000 * 60));
    const durationSeconds = Math.floor((durationMs % (1000 * 60)) / 1000);
    return `${durationMinutes}m ${durationSeconds}s`;
  }

  /**
   * Capitaliza primeira letra
   * @param {string} str - String para capitalizar
   * @returns {string} String capitalizada
   */
  ucFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Testa todas as conexões
   * @returns {Promise<Object>} Status das conexões
   */
  async testConnections() {
    console.log('🔍 Testando conexões...');
    
    const results = {
      vtex: await this.testVtexConnection(),
      webdav: await this.emarsysWebdav.testConnection(),
      hapi: await this.emarsysHapi.testConnection()
    };

    const allConnected = Object.values(results).every(r => r.success);
    
    return {
      success: allConnected,
      connections: results,
      message: allConnected ? 'Todas as conexões OK' : 'Algumas conexões falharam'
    };
  }

  /**
   * Testa conexão com VTEX
   * @returns {Promise<Object>} Status da conexão
   */
  async testVtexConnection() {
    try {
      // Testa conexão de produtos
      const productTest = await this.vtexProductService.testConnection();
      if (!productTest.success) {
        return productTest;
      }
      
      // Testa conexão de pedidos
      const ordersTest = await this.vtexOrdersService.testConnection();
      if (!ordersTest.success) {
        return ordersTest;
      }
      
      return {
        success: true,
        message: 'Conexões VTEX (produtos e pedidos) estabelecidas com sucesso'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtém detalhes completos dos pedidos
   * @param {Array} orders - Array de pedidos básicos
   * @returns {Promise<Array>} Array com detalhes completos dos pedidos
   */
  async getDetailedOrders(orders) {
    console.log('🔍 Obtendo detalhes completos dos pedidos...');
    
    const detailedOrders = [];
    
    for (const order of orders) {
      try {
        const orderDetail = await this.vtexOrdersService.getOrderById(order.orderId);
        detailedOrders.push(orderDetail);
        
        // Pausa entre requisições
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Erro ao obter detalhes do pedido ${order.orderId}:`, error);
      }
    }

    console.log(`✅ ${detailedOrders.length} pedidos com detalhes obtidos`);
    return detailedOrders;
  }
}

module.exports = IntegrationService; 