const axios = require('axios');
const rateLimit = require('axios-rate-limit');
const fs = require('fs-extra');
const path = require('path');
const { getBrazilianTimestamp, getBrazilianTimestampForFilename } = require('../utils/dateUtils');
require('dotenv').config();

class VtexOrdersService {
  constructor() {
    this.ordersUrl = process.env.VTEX_ORDERS_URL;
    
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
      'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
    };
    
    const baseURL = process.env.VTEX_BASE_URL;
    if (!baseURL) {
      throw new Error('VTEX_BASE_URL não configurada');
    }
    
    console.log(`🔧 Configurando cliente VTEX com baseURL: ${baseURL}`);
    
    this.client = rateLimit(axios.create({
      baseURL: baseURL,
      headers
    }), { maxRequests: 3900, perMilliseconds: 1000 });
    
    // Initialize axios-retry asynchronously
    this._initializeAxiosRetry();

    // Configuração de diretórios
    const defaultDataDir = path.join(__dirname, '..', 'data');
    const defaultExports = path.join(__dirname, '..', 'exports');
    this.dataDir = process.env.DATA_DIR || defaultDataDir;
    this.exportsDir = process.env.EXPORTS_DIR || defaultExports;
    this.ordersFile = path.join(this.dataDir, 'orders.json');
    this.lastSyncFile = path.join(this.dataDir, 'last-sync.json');
    this.emarsysSyncFile = path.join(this.dataDir, 'emarsys-sync.json');
    this.errorLogFile = path.join(this.dataDir, 'sync-errors.json');
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
   * Busca pedidos por período (OMS) usando query params (com URL-encode correto)
   * @param {string} startDateISO - Data inicial em ISO UTC (ex: 2025-08-01T00:00:00Z)
   * @param {string} endDateISO - Data final em ISO UTC (ex: 2025-08-31T23:59:59Z)
   * @param {number} page - Número da página (1-based)
   * @param {Object} options - Parâmetros adicionais (per_page, f_status, orderBy)
   * @returns {Promise<Object>} Resposta da VTEX OMS
   */
  async searchOrdersByPeriod(startDateISO, endDateISO, page = 1, options = {}) {
    const url = `/api/oms/pvt/orders`;
    const params = {
      f_creationDate: `creationDate:[${startDateISO} TO ${endDateISO}]`,
      per_page: options.per_page || 100,
      page: page,
      orderBy: options.orderBy || 'creationDate,asc',
      f_status: options.f_status || undefined
    };
    
    // Log detalhado para debug de datas
    console.log('🔍 DEBUG FILTRO DE DATAS:');
    console.log(`   📅 Data inicial recebida: ${startDateISO}`);
    console.log(`   📅 Data final recebida: ${endDateISO}`);
    console.log(`   🔍 Filtro aplicado: ${params.f_creationDate}`);
    console.log(`   📄 Página: ${page}`);
    
    try {
      const res = await this.client.get(url, { params });
      
      // Log da resposta para debug
      if (res.data && res.data.list && res.data.list.length > 0) {
        const firstOrder = res.data.list[0];
        const lastOrder = res.data.list[res.data.list.length - 1];
        console.log(`   ✅ ${res.data.list.length} pedidos encontrados`);
        console.log(`   📅 Primeiro pedido: ${firstOrder.orderId} - ${firstOrder.creationDate}`);
        console.log(`   📅 Último pedido: ${lastOrder.orderId} - ${lastOrder.creationDate}`);
      }
      
      return res.data;
    } catch (error) {
      console.error('Erro ao buscar pedidos (OMS):', error?.response?.data || error.message);
      throw error;
    }
  }

  // searchOrdersOMS removida: use apenas searchOrdersByPeriod

  /**
   * Busca pedidos da VTEX (método antigo)
   * @param {number} page - Página atual
   * @param {number} pageSize - Tamanho da página
   * @returns {Object} Dados dos pedidos
   */
  async fetchOrders(page = 1, pageSize = 200) {
    try {
      console.log(`🔄 Buscando pedidos da VTEX - Página ${page}`);
      
      // Garante que a URL seja válida
      let ordersUrl = this.ordersUrl;
      if (!ordersUrl) {
        throw new Error('VTEX_ORDERS_URL não configurada');
      }
      
      // Se a URL não for absoluta, usa o endpoint padrão
      if (!ordersUrl.startsWith('http')) {
        ordersUrl = '/_v/orders/list';
      }
      
      console.log(`🔗 Usando URL: ${ordersUrl}`);
      
      // Se a URL é absoluta, usa axios diretamente; caso contrário, usa o client com baseURL
      let response;
      if (ordersUrl.startsWith('http')) {
        // URL absoluta - usa axios diretamente
        response = await axios.get(ordersUrl, {
          params: {
            page,
            pageSize
          },
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
            'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
          },
          timeout: 30000
        });
      } else {
        // URL relativa - usa o client com baseURL
        response = await this.client.get(ordersUrl, {
          params: {
            page,
            pageSize
          },
          timeout: 30000
        });
      }

      return response.data;
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos da VTEX:', error.message);
      throw new Error(`Erro ao buscar pedidos: ${error.message}`);
    }
  }

  /**
   * Busca pedidos da nova base de dados
   * @param {Object} options - Opções de busca (page, pageSize, dataInicial, dataFinal)
   * @returns {Object} Dados dos pedidos
   */
  async fetchOrdersFromNewBase(options = {}) {
    try {
      const { page = 1, pageSize = 100, dataInicial, dataFinal } = options;
      
      console.log(`🔄 Buscando pedidos da nova base - Página ${page}`);
      
      // Se há datas especificadas, usa searchOrdersByPeriod
      if (dataInicial && dataFinal) {
        console.log(`📅 Buscando por período: ${dataInicial} até ${dataFinal}`);
        return await this.searchOrdersByPeriod(dataInicial, dataFinal, page, { per_page: pageSize });
      }
      
      // Caso contrário, usa o método padrão
      return await this.fetchOrders(page, pageSize);
      
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos da nova base:', error.message);
      throw new Error(`Erro ao buscar pedidos da nova base: ${error.message}`);
    }
  }

  /**
   * Busca todos os pedidos da nova base
   * @param {Object} options - Opções de busca
   * @returns {Array} Array com todos os pedidos
   */
  async fetchAllOrdersFromNewBase(options = {}) {
    try {
      const { dataInicial, dataFinal, pageSize = 100 } = options;
      
      console.log('🚀 Iniciando busca de todos os pedidos da nova base...');
      
      // Se há datas especificadas, usa getAllOrdersInPeriod
      if (dataInicial && dataFinal) {
        console.log(`📅 Buscando por período: ${dataInicial} até ${dataFinal}`);
        return await this.getAllOrdersInPeriod(dataInicial, dataFinal, false);
      }
      
      // Caso contrário, usa o método padrão
      return await this.fetchAllOrders();
      
    } catch (error) {
      console.error('❌ Erro ao buscar todos os pedidos da nova base:', error.message);
      throw error;
    }
  }

  /**
   * Busca todos os pedidos (todas as páginas)
   * @returns {Array} Array com todos os pedidos
   */
  async fetchAllOrders() {
    try {
      console.log('🚀 Iniciando busca de todos os pedidos da VTEX...');
      
      let allOrders = [];
      let currentPage = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        const response = await this.fetchOrders(currentPage, 50);
        
        if (response.success && response.data) {
          allOrders = allOrders.concat(response.data);
          console.log(`✅ Página ${currentPage}: ${response.data.length} pedidos encontrados`);
          
          // Verifica se há mais páginas
          if (response.pagination) {
            const totalPages = Math.ceil(response.pagination.total / response.pagination.pageSize);
            hasMorePages = currentPage < totalPages;
            currentPage++;
          } else {
            hasMorePages = false;
          }
        } else {
          console.log('⚠️ Resposta inesperada da VTEX:', response);
          hasMorePages = false;
        }

        // Pequena pausa entre as requisições para não sobrecarregar
        if (hasMorePages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`🎉 Busca concluída! Total de ${allOrders.length} pedidos encontrados`);
      console.log('------------- end -----------');
      return allOrders;
    } catch (error) {
      console.error('❌ Erro ao buscar todos os pedidos:', error.message);
      throw error;
    }
  }

  /**
   * Salva log de erro local em JSON
   * @param {Object} errorData - Dados do erro para salvar
   */
  async saveErrorLog(errorData) {
    try {
      await this.ensureDataDirectory();
      
      const timestamp = getBrazilianTimestamp();
      const errorEntry = {
        timestamp,
        ...errorData
      };

      // Lê logs existentes ou cria array vazio
      let existingLogs = [];
      try {
        if (fs.existsSync(this.errorLogFile)) {
          const fileContent = await fs.readFile(this.errorLogFile, 'utf8');
          existingLogs = JSON.parse(fileContent);
        }
      } catch (readError) {
        console.warn('⚠️ Erro ao ler arquivo de log existente:', readError.message);
        existingLogs = [];
      }

      // Adiciona novo log
      existingLogs.push(errorEntry);

      // Mantém apenas os últimos 1000 logs para evitar arquivo muito grande
      if (existingLogs.length > 1000) {
        existingLogs = existingLogs.slice(-1000);
      }

      // Salva arquivo atualizado
      await fs.writeFile(this.errorLogFile, JSON.stringify(existingLogs, null, 2));
      
      console.log('📝 Log de erro salvo:', errorEntry.type || 'erro-generico');
    } catch (error) {
      console.error('❌ Erro ao salvar log de erro:', error.message);
    }
  }

  /**
   * Salva estatísticas detalhadas da sincronização
   * @param {Object} stats - Estatísticas da sincronização
   */
  async saveSyncStats(stats) {
    try {
      await this.ensureDataDirectory();
      
      const statsFile = path.join(this.dataDir, 'sync-stats.json');
      const timestamp = getBrazilianTimestamp();
      
      const statsEntry = {
        timestamp,
        ...stats
      };

      // Lê estatísticas existentes
      let existingStats = [];
      try {
        if (fs.existsSync(statsFile)) {
          const fileContent = await fs.readFile(statsFile, 'utf8');
          existingStats = JSON.parse(fileContent);
        }
      } catch (readError) {
        existingStats = [];
      }

      // Adiciona nova estatística
      existingStats.push(statsEntry);

      // Mantém apenas os últimos 100 registros
      if (existingStats.length > 100) {
        existingStats = existingStats.slice(-100);
      }

      await fs.writeFile(statsFile, JSON.stringify(existingStats, null, 2));
      console.log('📊 Estatísticas de sincronização salvas');
    } catch (error) {
      console.error('❌ Erro ao salvar estatísticas:', error.message);
    }
  }

  /**
   * Lê e retorna logs de erro salvos
   * @param {Object} options - Opções de filtro (tipo, fase, limite)
   * @returns {Array} Array de logs de erro
   */
  async getErrorLogs(options = {}) {
    try {
      const { type, phase, limit = 50 } = options;
      
      if (!fs.existsSync(this.errorLogFile)) {
        return [];
      }

      const fileContent = await fs.readFile(this.errorLogFile, 'utf8');
      let logs = JSON.parse(fileContent);

      // Aplica filtros se especificados
      if (type) {
        logs = logs.filter(log => log.type === type);
      }
      
      if (phase) {
        logs = logs.filter(log => log.phase === phase);
      }

      // Ordena por timestamp mais recente primeiro
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Limita quantidade de resultados
      return logs.slice(0, limit);

    } catch (error) {
      console.error('❌ Erro ao ler logs de erro:', error.message);
      return [];
    }
  }

  /**
   * Lê e retorna estatísticas de sincronização
   * @param {Object} options - Opções de filtro (fase, limite)
   * @returns {Array} Array de estatísticas
   */
  async getSyncStats(options = {}) {
    try {
      const { phase, limit = 20 } = options;
      const statsFile = path.join(this.dataDir, 'sync-stats.json');
      
      if (!fs.existsSync(statsFile)) {
        return [];
      }

      const fileContent = await fs.readFile(statsFile, 'utf8');
      let stats = JSON.parse(fileContent);

      // Aplica filtros se especificados
      if (phase) {
        stats = stats.filter(stat => stat.phase === phase);
      }

      // Ordena por timestamp mais recente primeiro
      stats.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return stats.slice(0, limit);

    } catch (error) {
      console.error('❌ Erro ao ler estatísticas:', error.message);
      return [];
    }
  }

  /**
   * Gera relatório resumido dos logs de erro
   * @returns {Object} Relatório com estatísticas dos erros
   */
  async generateErrorReport() {
    try {
      const logs = await this.getErrorLogs({ limit: 1000 });
      
      if (logs.length === 0) {
        return {
          totalErrors: 0,
          message: 'Nenhum erro encontrado nos logs'
        };
      }

      // Agrupa erros por tipo
      const errorsByType = {};
      const errorsByPhase = {};
      const recentErrors = logs.slice(0, 10);

      logs.forEach(log => {
        errorsByType[log.type] = (errorsByType[log.type] || 0) + 1;
        if (log.phase) {
          errorsByPhase[log.phase] = (errorsByPhase[log.phase] || 0) + 1;
        }
      });

      return {
        totalErrors: logs.length,
        errorsByType,
        errorsByPhase,
        recentErrors,
        oldestError: logs[logs.length - 1]?.timestamp,
        newestError: logs[0]?.timestamp
      };

    } catch (error) {
      console.error('❌ Erro ao gerar relatório:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Obtém email real a partir do email ofuscado
   * @param {string} obfuscatedEmail - Email ofuscado
   * @returns {Promise<Object>} Dados do email real
   */
  getRealEmail(obfuscatedEmail) {
    const url = `/api/pvt/emailMapping?alias=${obfuscatedEmail}`;
    return this.client.get(url)
      .then(res => res.data)
      .catch(function (error) {
        console.error(`Erro ao obter email real para ${obfuscatedEmail}:`, error);
        throw error;
      });
  }

  /**
   * Obtém feed de pedidos
   * @returns {Promise<Object>} Feed de pedidos
   */
  getOrdersFeed() {
    const url = `/api/orders/feed?maxlot=10`;
    return this.client.get(url)
      .then(res => res.data)
      .catch(function (error) {
        console.error('Erro ao obter feed de pedidos:', error);
        throw error;
      });
  }

  /**
   * Obtém detalhes de um pedido específico
   * @param {string} orderId - ID do pedido
   * @returns {Promise<Object>} Detalhes do pedido
   */
  getOrderById(orderId) {
    const url = `/api/oms/pvt/orders/${orderId}`;
    return this.client.get(url)
      .then(res => res.data)
      .catch(function (error) {
        console.error(`Erro ao obter pedido ${orderId}:`, error);
        throw error;
      });
  }

  /**
   * Busca pedidos em lotes menores para evitar limite de páginas da VTEX
   * @param {string} startDate - Data inicial
   * @param {string} toDate - Data final
   * @param {number} daysPerBatch - Dias por lote (padrão: 7 dias)
   * @returns {Promise<Array>} Array com todos os pedidos
   */
  async getAllOrdersInPeriodBatched(startDate, toDate, daysPerBatch = 7) {
    try {
      console.log(`🔄 Buscando pedidos em lotes de ${daysPerBatch} dias...`);
      console.log(`📅 Datas recebidas: startDate=${startDate}, toDate=${toDate}`);
      
      const start = new Date(startDate);
      const end = new Date(toDate);
      
      // Validação das datas
      if (isNaN(start.getTime())) {
        throw new Error(`Data inicial inválida: ${startDate}`);
      }
      if (isNaN(end.getTime())) {
        throw new Error(`Data final inválida: ${toDate}`);
      }
      
      console.log(`✅ Datas válidas: start=${start.toISOString()}, end=${end.toISOString()}`);
      
      let allOrders = [];
      let currentDate = new Date(start);
      
      while (currentDate <= end) {
        const batchStart = new Date(currentDate);
        const batchEnd = new Date(currentDate);
        batchEnd.setDate(batchEnd.getDate() + daysPerBatch - 1);
        
        // Garante que não ultrapasse a data final
        if (batchEnd > end) {
          batchEnd.setTime(end.getTime());
        }
        
        // Validação adicional antes de toISOString()
        if (isNaN(batchStart.getTime()) || isNaN(batchEnd.getTime())) {
          console.error(`❌ Data inválida detectada: batchStart=${batchStart}, batchEnd=${batchEnd}`);
          throw new Error('Data inválida durante processamento de lotes');
        }
        
        const batchStartISO = batchStart.toISOString();
        const batchEndISO = batchEnd.toISOString();
        
        console.log(`📦 Lote: ${batchStartISO} até ${batchEndISO}`);
        
        try {
          const batchOrders = await this.getAllOrdersInPeriod(batchStartISO, batchEndISO);
          allOrders = allOrders.concat(batchOrders);
          console.log(`✅ Lote concluído: ${batchOrders.length} pedidos`);
        } catch (error) {
          console.error(`❌ Erro no lote ${batchStartISO} - ${batchEndISO}:`, error.message);
          // Continua com o próximo lote mesmo se um falhar
        }
        
        // Avança para o próximo lote
        currentDate.setDate(currentDate.getDate() + daysPerBatch);
        
        // Pausa entre lotes
        if (currentDate <= end) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      console.log(`🎉 Busca em lotes concluída! Total de ${allOrders.length} pedidos encontrados`);
      return allOrders;
      
    } catch (error) {
      console.error('❌ Erro na busca em lotes:', error);
      throw error;
    }
  }

  /**
   * Busca todos os pedidos em um período com paginação automática
   * @param {string} startDate - Data inicial
   * @param {string} toDate - Data final
   * @param {boolean} useBatching - Se deve usar busca em lotes (padrão: false)
   * @returns {Promise<Array>} Array com todos os pedidos
   */
  async getAllOrdersInPeriod(startDate, toDate, useBatching = false) {
    // Se useBatching for true, usa busca em lotes
    if (useBatching) {
      return this.getAllOrdersInPeriodBatched(startDate, toDate);
    }
    
    try {
      console.log(`🔄 Buscando pedidos de ${startDate} até ${toDate}...`);
      

      let allOrders = [];
      let page = 1;
      let hasMorePages = true;
      const MAX_PAGES = 30; // Limite da VTEX
      const PER_PAGE = 100; // Máximo por página para reduzir número de páginas

      while (hasMorePages && page <= MAX_PAGES) {
        try {
          console.log(`📄 Buscando página ${page}/${MAX_PAGES}...`);
          const orderFeed = await this.searchOrdersByPeriod(startDate, toDate, page, {
            per_page: PER_PAGE,
            orderBy: 'creationDate,asc'
          });
          
          if (orderFeed && orderFeed.list) {
            allOrders = allOrders.concat(orderFeed.list);
            console.log(`✅ Página ${page}: ${orderFeed.list.length} pedidos encontrados`);
            
            // Verifica se há mais páginas
            if (orderFeed.paging && orderFeed.paging.pages) {
              const totalPages = orderFeed.paging.pages;
              const currentPage = orderFeed.paging.currentPage || page;
              
              console.log(`📊 Paginação: página ${currentPage} de ${totalPages} (máximo ${MAX_PAGES})`);
              
              // Verifica se há mais páginas E se não excedeu o limite da VTEX
              hasMorePages = currentPage < totalPages && page < MAX_PAGES;
              
              if (page >= MAX_PAGES && currentPage < totalPages) {
                console.warn(`⚠️ Limite de ${MAX_PAGES} páginas atingido. Total de páginas disponíveis: ${totalPages}`);
                console.warn(`⚠️ Pedidos encontrados até agora: ${allOrders.length}`);
                console.warn(`⚠️ Para buscar mais pedidos, refine o filtro de período`);
              }
              
              page++;
            } else {
              hasMorePages = false;
            }
          } else {
            console.log('⚠️ Resposta inesperada da VTEX:', orderFeed);
            hasMorePages = false;
          }

        } catch (error) {
          // Trata especificamente o erro de limite de páginas
          if (error?.response?.data?.error?.message?.includes('Max page exceed')) {
            console.warn(`⚠️ Limite de páginas da VTEX atingido na página ${page}`);
            console.warn(`⚠️ Pedidos encontrados até agora: ${allOrders.length}`);
            console.warn(`⚠️ Para buscar mais pedidos, refine o filtro de período`);
            hasMorePages = false;
          } else {
            console.error(`❌ Erro na página ${page}:`, error.message);
            throw error;
          }
        }

        // Pausa entre requisições para não sobrecarregar
        if (hasMorePages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`🎉 Busca concluída! Total de ${allOrders.length} pedidos encontrados`);
      
      if (page > MAX_PAGES) {
        console.log(`ℹ️ Nota: Busca limitada a ${MAX_PAGES} páginas devido ao limite da VTEX`);
      }
      
      return allOrders;
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos no período:', error);
      throw error;
    }
  }

  /**
   * Testa conexão com VTEX
   * @returns {Promise<Object>} Status da conexão
   */
  async testConnection() {
    try {
      // Tenta buscar um feed de pedidos
      await this.getOrdersFeed();
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

  /**
   * Garante que o diretório de dados existe
   */
  async ensureDataDirectory() {
    try {
      await fs.ensureDir(this.dataDir);
      await fs.ensureDir(this.exportsDir);
    } catch (error) {
      console.error('❌ Erro ao criar diretórios:', error);
      throw error;
    }
  }

  /**
   * Garante que o diretório de saída existe com fallback
   * @returns {string} Caminho do diretório de saída
   */
  async ensureOutputDirectory() {
    const defaultExports = path.join(__dirname, '..', 'exports');
    let outputDir = process.env.EXPORTS_DIR || defaultExports;
    
    try {
      await fs.mkdir(outputDir, { recursive: true });
      console.log(`📁 Diretório de exports criado/verificado: ${outputDir}`);
      return outputDir;
    } catch (error) {
      console.error(`❌ Erro ao criar diretório ${outputDir}:`, error.message);
    }
  }

  /**
   * Salva pedidos em arquivo JSON
   * @param {Array} orders - Array de pedidos
   */
  /**
   * Salva pedidos em formato JSON para backup local
   * @param {Array} orders - Array de pedidos
   * @returns {Object} Resultado da operação
   */
  async saveOrdersToFile(orders) {
    try {
      await this.ensureDataDirectory();
      
      const data = {
        orders: orders,
        totalOrders: orders.length,
        timestamp: getBrazilianTimestamp(),
        lastUpdate: new Date().toISOString()
      };
      
      await fs.writeJson(this.ordersFile, data, { spaces: 2 });
      console.log(`💾 ${orders.length} pedidos salvos em ${this.ordersFile}`);
      
      return {
        success: true,
        filename: this.ordersFile,
        totalOrders: orders.length,
        timestamp: getBrazilianTimestamp()
      };
    } catch (error) {
      console.error('❌ Erro ao salvar pedidos:', error);
      throw error;
    }
  }

  /**
   * [DEPRECATED] Salva controle de pedidos processados para evitar duplicatas
   * Agora usa a entidade emsOrdersV2 para controle de sincronização
   * @param {Array} orderIds - Array de IDs dos pedidos processados
   * @param {string} syncTimestamp - Timestamp da sincronização
   * @returns {Object} Resultado da operação
   */
  async saveProcessedOrders(processedItems, syncTimestamp) {
    console.log('⚠️ [DEPRECATED] saveProcessedOrders - Agora usa emsOrdersV2.isSync para controle de sincronização');
    return { success: true, message: 'Deprecated - usando emsOrdersV2' };
    try {
      await this.ensureDataDirectory();
      
      const processedOrdersFile = path.join(this.dataDir, 'processed-orders.json');
      
      // Lê dados existentes
      let existingData = { processedOrders: [], lastSync: null };
      if (fs.existsSync(processedOrdersFile)) {
        try {
          const fileContent = await fs.readFile(processedOrdersFile, 'utf8');
          existingData = JSON.parse(fileContent);
          
          // LIMPEZA: Remove duplicatas existentes no arquivo
          if (existingData.processedOrders && existingData.processedOrders.length > 0) {
            const originalCount = existingData.processedOrders.length;
            const uniqueMap = new Map();
            
            // Mantém apenas o mais recente para cada uniqueItemId
            for (const order of existingData.processedOrders) {
              const uniqueKey = order.uniqueItemId || `${order.orderId}_${order.itemId}`;
              if (!uniqueMap.has(uniqueKey)) {
                uniqueMap.set(uniqueKey, order);
              } else {
                // Se já existe, mantém o mais recente baseado na data de processamento
                const existing = uniqueMap.get(uniqueKey);
                const existingDate = new Date(existing.processedAt || 0);
                const currentDate = new Date(order.processedAt || 0);
                
                if (currentDate > existingDate) {
                  uniqueMap.set(uniqueKey, order);
                }
              }
            }
            
            existingData.processedOrders = Array.from(uniqueMap.values());
            
            if (originalCount !== existingData.processedOrders.length) {
              console.log(`🧹 Limpeza de duplicatas existentes: ${originalCount} → ${existingData.processedOrders.length} registros`);
              // Salva o arquivo limpo imediatamente
              await fs.writeJson(processedOrdersFile, existingData, { spaces: 2 });
            }
          }
        } catch (error) {
          console.warn('⚠️ Erro ao ler arquivo de pedidos processados, criando novo:', error.message);
        }
      }
      
      // Adiciona novos itens processados (sem duplicatas)
      const newProcessedItems = processedItems.map(item => ({
        orderId: item.orderId,
        itemId: item.itemId,
        uniqueItemId: item.uniqueItemId,
        processedAt: syncTimestamp,
        syncId: syncTimestamp.replace(/[:.]/g, '-')
      }));
      
      existingData.processedOrders = existingData.processedOrders || [];
      
      // Cria um Set com os uniqueItemIds já processados para evitar duplicatas
      const existingUniqueIds = new Set(existingData.processedOrders.map(order => order.uniqueItemId || `${order.orderId}_${order.itemId}`));
      
      // DEDUPLICAÇÃO DUPLA: Remove duplicatas tanto dos dados existentes quanto dos novos
      const newItemsMap = new Map();
      
      // Primeiro, remove duplicatas entre os novos itens
      for (const item of newProcessedItems) {
        const uniqueKey = item.uniqueItemId || `${item.orderId}_${item.itemId}`;
        if (!newItemsMap.has(uniqueKey)) {
          newItemsMap.set(uniqueKey, item);
        } else {
          console.log(`⚠️ Duplicata detectada nos novos itens: ${uniqueKey} - removendo`);
        }
      }
      
      // Filtra apenas itens que ainda não foram processados (não existem no arquivo)
      const uniqueNewItems = Array.from(newItemsMap.values()).filter(item => {
        const uniqueKey = item.uniqueItemId || `${item.orderId}_${item.itemId}`;
        return !existingUniqueIds.has(uniqueKey);
      });
      
      // Adiciona apenas os itens únicos
      existingData.processedOrders.push(...uniqueNewItems);
      existingData.lastSync = syncTimestamp;
      
      const duplicatesInNewItems = newProcessedItems.length - newItemsMap.size;
      const duplicatesFromExisting = newItemsMap.size - uniqueNewItems.length;
      console.log(`🔍 Deduplicação: ${newProcessedItems.length} novos itens → ${newItemsMap.size} únicos → ${uniqueNewItems.length} adicionados (${duplicatesInNewItems} duplicatas internas, ${duplicatesFromExisting} já processados)`);
      
      // Remove registros antigos (manter apenas período configurado)
      const retentionHours = parseInt(process.env.PROCESSED_ORDERS_RETENTION_HOURS) || 720;
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - retentionHours);
      
      existingData.processedOrders = existingData.processedOrders.filter(record => {
        const processedDate = new Date(record.processedAt);
        return processedDate >= cutoffDate;
      });
      
      // Salva arquivo atualizado
      await fs.writeJson(processedOrdersFile, existingData, { spaces: 2 });
      
      console.log(`💾 ${uniqueNewItems.length} itens únicos marcados como processados`);
      
      return {
        success: true,
        totalProcessed: existingData.processedOrders.length,
        newProcessed: uniqueNewItems.length,
        timestamp: syncTimestamp
      };
      
    } catch (error) {
      console.error('❌ Erro ao salvar controle de itens processados:', error);
      throw error;
    }
  }

  /**
   * Verifica quais pedidos já foram processados
   * @param {Array} orderIds - Array de IDs dos pedidos para verificar
   * @returns {Object} Resultado da verificação
   */
  async getProcessedOrdersStatus(orderIds) {
    try {
      await this.ensureDataDirectory();
      
      const processedOrdersFile = path.join(this.dataDir, 'processed-orders.json');
      
      if (!fs.existsSync(processedOrdersFile)) {
        return {
          processed: [],
          unprocessed: orderIds,
          totalProcessed: 0,
          totalUnprocessed: orderIds.length
        };
      }
      
      const fileContent = await fs.readFile(processedOrdersFile, 'utf8');
      const data = JSON.parse(fileContent);
      
      const processedSet = new Set(data.processedOrders.map(record => record.orderId));
      
      const processed = orderIds.filter(id => processedSet.has(id));
      const unprocessed = orderIds.filter(id => !processedSet.has(id));
      
      return {
        processed,
        unprocessed,
        totalProcessed: processed.length,
        totalUnprocessed: unprocessed.length
      };
      
    } catch (error) {
      console.error('❌ Erro ao verificar pedidos processados:', error);
      // Em caso de erro, assume que nenhum foi processado (lado seguro)
      return {
        processed: [],
        unprocessed: orderIds,
        totalProcessed: 0,
        totalUnprocessed: orderIds.length,
        error: error.message
      };
    }
  }

  /**
   * Verifica quais itens já foram processados (por uniqueItemId)
   * @param {Array} uniqueItemIds - Array de IDs únicos dos itens para verificar
   * @returns {Object} Resultado da verificação
   */
  async getProcessedItemsStatus(uniqueItemIds) {
    try {
      await this.ensureDataDirectory();
      
      const processedOrdersFile = path.join(this.dataDir, 'processed-orders.json');
      
      if (!fs.existsSync(processedOrdersFile)) {
        return {
          processed: [],
          unprocessed: uniqueItemIds,
          totalProcessed: 0,
          totalUnprocessed: uniqueItemIds.length
        };
      }
      
      const fileContent = await fs.readFile(processedOrdersFile, 'utf8');
      const data = JSON.parse(fileContent);
      
      // Cria Set com uniqueItemIds já processados (compatível com formato antigo)
      const processedSet = new Set(data.processedOrders.map(record => 
        record.uniqueItemId || `${record.orderId}_${record.itemId}`
      ).filter(Boolean));
      
      const processed = uniqueItemIds.filter(id => processedSet.has(id));
      const unprocessed = uniqueItemIds.filter(id => !processedSet.has(id));
      
      return {
        processed,
        unprocessed,
        totalProcessed: processed.length,
        totalUnprocessed: unprocessed.length
      };
      
    } catch (error) {
      console.error('❌ Erro ao verificar itens processados:', error);
      // Em caso de erro, assume que nenhum foi processado (lado seguro)
      return {
        processed: [],
        unprocessed: uniqueItemIds,
        totalProcessed: 0,
        totalUnprocessed: uniqueItemIds.length,
        error: error.message
      };
    }
  }

  /**
   * Carrega pedidos do arquivo JSON
   * @returns {Object} Dados dos pedidos
   */
  async loadOrdersFromFile() {
    try {
      await this.ensureDataDirectory();
      
      if (await fs.pathExists(this.ordersFile)) {
        const data = await fs.readJson(this.ordersFile);
        return {
          success: true,
          data: data.orders || [],
          totalOrders: data.totalOrders || 0,
          timestamp: data.timestamp,
          lastUpdate: data.lastUpdate
        };
      } else {
        return {
          success: false,
          data: [],
          totalOrders: 0,
          message: 'Arquivo de pedidos não encontrado'
        };
      }
    } catch (error) {
      console.error('❌ Erro ao carregar pedidos:', error);
      return {
        success: false,
        data: [],
        totalOrders: 0,
        error: error.message
      };
    }
  }

  /**
   * Transforma dados dos pedidos da VTEX para o formato da Emarsys
   * @param {Array} orders - Array de pedidos da VTEX
   * @param {boolean} checkDuplicates - Se deve verificar duplicatas (padrão: true)
   * @returns {Array} Array com dados no formato da Emarsys
   */
  async transformOrdersForEmarsys(orders, checkDuplicates = true) {
    const emarsysData = [];
    let skippedMarketplace = 0;
    let skippedDuplicates = 0;
    let canceledOrders = 0;
    const skippedOrders = [];
    const processedOrders = [];
    const errorOrders = [];
    
    console.log(`🔄 Iniciando transformação de ${orders.length} pedidos para Emarsys...`);
    
    // Verifica duplicatas se solicitado
    let processedItemIds = new Set();
    if (checkDuplicates) {
      // Cria identificadores únicos para cada item (orderId + item)
      const uniqueItemIds = orders.map(order => `${order.order}_${order.item}`).filter(Boolean);
      const duplicateCheck = await this.getProcessedItemsStatus(uniqueItemIds);
      processedItemIds = new Set(duplicateCheck.processed);
      
      
      if (duplicateCheck.totalProcessed > 0) {
        console.log(`⏭️ Pulando ${duplicateCheck.totalProcessed} itens já processados`);
      }
    }
    
    for (const order of orders) {
      try {
        const orderId = order.order;
        
        // Cria identificador único para o item do pedido (orderId + item)
        const uniqueItemId = `${orderId}_${order.item}`;
        
        // Verifica se já foi processado (controle de duplicatas por item)
        if (checkDuplicates && processedItemIds.has(uniqueItemId)) {
          console.log(`⏭️ Pulando item já processado: ${uniqueItemId}`);
          skippedDuplicates++;
          skippedOrders.push({
            orderId,
            itemId: order.item,
            uniqueItemId,
            reason: 'already_processed',
            originalOrder: order
          });
          continue;
        }
        
        // Valida se o orderId segue o padrão exato: 13 dígitos + "-01"
        const orderIdPattern = /^\d{13}-01$/;
        if (!orderIdPattern.test(orderId)) {
          console.log(`⏭️ Pulando pedido do marketplace: ${orderId}`);
          skippedMarketplace++;
          skippedOrders.push({
            orderId,
            reason: 'marketplace_order_pattern',
            pattern: orderId,
            originalOrder: order
          });
          continue;
        }

        // Validações de campos obrigatórios - com fallbacks
        const email = order.email || order.customer_email || order.clientEmail;
        const item = order.item || order.sku || order.productId || `ITEM_${orderId}`;
        const quantity = order.quantity || order.totalItems || 1;
        const price = order.price || order.totalValue || order.value || '0';
        
        const missingFields = [];
        if (!email) missingFields.push('email');
        if (!item) missingFields.push('item');
        if (!quantity) missingFields.push('quantity');
        if (!price) missingFields.push('price');

        if (missingFields.length > 0) {
          console.warn(`⚠️ Pedido ${orderId} com campos faltando: ${missingFields.join(', ')}`);
          errorOrders.push({
            orderId,
            reason: 'missing_required_fields',
            missingFields,
            originalOrder: order
          });
          
          // Salva log de erro
          await this.saveErrorLog({
            type: 'missing_fields',
            orderId,
            missingFields,
            order: order
          });
        }

        // Verifica se o pedido está cancelado para aplicar valores negativos
        // Inclui status: canceled, payment-pending, refunded, returned
        const canceledStatuses = ['canceled', 'refunded', 'returned'];
        const isCanceled = canceledStatuses.includes(order.order_status) || canceledStatuses.includes(order.status);
        
        // Para pedidos cancelados, aplica valores negativos
        let finalQuantity = quantity;
        let finalPrice = price;
        let discount = order.discount || '0';
        
        if (isCanceled) {
          // Converte para número, aplica negativo e volta para string
          finalQuantity = typeof finalQuantity === 'string' ? `-${Math.abs(parseFloat(finalQuantity))}` : -Math.abs(finalQuantity);
          finalPrice = `-${Math.abs(parseFloat(finalPrice)).toFixed(2)}`;
          discount = parseFloat(discount) === 0 ? '-0.00' : `-${Math.abs(parseFloat(discount)).toFixed(2)}`;
          canceledOrders++;
          
          console.log(`🔄 Pedido cancelado detectado: ${orderId} (status: ${order.order_status || order.status}) - aplicando valores negativos (qty: ${finalQuantity}, price: ${finalPrice}, discount: ${discount})`);
        }
        
        // Cria o registro de venda com os campos mapeados
        const saleRecord = {
          order: orderId,
          item: item,
          email: email,
          quantity: finalQuantity,
          timestamp: order.timestamp || order.creationDate || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
          price: finalPrice,
          s_channel_source: order.s_channel_source || order.marketplace?.name || order.affiliateId || 'web',
          s_store_id: order.s_store_id || 'piccadilly',
          s_sales_channel: order.s_sales_channel || 'ecommerce',
          s_discount: discount
        };

        emarsysData.push(saleRecord);
        processedOrders.push({
          orderId,
          itemId: order.item,
          uniqueItemId,
          status: 'processed'
        });

      } catch (error) {
        console.error(`❌ Erro ao processar pedido ${order.order}:`, error.message);
        errorOrders.push({
          orderId: order.order,
          reason: 'processing_error',
          error: error.message,
          originalOrder: order
        });

        // Salva log de erro
        await this.saveErrorLog({
          type: 'processing_error',
          orderId: order.order,
          error: error.message,
          stack: error.stack,
          order: order
        });
      }
    }

    // Salva estatísticas detalhadas
    const stats = {
      totalInput: orders.length,
      totalProcessed: emarsysData.length,
      skippedMarketplace,
      skippedDuplicates,
      canceledOrders,
      errorCount: errorOrders.length,
      successRate: ((emarsysData.length / orders.length) * 100).toFixed(2) + '%'
    };

    await this.saveSyncStats({
      phase: 'transformation',
      ...stats,
      skippedOrders: skippedOrders.length > 0 ? skippedOrders.slice(0, 10) : [], // Primeiros 10 para não sobrecarregar
      errorOrders: errorOrders.length > 0 ? errorOrders.slice(0, 10) : []
    });

    console.log(`✅ Transformados ${orders.length} pedidos em ${emarsysData.length} registros para Emarsys`);
    console.log(`📊 Estatísticas: ${emarsysData.length} processados, ${skippedMarketplace} pulados (marketplace), ${skippedDuplicates} pulados (duplicatas), ${canceledOrders} cancelados (valores negativos), ${errorOrders.length} com erro`);
    
    if (skippedMarketplace > 0) {
      console.log(`⏭️ ${skippedMarketplace} pedidos do marketplace foram pulados`);
    }
    
    if (skippedDuplicates > 0) {
      console.log(`⏭️ ${skippedDuplicates} pedidos duplicados foram pulados`);
    }
    
    if (canceledOrders > 0) {
      console.log(`🔄 ${canceledOrders} pedidos cancelados processados com valores negativos`);
    }
    
    return {
      emarsysData,
      processedOrders,
      stats: {
        totalInput: orders.length,
        totalProcessed: emarsysData.length,
        skippedMarketplace,
        skippedDuplicates,
        canceledOrders,
        errorCount: errorOrders.length,
        successRate: ((emarsysData.length / orders.length) * 100).toFixed(2) + '%'
      }
    };
  }

  /**
   * Gera arquivo CSV completo para envio à Emarsys
   * @param {Array} orders - Array de pedidos já formatados para CSV
   * @param {Object} options - Opções de configuração (filename, autoSend, etc.)
   * @returns {Object} Resultado da operação
   */
  async generateCsvFromOrders(orders, options = {}) {
    try {
      console.log('📊 Gerando arquivo CSV dos pedidos para Emarsys...');
      
      if (!orders || orders.length === 0) {
        console.warn('⚠️ Nenhum pedido fornecido para gerar CSV');
        return {
          success: false,
          error: 'Nenhum pedido fornecido',
          timestamp: getBrazilianTimestamp()
        };
      }

      // Os dados já vêm no formato da planilha (já transformados)
      console.log(`📊 Processando ${orders.length} registros já formatados para CSV...`);
      
      if (!orders || orders.length === 0) {
        console.warn('⚠️ Nenhum dado fornecido para gerar CSV');
        return {
          success: false,
          error: 'Nenhum dado fornecido para gerar CSV',
          timestamp: getBrazilianTimestamp()
        };
      }

      // Usa os dados diretamente (já estão no formato correto)
      const ordersToProcess = orders;
      console.log(`📊 Processando ${ordersToProcess.length} registros para Emarsys`);

      // Gera nome do arquivo com timestamp
      const timestamp = getBrazilianTimestampForFilename();
      const filename = options.filename || `openflow-piccadilly-orders-data-${timestamp}.csv`;
      
      // Adiciona extensão .csv se não tiver
      if (!filename.endsWith('.csv')) {
        filename += '.csv';
      }

      // Cria o diretório de saída se não existir
      const outputDir = await this.ensureOutputDirectory();

      const filePath = path.join(outputDir, filename);

      const validationResult = this.validateOrderDataForEmarsys(ordersToProcess);
      if (validationResult.errors.length > 0) {
        console.error(`❌ ${validationResult.errors.length} erros de validação encontrados:`);
        console.error('Primeiros 10 erros:', validationResult.errors.slice(0, 10));

        // Salva log dos erros de validação
        await this.saveErrorLog({
          type: 'validation_errors',
          phase: 'csv_generation',
          totalErrors: validationResult.errors.length,
          errors: validationResult.errors.slice(0, 50), // Primeiros 50 erros
          totalOrders: ordersToProcess.length
        });

        // Filtra apenas pedidos válidos
        const validOrders = ordersToProcess.filter((_, index) => {
          const lineNum = index + 2;
          const hasErrors = validationResult.errors.some(error => error.includes(`Linha ${lineNum}:`));
          return !hasErrors;
        });
        
        console.log(`🔄 Filtrando pedidos: ${ordersToProcess.length} -> ${validOrders.length} válidos`);
        
        // Salva estatísticas da validação
        await this.saveSyncStats({
          phase: 'csv_validation',
          totalInput: ordersToProcess.length,
          totalValid: validOrders.length,
          totalInvalid: ordersToProcess.length - validOrders.length,
          validationErrors: validationResult.errors.length,
          successRate: ((validOrders.length / ordersToProcess.length) * 100).toFixed(2) + '%'
        });
        
        if (validOrders.length === 0) {
          console.error('❌ Nenhum pedido válido encontrado após validação. Verifique os dados de origem.');
          console.error('📊 Exemplo de pedido com erro:', ordersToProcess[0]);
          
          // Salva log crítico
          await this.saveErrorLog({
            type: 'critical_error',
            phase: 'csv_validation',
            message: 'Nenhum pedido válido encontrado após validação',
            totalOrders: ordersToProcess.length,
            sampleError: ordersToProcess[0]
          });
          
          throw new Error('Nenhum pedido válido encontrado após validação. Verifique os dados de origem.');
        }
        
        ordersToProcess.length = 0;
        ordersToProcess.push(...validOrders);
      }
      
      if (validationResult.warnings.length > 0) {
        console.warn(`⚠️ ${validationResult.warnings.length} avisos de validação:`, validationResult.warnings.slice(0, 5));
      }

      // Gera o conteúdo CSV
      const csvContent = this.generateEmarsysCsvContent(ordersToProcess);

      // Verifica se o CSV tem conteúdo válido antes de salvar
      const lines = csvContent.split('\n').filter(line => line.trim() !== '');
      console.log(`📊 CSV final: ${lines.length} linhas (incluindo header)`);
      
      // Valida que todas as linhas tenham exatamente 10 colunas
      const invalidLines = [];
      lines.forEach((line, index) => {
        const columns = line.split(',');
        if (columns.length !== 10) {
          invalidLines.push({
            lineNumber: index + 1,
            columns: columns.length,
            content: line.substring(0, 100) + (line.length > 100 ? '...' : '')
          });
        }
      });
      
      let cleanCsvContent;
      
      if (invalidLines.length > 0) {
        console.error(`❌ ${invalidLines.length} linhas com número incorreto de colunas:`);
        invalidLines.slice(0, 5).forEach(invalid => {
          console.error(`   Linha ${invalid.lineNumber}: ${invalid.columns} colunas - ${invalid.content}`);
        });
        
        // Remove linhas inválidas
        const validLines = lines.filter((line, index) => {
          return line.split(',').length === 10;
        });
        console.log(`🔄 Filtradas ${lines.length - validLines.length} linhas inválidas. Restaram ${validLines.length} linhas válidas.`);
        
        // Reconstrói o CSV apenas com linhas válidas
        cleanCsvContent = validLines.join('\n');
      } else {
        // Reconstrói o CSV sem linhas vazias
        cleanCsvContent = lines.join('\n');
      }
      
      // Salva o arquivo com BOM para UTF-8
      const csvWithBom = '\ufeff' + cleanCsvContent;
      await fs.writeFile(filePath, csvWithBom, 'utf8');

      console.log(`✅ Arquivo CSV de pedidos gerado: ${filePath}`);

      const result = {
        success: true,
        filename: filename,
        filePath: filePath,
        fileSize: Buffer.byteLength(csvWithBom, 'utf8'),
        timestamp: getBrazilianTimestamp(),
        totalOrders: ordersToProcess.length,
        originalOrders: orders.length
      };

      // Se autoSend estiver habilitado, envia o CSV e marca como sincronizado
      if (options.autoSend === true) {
        const debugMode = process.env.DEBUG === 'true';
        
        if (debugMode) {
          console.log('🐛 [DEBUG MODE] Enviando CSV em modo DEBUG (sem envio real para Emarsys)...');
        } else {
          console.log('📤 Enviando CSV automaticamente para Emarsys...');
        }
        
        try {
          const emarsysSalesService = require('./emarsysSalesService');
          const sendResult = await emarsysSalesService.sendCsvFileToEmarsys(filename);
          
          if (sendResult.success) {
            if (debugMode) {
              console.log('✅ [DEBUG] Simulação de envio bem-sucedida, marcando pedidos como sincronizados...');
            } else {
              console.log('✅ CSV enviado com sucesso para Emarsys, marcando pedidos como sincronizados...');
            }
            
            // Marca pedidos como sincronizados na emsOrdersV2
            // Usa apenas os pedidos que foram efetivamente processados no CSV
            try {
              const emsOrdersService = require('./emsOrdersService');
              
              // Filtra pedidos de marketplace antes de marcar na emsOrdersV2
              const marketplaceValidator = require('../utils/marketplaceValidator');
              const filteredForSync = ordersToProcess.filter(o => {
                const oid = o.order || o.orderId || o.id || '';
                return !marketplaceValidator.isMarketplaceOrder(oid);
              });

              // Cria array com os pedidos que foram processados no CSV e não são marketplace
              const ordersToMarkAsSynced = filteredForSync.map(order => ({
                id: order.id,
                order: order.order,
                email: order.email,
                item: order.item,
                quantity: order.quantity,
                price: order.price,
                timestamp: order.timestamp
              }));

              const skippedMarketplace = ordersToProcess.length - filteredForSync.length;
              if (skippedMarketplace > 0) {
                console.log(`↪️ ${skippedMarketplace} pedidos de marketplace pulados antes do sync em emsOrdersV2`);
              }
              
              if (ordersToMarkAsSynced.length > 0) {
                await emsOrdersService.markAsSynced(ordersToMarkAsSynced);
                console.log(`✅ ${ordersToMarkAsSynced.length} pedidos marcados como sincronizados na emsOrdersV2`);
              }
            } catch (syncError) {
              console.error('❌ Erro ao marcar pedidos como sincronizados:', syncError.message);
            }
            
            // Deleta o arquivo orders.json após envio bem-sucedido
            try {
              if (fs.existsSync(this.ordersFile)) {
                await fs.unlink(this.ordersFile);
                console.log(`🗑️ Arquivo orders.json deletado após envio bem-sucedido: ${this.ordersFile}`);
                result.ordersFileDeleted = true;
              } else {
                console.log('ℹ️ Arquivo orders.json não encontrado para deletar');
                result.ordersFileDeleted = false;
              }
            } catch (deleteError) {
              console.error('❌ Erro ao deletar arquivo orders.json:', deleteError.message);
              result.ordersFileDeleted = false;
              result.deleteError = deleteError.message;
            }
            
            result.emarsysSent = true;
            result.sendResult = sendResult;
          } else {
            console.error('❌ Falha ao enviar CSV para Emarsys:', sendResult.error);
            result.emarsysSent = false;
            result.sendError = sendResult.error;
          }
        } catch (sendError) {
          console.error('❌ Erro ao enviar CSV para Emarsys:', sendError.message);
          result.emarsysSent = false;
          result.sendError = sendError.message;
        }
      }

      return result;

    } catch (error) {
      console.error('❌ Erro ao gerar CSV de pedidos:', error);
      return {
        success: false,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      };
    }
  }

  /**
   * Valida dados dos pedidos para Emarsys
   * @param {Array} orders - Array de pedidos
   * @returns {Object} Resultado da validação
   */
  validateOrderDataForEmarsys(orders) {
    const errors = [];
    const warnings = [];
    orders.forEach((order, index) => {
      const lineNum = index + 2; // +2 porque linha 1 é header

      // Validações obrigatórias baseadas no schema oficial da Emarsys Smart Insight
      const orderId = order.order;
      if (!orderId) {
        errors.push(`Linha ${lineNum}: order é obrigatório`);
      }

      const itemId = order.item;
      if (!itemId) {
        errors.push(`Linha ${lineNum}: item é obrigatório`);
      }

      const email = order.email;
      if (!email) {
        errors.push(`Linha ${lineNum}: email é obrigatório`);
      } else if (!email.includes('@')) {
        errors.push(`Linha ${lineNum}: email deve ser um email válido`);
      }

      const quantity = order.quantity;
      if (quantity === null || quantity === undefined || isNaN(parseFloat(quantity))) {
        errors.push(`Linha ${lineNum}: quantity deve ser um número válido`);
      }

      const timestamp = order.timestamp;
      if (!timestamp) {
        errors.push(`Linha ${lineNum}: timestamp é obrigatório`);
      } else {
        // Valida se o timestamp é uma data válida
        try {
          const date = new Date(timestamp);
          if (isNaN(date.getTime())) {
            errors.push(`Linha ${lineNum}: timestamp não é uma data válida: ${timestamp}`);
          }
        } catch (error) {
          errors.push(`Linha ${lineNum}: timestamp inválido: ${timestamp}`);
        }
      }

      const price = order.price;
      if (!price || isNaN(parseFloat(price))) {
        errors.push(`Linha ${lineNum}: price deve ser um número válido`);
      }

      
      // Validações específicas do Smart Insight
      // email é o campo obrigatório para identificação do cliente

      // Validação de comprimento dos campos (baseado na documentação oficial da Emarsys)
      const maxLengths = {
        item: 25,
        order: 25,
        s_channel_source: 25,
        s_store_id: 25,
        s_sales_channel: 25,
        s_discount: 25
        // email não tem limite definido na documentação oficial
      };

       Object.entries(maxLengths).forEach(([field, maxLength]) => {
         let value = String(order[field] || '');
         
         if (value.length > maxLength) {
           errors.push(`Linha ${lineNum}: Campo ${field} muito longo (${value.length} caracteres, máximo ${maxLength})`);
         }
       });
    });

    return { errors, warnings };
  }

  /**
   * Gera conteúdo CSV para Emarsys
   * @param {Array} orders - Array de pedidos
   * @returns {string} Conteúdo CSV
   */
  /**
   * Gera conteúdo CSV no formato específico da Emarsys com validação
   * @param {Array} orders - Array de pedidos
   * @returns {string} Conteúdo CSV formatado
   */
  generateEmarsysCsvContent(orders) {
    // Headers baseados no schema oficial da Emarsys Smart Insight
    // IMPORTANTE: A ordem das colunas deve seguir exatamente o schema da Emarsys
    const headers = [
      'order',              // Posição 1 - ID do pedido
      'item',               // Posição 2 - SKU do produto
      'email',              // Posição 3 - Email do cliente (OBRIGATÓRIO)
      'quantity',           // Posição 4 - Quantidade
      'timestamp',          // Posição 5 - Data/hora do pedido
      'price',              // Posição 6 - Preço unitário
      's_channel_source',   // Posição 7 - Canal de origem
      's_store_id',         // Posição 8 - ID da loja
      's_sales_channel',    // Posição 9 - Canal de vendas
      's_discount'          // Posição 10 - Desconto aplicado
    ];

    console.log(`📊 Gerando CSV com ${orders.length} pedidos...`);
    
    // DEDUPLICAÇÃO: Remove duplicatas baseadas em order+item
    const uniqueOrders = new Map();
    let duplicateCount = 0;
    
    for (const order of orders) {
      const uniqueKey = `${order.order}_${order.item}`;
      if (uniqueOrders.has(uniqueKey)) {
        duplicateCount++;
        console.log(`⚠️ Duplicata detectada no CSV: ${uniqueKey} - removendo`);
        continue;
      }
      uniqueOrders.set(uniqueKey, order);
    }
    
    if (duplicateCount > 0) {
      console.log(`🔍 Deduplicação CSV: ${duplicateCount} duplicatas removidas, ${uniqueOrders.size} registros únicos`);
    }
    
    const deduplicatedOrders = Array.from(uniqueOrders.values());
    let csvContent = headers.join(',') + '\n';
    let processedCount = 0;

    for (let i = 0; i < deduplicatedOrders.length; i++) {
      const order = deduplicatedOrders[i];
      
      try {
        // Validação de campos obrigatórios conforme schema da Emarsys
        const requiredFields = ['order', 'item', 'email', 'quantity', 'timestamp', 'price'];
        const missingFields = requiredFields.filter(field => !order[field]);
        
        if (missingFields.length > 0) {
          console.warn(`⚠️ Pedido ${i + 1}/${deduplicatedOrders.length} (${order.order || 'sem ID'}) está faltando campos obrigatórios: ${missingFields.join(', ')}`);
          continue; // Pula pedidos inválidos
        }

        const row = [
          this.sanitizeField(order.order, 25, 'order'),                     // Posição 1 - order
          this.sanitizeField(order.item, 25, 'item'),                       // Posição 2 - item
          this.sanitizeField(order.email, 0, 'email'),                      // Posição 3 - email (sem limite de tamanho)
          this.sanitizeField(order.quantity, 25, 'quantity'),               // Posição 4 - quantity
          this.sanitizeField(order.timestamp, 25, 'timestamp'),             // Posição 5 - timestamp
          this.sanitizeField(order.price, 25, 'price'),                     // Posição 6 - price
          this.sanitizeField(order.s_channel_source || 'web', 25, 's_channel_source'), // Posição 7 - s_channel_source
          this.sanitizeField(order.s_store_id || 'piccadilly', 25, 's_store_id'), // Posição 8 - s_store_id
          this.sanitizeField(order.s_sales_channel || 'ecommerce', 25, 's_sales_channel'), // Posição 9 - s_sales_channel
          this.sanitizeField((order.s_discount ?? order.discount ?? '0'), 25, 's_discount')     // Posição 10 - s_discount
        ];
        
        // Validação adicional para garantir que a linha tem exatamente 10 campos
        if (row.length !== 10) {
          console.error(`❌ Pedido ${i + 1}/${deduplicatedOrders.length} (${order.order}): linha malformada com ${row.length} campos em vez de 10`);
          continue;
        }
        
        // Verifica se algum campo obrigatório ficou vazio após sanitização
        if (!row[0] || !row[1] || !row[2] || !row[3] || !row[4] || !row[5]) {
          console.error(`❌ Pedido ${i + 1}/${deduplicatedOrders.length} (${order.order}): campos obrigatórios vazios após sanitização`);
          continue;
        }
        
        // Adiciona a linha ao CSV
        csvContent += row.join(',') + '\n';
        processedCount++;
        
      } catch (error) {
        console.error(`❌ Erro ao processar pedido ${i + 1}/${deduplicatedOrders.length} (${order.order || 'sem ID'}):`, error.message);
        continue;
      }
    }

    // Remove qualquer linha vazia no final
    csvContent = csvContent.trim();
    
    console.log(`✅ CSV gerado com sucesso: ${processedCount} de ${deduplicatedOrders.length} pedidos únicos processados`);
    
    return csvContent;
  }

  /**
   * Sanitiza campo para CSV removendo caracteres problemáticos
   * @param {*} value - Valor a ser sanitizado
   * @param {number} maxLength - Comprimento máximo (padrão: 100)
   * @returns {string} Valor sanitizado
   */
     sanitizeField(value, maxLength = 25, fieldName = '') {
     if (value === null || value === undefined) return '';
     
     // Tratamento especial para o campo timestamp
     if (fieldName === 'timestamp') {
       try {
         // Converte para Date e formata no padrão ISO 8601 sem milissegundos
         const date = new Date(value);
         if (isNaN(date.getTime())) {
           console.warn(`⚠️ Timestamp inválido: ${value}`);
           return '';
         }
         // Formato: YYYY-MM-DDTHH:MM:SSZ (sem milissegundos)
         return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
       } catch (error) {
         console.warn(`⚠️ Erro ao processar timestamp ${value}:`, error.message);
         return '';
       }
     }
     
     // Converte para string e remove caracteres problemáticos
     let cleanValue = String(value)
       .replace(/"/g, '')           // Remove aspas duplas
       .replace(/\r?\n/g, ' ')      // Remove quebras de linha
       .trim();                     // Remove espaços extras
     
     // Para email, não substitui vírgulas, apenas remove se houver (emails válidos não têm vírgulas)
     if (fieldName === 'email') {
       cleanValue = cleanValue.replace(/,/g, ''); // Remove vírgulas do email
     } else {
       cleanValue = cleanValue.replace(/,/g, ' '); // Substitui vírgulas por espaços em outros campos
     }
     
     // Trunca se necessário (maxLength = 0 significa sem limite, como para email)
     if (maxLength > 0 && cleanValue.length > maxLength) {
       cleanValue = cleanValue.substring(0, maxLength);
     }
     
     return cleanValue;
   }

  /**
   * Gera conteúdo CSV simples para uso por outros serviços
   * @param {Array} order - Array de pedidos
   * @param {Array} headers - Headers personalizados (opcional)
   * @returns {string} Conteúdo CSV
   */


  /**
   * Envia pedidos para Emarsys
   * @param {Array} orders - Array de pedidos
   * @returns {Object} Resultado do envio
   */
  async sendOrdersToEmarsys(orders) {
    try {
      console.log('📤 Iniciando envio de pedidos para Emarsys...');
      
      // Instancia EmarsysSalesService quando necessário
      const emarsysSalesService = require('./emarsysSalesService');
      
      // Testa conexão primeiro
      const connectionTest = await emarsysSalesService.testConnection();
      if (!connectionTest.success) {
        const err = connectionTest.error;
        const normalized = typeof err === 'string' ? err : JSON.stringify(err);
        throw new Error(`Falha na conexão com Emarsys: ${normalized}`);
      }
      
      // Envia apenas pedidos não sincronizados
      const result = await emarsysSalesService.sendUnsyncedOrders(orders);
      
      // Salva informações da sincronização
      await this.saveEmarsysSyncInfo({
        type: 'emarsys_sync',
        result: result,
        totalOrders: orders.length,
        success: result.success
      });

      // Após envio bem-sucedido, marca pedidos como sincronizados na emsOrdersV2
      if (result && result.success) {
        console.log('✅ Envio bem-sucedido, marcando pedidos como sincronizados...');
        
        // Marca pedidos enviados como sincronizados na emsOrdersV2
        // Usa apenas os pedidos que foram efetivamente enviados para Emarsys
        try {
          const emsOrdersService = require('./emsOrdersService');
          
          // Filtra pedidos de marketplace antes de marcar na emsOrdersV2
          const marketplaceValidator = require('../utils/marketplaceValidator');
          const filteredForSync = orders.filter(o => {
            const oid = o.order || o.orderId || o.id || '';
            return !marketplaceValidator.isMarketplaceOrder(oid);
          });

          // Cria array com os pedidos que foram enviados para Emarsys e não são marketplace
          const ordersToMarkAsSynced = filteredForSync.map(order => ({
            id: order.id,
            order: order.order || order.orderId,
            email: order.email,
            item: order.item,
            quantity: order.quantity,
            price: order.price,
            timestamp: order.timestamp
          }));

          const skippedMarketplace = orders.length - filteredForSync.length;
          if (skippedMarketplace > 0) {
            console.log(`↪️ ${skippedMarketplace} pedidos de marketplace pulados antes do sync em emsOrdersV2`);
          }
          
          if (ordersToMarkAsSynced.length > 0) {
            await emsOrdersService.markAsSynced(ordersToMarkAsSynced);
            console.log(`✅ ${ordersToMarkAsSynced.length} pedidos marcados como sincronizados na emsOrdersV2`);
          }
        } catch (syncError) {
          console.error('❌ Erro ao marcar pedidos como sincronizados:', syncError.message);
        }
        
        // Deleta o arquivo orders.json após envio bem-sucedido
        try {
          if (fs.existsSync(this.ordersFile)) {
            await fs.unlink(this.ordersFile);
            console.log(`🗑️ Arquivo orders.json deletado após envio bem-sucedido: ${this.ordersFile}`);
          } else {
            console.log('ℹ️ Arquivo orders.json não encontrado para deletar');
          }
        } catch (deleteError) {
          console.error('❌ Erro ao deletar arquivo orders.json:', deleteError.message);
        }
        
        // Verifica se a limpeza está habilitada via variável de ambiente
        const cleanupEnabled = process.env.ENABLE_ORDER_CLEANUP !== 'false';
        
        if (!cleanupEnabled) {
          console.log('⏸️ Limpeza de orders pausada via ENABLE_ORDER_CLEANUP=false');
        } else {
          console.log('⚠️ ATENÇÃO: Limpeza de orders habilitada. Recomenda-se manter ENABLE_ORDER_CLEANUP=false para preservar histórico.');
          // Captura a referência do axios antes da função assíncrona
          const axiosInstance = axios;
          
          // Executa a limpeza de forma assíncrona sem bloquear o retorno
          setImmediate(async () => {
            try {
              console.log('🧹 Limpando base de orders após envio bem-sucedido para Emarsys...');
            
            const cleanupResponse = await axiosInstance({
              method: 'DELETE',
              url: `${process.env.VTEX_BASE_URL}/_v2/orderss/all`,
              headers: {
                'Content-Type': 'application/json',
                'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
                'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
              },
              data: {
                confirm: 'DELETE_ALL_ORDERS'
              },
              timeout: 60000
            });
            console.log('🧹 Limpeza de orders retornou status:', cleanupResponse);
            if (cleanupResponse.status >= 200 && cleanupResponse.status < 300) {
              console.log('✅ Base de orders limpa com sucesso');
            } else {
              console.warn(`⚠️ Limpeza de orders retornou status inesperado: ${cleanupResponse.status}`);
            }
          } catch (cleanupError) {
            const status = cleanupError?.response?.status;
            if (status === 504) {
              console.log('✅ Operação de limpeza iniciada. 504 indica execução em segundo plano. Verifique os logs.');
            } else {
              console.error('❌ Erro ao limpar base de orders após envio:', cleanupError?.message || cleanupError);
            }
          }
        });
        }
      }
      
      return result;
    } catch (error) {
      console.error('❌ Erro ao enviar pedidos para Emarsys:', error);
      return {
        success: false,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      };
    }
  }

  /**
   * Salva informações da sincronização com Emarsys
   * @param {Object} syncInfo - Informações da sincronização
   */
  async saveEmarsysSyncInfo(syncInfo) {
    try {
      await this.ensureDataDirectory();
      
      const existingData = await fs.pathExists(this.emarsysSyncFile) 
        ? await fs.readJson(this.emarsysSyncFile) 
        : { syncs: [] };
      
      existingData.syncs.push({
        ...syncInfo,
        timestamp: getBrazilianTimestamp()
      });
      
      // Mantém apenas os últimos 10 registros
      if (existingData.syncs.length > 10) {
        existingData.syncs = existingData.syncs.slice(-10);
      }
      
      await fs.writeJson(this.emarsysSyncFile, existingData, { spaces: 2 });
      console.log(`💾 Informações de sincronização Emarsys salvas`);
      
    } catch (error) {
      console.error('❌ Erro ao salvar informações de sincronização Emarsys:', error);
    }
  }

  /**
   * Obtém informações da última sincronização com Emarsys
   * @returns {Object} Informações da última sincronização
   */
  async getLastEmarsysSyncInfo() {
    try {
      await this.ensureDataDirectory();
      
      if (await fs.pathExists(this.emarsysSyncFile)) {
        const data = await fs.readJson(this.emarsysSyncFile);
        const lastSync = data.syncs[data.syncs.length - 1];
        return lastSync || {
          message: 'Nenhuma sincronização com Emarsys encontrada'
        };
      } else {
        return {
          message: 'Nunca foi sincronizado com Emarsys'
        };
      }
    } catch (error) {
      console.error('❌ Erro ao obter informações da última sincronização Emarsys:', error);
      return {
        error: error.message
      };
    }
  }

  /**
   * Obtém informações da última sincronização geral (para controle de períodos)
   * @returns {Object} Informações da última sincronização
   */
  async getLastSyncInfo() {
    try {
      await this.ensureDataDirectory();
      
      // Tenta obter do arquivo de pedidos processados primeiro
      const processedOrdersFile = path.join(this.dataDir, 'processed-orders.json');
      if (fs.existsSync(processedOrdersFile)) {
        const data = await fs.readJson(processedOrdersFile);
        if (data.lastSync) {
          return {
            lastSync: data.lastSync,
            totalProcessedOrders: data.processedOrders ? data.processedOrders.length : 0,
            source: 'processed-orders'
          };
        }
      }
      
      // Fallback para arquivo de orders
      if (await fs.pathExists(this.ordersFile)) {
        const data = await fs.readJson(this.ordersFile);
        return {
          lastSync: data.lastUpdate || data.timestamp,
          totalOrders: data.totalOrders || 0,
          source: 'orders-file'
        };
      }
      
      return {
        message: 'Nenhuma sincronização encontrada'
      };
    } catch (error) {
      console.error('❌ Erro ao obter informações da última sincronização:', error);
      return {
        error: error.message
      };
    }
  }

  /**
   * Limpa registros antigos de pedidos processados (manutenção)
   * @param {number} hoursToKeep - Quantas horas manter (padrão: PROCESSED_ORDERS_RETENTION_HOURS ou 720 = 30 dias)
   * @returns {Object} Resultado da limpeza
   */
  async cleanupProcessedOrders(hoursToKeep = parseInt(process.env.PROCESSED_ORDERS_RETENTION_HOURS) || 720) {
    try {
      await this.ensureDataDirectory();
      
      const processedOrdersFile = path.join(this.dataDir, 'processed-orders.json');
      
      if (!fs.existsSync(processedOrdersFile)) {
        return {
          success: true,
          message: 'Arquivo de pedidos processados não existe',
          removedCount: 0
        };
      }
      
      const data = await fs.readJson(processedOrdersFile);
      
      if (!data.processedOrders || data.processedOrders.length === 0) {
        return {
          success: true,
          message: 'Nenhum registro de pedidos processados encontrado',
          removedCount: 0
        };
      }
      
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - hoursToKeep);
      
      const originalCount = data.processedOrders.length;
      
      // Filtra registros antigos
      data.processedOrders = data.processedOrders.filter(record => {
        const processedDate = new Date(record.processedAt);
        return processedDate >= cutoffDate;
      });
      
      const removedCount = originalCount - data.processedOrders.length;
      
      if (removedCount > 0) {
        // Salva arquivo atualizado
        await fs.writeJson(processedOrdersFile, data, { spaces: 2 });
        const daysToKeep = Math.round(hoursToKeep / 24);
        console.log(`🧹 Limpeza de pedidos processados: ${removedCount} registros removidos (mantidos últimos ${daysToKeep} dias)`);
      }
      
      return {
        success: true,
        removedCount,
        remainingCount: data.processedOrders.length,
        originalCount,
        cutoffDate: cutoffDate.toISOString(),
        message: `${removedCount} registros antigos removidos (mantidos últimos ${Math.round(hoursToKeep / 24)} dias)`
      };
      
    } catch (error) {
      console.error('❌ Erro na limpeza de pedidos processados:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Envia arquivo de dados de vendas para Emarsys via HAPI
   * @param {string} filePath - Caminho do arquivo CSV de vendas
   * @returns {Promise<Object>} Resultado do envio
   */
  async uploadSalesDataFile(filePath) {
    try {
      const path = require('path');
      const absolutePath = path.resolve(filePath);
      
      console.log('📤 Enviando arquivo de dados de vendas para Emarsys via HAPI...');
      console.log(`📁 Caminho completo do arquivo: ${absolutePath}`);
      
      const EmarsysHapiService = require('./emarsysHapiService');
      const emarsysHapi = new EmarsysHapiService();
      
      const result = await emarsysHapi.uploadSalesDataFile(filePath);
      
      if (result.success) {
        console.log('✅ Upload de dados de vendas concluído com sucesso');
        console.log('🎯 RESPOSTA EMARSYS HAPI:');
        console.log('   📊 Status: Sucesso');
        console.log('   📁 Arquivo: ' + absolutePath);
        console.log('   📏 Tamanho: ' + result.fileSize + ' MB');
        console.log('   🌐 URL: ' + result.url);
        console.log('   📝 Mensagem: ' + result.message);
        if (result.data) {
          console.log('   📄 Dados da resposta: ' + JSON.stringify(result.data));
        }
      } else {
        console.error('❌ Erro no upload de dados de vendas:');
        console.error('   📁 Arquivo: ' + absolutePath);
        console.error('   🚨 Erro: ' + result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Erro ao enviar dados de vendas:', error);
      return {
        success: false,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      };
    }
  }

  /**
   * Envia um pedido detalhado para o hook do VTEX Store Framework
   * @param {Object} orderDetail - Pedido detalhado (payload completo)
   * @returns {Promise<Object>} Resposta do hook
   */
  async sendOrderToHook(orderDetail) {
    try {
      // URL completa do VTEX Store Framework para o hook
      const hookUrl = 'https://ems--piccadilly.myvtex.com/_v/order/hook';
      
      // Garante que o orderId esteja presente no payload
      const orderId = orderDetail.orderId || orderDetail.id;
      if (!orderId) {
        console.error('❌ Pedido sem orderId encontrado:', orderDetail);
        return { 
          success: false, 
          error: 'Pedido sem orderId', 
          orderDetail: orderDetail 
        };
      }

      // Verifica se o registro já existe na emsOrdersV2 antes de enviar para o hook
      const emsOrdersService = require('./emsOrdersService');
      
      // Extrai informações do pedido de forma mais robusta
      const orderStatus = orderDetail.status || orderDetail.orderStatus || 'unknown';
      
      // Busca o item de forma mais robusta - prioriza diferentes campos
      let item = null;
      
      // 1. Tenta orderDetail.item primeiro
      if (orderDetail.item) {
        item = orderDetail.item;
      }
      // 2. Tenta items[0] com diferentes campos
      else if (orderDetail.items && Array.isArray(orderDetail.items) && orderDetail.items.length > 0) {
        const firstItem = orderDetail.items[0];
        item = firstItem.id || 
               firstItem.productId || 
               firstItem.refId ||
               firstItem.sku ||
               firstItem.itemId ||
               firstItem.productRefId;
      }
      
      if (!item) {
        console.error('❌ Não foi possível extrair item do pedido:', {
          orderId: orderId,
          hasItem: !!orderDetail.item,
          hasItems: !!orderDetail.items,
          itemsLength: orderDetail.items?.length,
          firstItem: orderDetail.items?.[0]
        });
        return { 
          success: false, 
          error: 'Item não encontrado no pedido', 
          orderDetail: orderDetail 
        };
      }
      
      console.log(`🔍 Buscando item para verificação: ${item} (de orderDetail.item: ${orderDetail.item})`);
      console.log(`🔍 Estrutura do orderDetail:`, {
        hasItem: !!orderDetail.item,
        hasItems: !!orderDetail.items,
        itemsLength: orderDetail.items?.length,
        orderId: orderDetail.orderId || orderDetail.id,
        orderStatus: orderStatus
      });
      
      // ETAPA 1: Verifica se o registro já existe na emsOrdersV2 ANTES de enviar para o hook
      console.log(`🔍 ETAPA 1: Verificando se registro existe na emsOrdersV2: order=${orderId} + item=${item} + status=${orderStatus} + isSync=false`);
      
      const existingRecord = await emsOrdersService.checkExistingRecord(orderId, item, orderStatus);
      
      if (existingRecord) {
        if (existingRecord.isSync === true) {
          console.log(`⏭️ Registro já sincronizado na emsOrdersV2: ${existingRecord.id} (isSync: ${existingRecord.isSync}) - Pulando envio para hook`);
          return { 
            success: true, 
            skipped: true, 
            message: 'Registro já sincronizado',
            existingRecord: existingRecord
          };
        } else {
          console.log(`⏭️ Registro pendente já existe na emsOrdersV2: ${existingRecord.id} (isSync: ${existingRecord.isSync}) - Pulando envio para hook`);
          return { 
            success: true, 
            skipped: true, 
            message: 'Registro pendente já existe na base',
            existingRecord: existingRecord
          };
        }
      }
      
      // ETAPA 2: Se não existe, envia para o hook
      console.log(`📨 ETAPA 2: Registro não existe na base - enviando para hook: order=${orderId} + item=${item}`);
      
      // Cria o payload garantindo que orderId esteja no nível raiz
      const payload = {
        orderId: orderId,
        ...orderDetail
      };
      
      console.log(`📨 Enviando payload para hook com orderId: ${orderId}`);
      
      // Usa axios diretamente com a URL completa e headers VTEX
      const response = await axios.post(hookUrl, payload, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
        },
        timeout: 30000
      });
      
      return { success: true, data: response.data };
    } catch (error) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      const orderId = orderDetail?.orderId || orderDetail?.id || 'sem-id';
      console.error(`❌ Erro ao enviar pedido ${orderId} para hook:`, status || error.message, data || '');
      return { success: false, error: error.message, status, data };
    }
  }

  /**
   * Executa sincronização completa de pedidos (buscar + salvar + gerar CSV)
   * @param {Object} options - Opções de configuração
   * @returns {Object} Resultado da sincronização
   */
  async syncOrders(options = {}) {
    try {
      console.log('🔄 Iniciando sincronização completa de pedidos...');
      const startTime = Date.now();
      
      // 1. Buscar pedidos (com ou sem filtro de data)
      console.log('📦 Buscando pedidos da VTEX...');
      let orders;
      
      if (options.dataInicial && options.dataFinal) {
        console.log(`📅 Buscando pedidos por período: ${options.dataInicial} até ${options.dataFinal}`);
        orders = await this.getAllOrdersInPeriod(options.dataInicial, options.dataFinal, false);
      } else {
        console.log('📦 Buscando todos os pedidos (sem filtro de data)');
        orders = await this.fetchAllOrders();
      }
      
      if (!orders || orders.length === 0) {
        console.log('⚠️ Nenhum pedido encontrado');
        return {
          success: true,
          totalOrders: 0,
          message: 'Nenhum pedido encontrado',
          duration: Date.now() - startTime,
          timestamp: getBrazilianTimestamp()
        };
      }
      
      console.log(`✅ ${orders.length} pedidos encontrados`);
      
      // 2. Salvar pedidos localmente
      console.log('💾 Salvando pedidos...');
      const saveResult = await this.saveOrdersToFile(orders);
      
      if (!saveResult.success) {
        throw new Error(`Falha ao salvar pedidos: ${saveResult.error}`);
      }
      
      // 3. Buscar dados formatados do endpoint /_v/orders/list
      console.log('🔄 Buscando dados formatados do emsOrdersV2');
      let formattedOrders = [];
      let formattedData = null; // Armazena os dados formatados para uso no fallback
      
      try {
        const axios = require('axios');
        const formattedUrl = `${process.env.VTEX_BASE_URL}/_v/orders/list`;
        const response = await axios.get(formattedUrl, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
            'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
          },
          timeout: 30000
        });
        
        console.log('📋 DEBUG - Estrutura da resposta:', {
          status: response?.status,
          hasData: !!response?.data,
          dataType: typeof response?.data,
          isArray: Array.isArray(response?.data),
          dataLength: response?.data?.length,
          dataKeys: response?.data ? Object.keys(response?.data) : 'sem keys'
        });
        
        // O endpoint retorna {success: true, data: [...], pagination: {...}}
        if (response && response.data && response.data.success && Array.isArray(response.data.data)) {
          formattedData = response.data.data; // Armazena para uso no fallback
          
          // Mapeia orderIds da VTEX OMS para comparar com os dados formatados
          const orderIds = orders.map(order => order.orderId || order.id).filter(Boolean);
          console.log('🔍 OrderIds da VTEX OMS para filtro:', orderIds.slice(0, 5));
          
          // Debug: mostra os orderIds dos dados formatados
          const formattedOrderIds = formattedData.map(o => o.order || o.orderId).filter(Boolean);
          console.log('🔍 OrderIds dos dados formatados:', formattedOrderIds.slice(0, 5));
          
          // Verifica se há correspondência
          const matchingIds = orderIds.filter(id => formattedOrderIds.includes(id));
          console.log('🔍 OrderIds que coincidem:', matchingIds.slice(0, 5));
          
          // Filtra os dados formatados que correspondem aos pedidos da VTEX OMS
          formattedOrders = formattedData.filter(o => orderIds.includes(o.order || o.orderId));
          console.log('📋 Dados formatados filtrados:[REGISTROS]', JSON.stringify(formattedOrders.slice(0, 2), null, 2));
        } else {
          console.warn('⚠️ Resposta inesperada do endpoint /_v/orders/list:', response?.data?.data?.length || 'sem data');
          console.log('📋 Resposta completa para debug:', {
            status: response?.status,
            headers: response?.headers,
            data: response?.data
          });
        }
      } catch (error) {
        console.warn('⚠️ Erro ao buscar dados formatados:', error.message);
        console.log('ℹ️ Continuando com dados da VTEX OMS...');
      }

      if (formattedOrders.length === 0) {
        console.warn('⚠️ Nenhum pedido formatado encontrado após filtro, tentando usar dados formatados sem filtro...');
        
        // Se não encontrou correspondência, usa todos os dados formatados disponíveis
        if (formattedData && formattedData.length > 0) {
          console.log('📋 Usando todos os dados formatados disponíveis (sem filtro)');
          formattedOrders = formattedData;
        } else {
          console.warn('⚠️ Nenhum dado formatado disponível, usando dados da VTEX OMS mapeados');
          formattedOrders = orders.map(order => ({
            order: order.orderId || order.id,
            email: order.email,
            item: order.items?.[0]?.id,
            price: order.items?.[0]?.price,
            quantity: order.items?.[0]?.quantity,
            timestamp: order.creationDate,
            s_channel_source: 'web',
            s_store_id: 'piccadilly',
            s_sales_channel: 'ecommerce',
            s_discount: order.discount
          }));
        }
      }

      console.log(`✅ ${formattedOrders.length} pedidos formatados encontrados de ${orders.length} pedidos da VTEX OMS`);

      // 4. Transformar dados formatados para Emarsys
      console.log('🔄 Transformando dados formatados para Emarsys...');
      const transformedOrders = await this.transformOrdersForEmarsys(formattedOrders);
      
      // 4.1. Registros já existem na emsOrdersV2 - apenas controle de isSync será feito após envio
      if (transformedOrders.emarsysData && transformedOrders.emarsysData.length > 0) {
        console.log('ℹ️ Registros já existem na emsOrdersV2 - controle de isSync será feito após envio para Emarsys');
      }
      
      const csvResult = await this.generateCsvFromOrders(transformedOrders.emarsysData, {
        ...options,
        autoSend: true  // Habilita envio automático e marca isSync=true após sucesso
      });
      console.log('📄 Gerando CSV...| 24/08 |', csvResult);
      
      if (!csvResult.success) {
        console.warn('⚠️ Falha ao gerar CSV, mas sincronização continuará');
      }
      
      // 5. O envio para Emarsys já foi feito no generateCsvFromOrders com autoSend: true
      // Não é necessário fazer uma segunda tentativa para evitar duplicidade
      const emarsysSendResult = {
        success: csvResult.emarsysSent || false,
        error: csvResult.sendError || null,
        message: csvResult.emarsysSent ? 'Envio realizado via generateCsvFromOrders' : 'Envio falhou via generateCsvFromOrders'
      };

      const duration = Date.now() - startTime;
      
      // Salva estatísticas finais da sincronização
      const finalStats = {
        phase: 'sync_complete',
        totalOrders: orders.length,
        transformedOrders: transformedOrders.length,
        csvGenerated: csvResult.success,
        emarsysSent: emarsysSendResult.success,
        duration: duration,
        saveSuccess: saveResult.success,
        overallSuccess: true
      };

      await this.saveSyncStats(finalStats);
      
      console.log(`🎉 Sincronização de pedidos concluída em ${duration}ms - mica`);
      console.log(`📊 Resumo final: ${orders.length} pedidos -> ${transformedOrders.length} transformados -> CSV: ${csvResult.success ? 'OK' : 'ERRO'} -> Emarsys: ${emarsysSendResult.success ? 'OK' : 'ERRO'}`);
      
      return {
        success: true,
        totalOrders: orders.length,
        transformedOrders: transformedOrders.length,
        message: 'Sincronização de pedidos concluída com sucesso',
        orders: orders,
        saveResult: saveResult,
        csvResult: csvResult,
        emarsysSendResult: emarsysSendResult,
        duration: duration,
        timestamp: getBrazilianTimestamp()
      };
      
    } catch (error) {
      console.error('❌ Erro na sincronização de pedidos:', error);
      
      // Salva log do erro crítico
      await this.saveErrorLog({
        type: 'sync_critical_error',
        phase: 'sync_orders',
        error: error.message,
        stack: error.stack,
        timestamp: getBrazilianTimestamp()
      });

      return {
        success: false,
        error: error.message,
        totalOrders: 0,
        timestamp: getBrazilianTimestamp()
      };
    }
  }
}

module.exports = VtexOrdersService;
