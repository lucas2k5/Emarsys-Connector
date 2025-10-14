const axios = require('axios');
const rateLimit = require('axios-rate-limit');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
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
      orderBy: options.orderBy || 'creationDate,asc'
    };
    
    // Apenas adiciona f_status se ele for fornecido
    if (options.f_status) {
      params.f_status = options.f_status;
    }
    
    // Log detalhado para debug de datas (com conversão para horário de São Paulo)
    const moment = require('moment-timezone');
    const startSP = moment(startDateISO).tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss');
    const endSP = moment(endDateISO).tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss');
    
    console.log('🔍 DEBUG FILTRO DE DATAS:');
    console.log(`   📅 Data inicial UTC: ${startDateISO} → 🇧🇷 São Paulo: ${startSP}`);
    console.log(`   📅 Data final UTC: ${endDateISO} → 🇧🇷 São Paulo: ${endSP}`);
    console.log(`   🔍 Filtro aplicado: ${params.f_creationDate}`);
    
    console.log('🔍 searchOrdersByPeriod debug:', {
      startDateISO,
      endDateISO,
      page,
      options,
      params
    });
    console.log(`   📄 Página: ${page}`);
    
    try {
      console.log('🔍 Fazendo requisição para VTEX OMS:', { url, params });
      const res = await this.client.get(url, { params });
      
      // Log da resposta para debug
      console.log('🔍 Resposta da VTEX OMS:', {
        status: res.status,
        dataLength: res.data?.list?.length || 0,
        hasData: !!res.data,
        hasList: !!res.data?.list
      });
      
      if (res.data && res.data.list && res.data.list.length > 0) {
        const firstOrder = res.data.list[0];
        const lastOrder = res.data.list[res.data.list.length - 1];
        console.log(`   ✅ ${res.data.list.length} pedidos encontrados`);
        console.log(`   📅 Primeiro pedido: ${firstOrder.orderId} - ${firstOrder.creationDate}`);
        console.log(`   📅 Último pedido: ${lastOrder.orderId} - ${lastOrder.creationDate}`);
      }
      
      return res.data;
    } catch (error) {
      console.error('Erro ao buscar pedidos (OMS):', error?.data || error?.response?.data || error.message);
      console.log('🔍 Erro detalhado:', {
        error: error.message,
        status: error?.response?.status,
        data: error?.response?.data,
        config: error?.config
      });
      throw error;
    }
  }

  /**
   * Busca pedidos da VTEX (método antigo)
   * @param {number} page - Página atual
   * @param {number} pageSize - Tamanho da página
   * @returns {Object} Dados dos pedidos
   */
  async fetchOrders(page = 1, pageSize = 200) {
    try {
      console.log(`🔄 Buscando pedidos da VTEX - Página ${page}`);
      
      console.log('🔍 fetchOrders debug:', {
        page,
        pageSize,
        ordersUrl: this.ordersUrl
      });
      
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
      console.error('❌ Erro ao buscar pedidos da VTEX:', error?.data || error.message);
      throw new Error(`Erro ao buscar pedidos: ${error.message}`);
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
      console.error('❌ Erro ao buscar todos os pedidos da nova base:', error?.data || error.message);
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
      console.error('❌ Erro ao buscar todos os pedidos:', error?.data || error.message);
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
      console.error('❌ Erro ao salvar log de erro:', error?.data || error.message);
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
      console.error('❌ Erro ao salvar estatísticas:', error?.data || error.message);
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
      console.error('❌ Erro ao ler logs de erro:', error?.data || error.message);
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
      console.error('❌ Erro ao ler estatísticas:', error?.data || error.message);
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
      console.error('❌ Erro ao gerar relatório:', error?.data || error.message);
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
   * Busca o status de opt-in do cliente na CL (Customer List) por email
   * @param {string} email - Email do cliente
   * @returns {Promise<boolean|null>} Status de opt-in (true/false) ou null se não encontrado
   */
  async getCLOptInStatus(email) {
    try {
      if (!email) return null;
      
      const baseUrl = (process.env.VTEX_BASE_URL || '').replace(/\/$/, '');
      const url = `${baseUrl}/api/dataentities/CL/search`;
      const params = {
        _where: `email=${encodeURIComponent(email)}`,
        _fields: 'optIn',
        _size: 1
      };
      
      const response = await axios.get(url, { 
        params,
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
          'pragma': 'no-cache',
          'cache-control': 'max-age=0'
        },
        timeout: 20000 
      });
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const optIn = response.data[0].optIn;
        // Normaliza o valor para boolean
        // VTEX CL armazena optIn como string "true"/"false" ou boolean
        if (optIn === true || optIn === 'true' || optIn === '1' || optIn === 1) {
          return true;
        } else if (optIn === false || optIn === 'false' || optIn === '0' || optIn === 0) {
          return false;
        }
      }
      
      return null; // Não encontrado ou valor inválido
    } catch (error) {
      console.warn(`⚠️ Erro ao buscar opt-in da CL para ${email}:`, error.message);
      return null;
    }
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
        
        // Calcula o fim do lote em milissegundos para suportar períodos < 1 dia
        const batchDurationMs = daysPerBatch * 24 * 60 * 60 * 1000;
        batchEnd.setTime(batchEnd.getTime() + batchDurationMs);
        
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
          console.error(`❌ Erro no lote ${batchStartISO} - ${batchEndISO}:`, error?.data || error.message);
          // Continua com o próximo lote mesmo se um falhar
        }
        
        // Avança para o próximo lote (usando milissegundos para suportar períodos < 1 dia)
        currentDate.setTime(currentDate.getTime() + batchDurationMs);
        
        // Pausa entre lotesp
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
      
      console.log('🔍 getAllOrdersInPeriod debug:', {
        startDate,
        toDate,
        useBatching
      });
      

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
            console.error(`❌ Erro na página ${page}:`, error?.data || error.message);
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
      console.log('🔍 ensureDataDirectory debug:', {
        dataDir: this.dataDir,
        exportsDir: this.exportsDir
      });
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
      console.error(`❌ Erro ao criar diretório ${outputDir}:`, error?.data || error.message);
      throw error; // Re-throw para que o erro seja tratado no nível superior
    }
  }

  /**
   * Retorna o caminho do último CSV de pedidos gerado (mais recente)
   * @returns {Promise<string|null>} Caminho do arquivo ou null se não existir
   */
  async getLatestOrdersCsvFile() {
    try {
      const outputDir = await this.ensureOutputDirectory();
      const files = await fs.readdir(outputDir);
      const csvFiles = files
        .filter(f => (f.startsWith('ems-sl-pcdly-') || f.startsWith('emarsys-sales-piccadilly-')) && f.endsWith('.csv'))
        .map(f => path.join(outputDir, f));
      
      
      if (csvFiles.length === 0) return null;
      const filesWithStats = await Promise.all(csvFiles.map(async f => ({ f, stat: await fs.stat(f) })));
      filesWithStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
      return filesWithStats[0].f;
    } catch (error) {
      console.warn('⚠️ Não foi possível obter último CSV:', error.message);
      return null;
    }
  }

  /**
   * Calcula uma assinatura estável do CSV, ignorando BOM, header e ordem das linhas
   * @param {string} csvContent - Conteúdo CSV completo
   * @returns {string} hash sha256
   */
  computeCsvSignature(csvContent) {
    const content = (csvContent || '')
      .replace(/^\ufeff/, '') // remove BOM inicial
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
    if (content.length === 0) return '';
    const header = content[0];
    const rows = content.slice(1); // ignora header
    rows.sort(); // ordem determinística
    const normalized = header + '\n' + rows.join('\n');
    const hash = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
    
    
    return hash;
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
      
      console.log('🔍 getProcessedItemsStatus debug:', {
        uniqueItemIdsLength: uniqueItemIds.length,
        processedOrdersFile,
        fileExists: fs.existsSync(processedOrdersFile)
      });
      
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
    
    console.log(`[PROD-DEBUG] ========================================`);
    console.log(`[PROD-DEBUG] ENTRADA transformOrdersForEmarsys:`);
    console.log(`[PROD-DEBUG] - orders.length: ${orders?.length || 0}`);
    console.log(`[PROD-DEBUG] - orders é array: ${Array.isArray(orders)}`);
    console.log(`[PROD-DEBUG] - checkDuplicates: ${checkDuplicates}`);
    if (orders && orders.length > 0) {
      console.log(`[PROD-DEBUG] - Primeiro pedido (amostra):`, JSON.stringify(orders[0]).substring(0, 300));
    }
    console.log(`[PROD-DEBUG] ========================================`);
    
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
        console.error(`❌ Erro ao processar pedido ${order.order}:`, error?.data || error.message);
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

      // Gera nome do arquivo com timestamp e período
      let timestamp;
      let period = options.period;
      
      // Se não foi fornecido período, tenta gerar baseado nas datas
      if (!options.period && options.startDate && options.endDate) {
        try {
          const startTime = new Date(options.startDate).toLocaleTimeString('pt-BR', { 
            timeZone: 'America/Sao_Paulo', 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
          }).replace(':', '-');
          const endTime = new Date(options.endDate).toLocaleTimeString('pt-BR', { 
            timeZone: 'America/Sao_Paulo', 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
          }).replace(':', '-');
          period = `${startTime}-${endTime}`;
        } catch (error) {
          console.warn('⚠️ Erro ao gerar período das datas, usando padrão:', error.message);
        }
      }
      
      // Gera timestamp baseado na data da consulta ou data atual
      if (options.brazilianDate) {
        try {
          // Usa a data brasileira original da consulta
          const brazilianDate = options.brazilianDate; // Ex: "2025-09-22"
          const currentTime = new Date().toLocaleTimeString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }).replace(/:/g, '-');
          
          timestamp = `${brazilianDate}T${currentTime}`;
        } catch (error) {
          console.warn('⚠️ Erro ao gerar timestamp da data brasileira, usando data atual:', error.message);
          timestamp = getBrazilianTimestampForFilename();
        }
      } else if (options.startDate) {
        try {
          const consultDate = new Date(options.startDate);
          const brazilianTime = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }).formatToParts(consultDate);
          
          const parts = {};
          brazilianTime.forEach(part => {
            parts[part.type] = part.value;
          });
          
          timestamp = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}-${parts.minute}-${parts.second}`;
        } catch (error) {
          console.warn('⚠️ Erro ao gerar timestamp da data da consulta, usando data atual:', error.message);
          timestamp = getBrazilianTimestampForFilename();
        }
      } else {
        timestamp = getBrazilianTimestampForFilename();
      }
      
      // Sanitiza o período para ser válido em nomes de arquivo
      const sanitizedPeriod = period.replace(/[<>:"/\\|?*]/g, '-');
      
      // Formato resumido: ems-sl-pcdly-{data}-{periodo}.csv
      const filename = options.filename || `ems-sl-pcdly-${timestamp}-${sanitizedPeriod}.csv`;
      
      // Adiciona extensão .csv se não tiver
      if (!filename.endsWith('.csv')) {
        filename += '.csv';
      }
      
      console.log('📁 Nome do arquivo gerado:', filename);
      console.log('📁 Período original:', period);
      console.log('📁 Período sanitizado:', sanitizedPeriod);
      console.log('📁 Timestamp usado:', timestamp);

      // Cria o diretório de saída se não existir
      const outputDir = await this.ensureOutputDirectory();

      const filePath = path.join(outputDir, filename);
      console.log('📁 Caminho completo do arquivo:', filePath);
      console.log('📁 Diretório existe?', await fs.access(outputDir).then(() => true).catch(() => false));

      const validationResult = this.validateOrderDataForEmarsys(ordersToProcess);
      if (validationResult.errors.length > 0) {
        console.error(`❌ ${validationResult.errors.length} erros de validação encontrados:`);
        console.error('Primeiros 10 erros:', validationResult.errors.slice(0, 10));

        // Salva log dos erros de validação
        await this.saveErrorLog({
          type: 'validation_errors',
          phase: 'csv_generation',
          totalErrors: validationResult.errors.length,
          errors: validationResult.errors.slice(0, 70), // Primeiros 50 erros
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
      console.log(`🔍 Gerando CSV para ${ordersToProcess.length} pedidos...`);
      const csvContent = this.generateEmarsysCsvContent(ordersToProcess);
      console.log(`🔍 CSV gerado com ${csvContent.length} caracteres`);
      
      
      // Comparação com o último CSV: se o conteúdo for idêntico (ignorando ordem), não gerar novo
      try {
        console.log(`🔍 Verificando último CSV...`);
        const lastCsvPath = await this.getLatestOrdersCsvFile();
        if (lastCsvPath) {
          console.log(`🔍 Último CSV encontrado: ${path.basename(lastCsvPath)}`);
          
          // Verifica se o último CSV é do mesmo período
          const lastCsvFilename = path.basename(lastCsvPath);
          const currentFilename = filename;
          
          console.log(`🔍 Comparando arquivos:`, {
            lastCsv: lastCsvFilename,
            currentCsv: currentFilename,
            samePeriod: lastCsvFilename.includes(period) && currentFilename.includes(period)
          });
          
          // Só compara se for do mesmo período
          if (lastCsvFilename.includes(period) && currentFilename.includes(period)) {
            const lastCsvContent = await fs.readFile(lastCsvPath, 'utf8');
            const lastSig = this.computeCsvSignature(lastCsvContent);
            const newSig = this.computeCsvSignature(csvContent);
            
            console.log(`🔍 Comparando assinaturas do mesmo período:`, {
              lastSig: lastSig?.substring(0, 8) + '...',
              newSig: newSig?.substring(0, 8) + '...',
              areEqual: lastSig === newSig
            });
            
            if (lastSig && newSig && lastSig === newSig) {
              const { logHelpers } = require('../utils/logger');
              
              logHelpers.logOrders('info', '⏭️ [CSV] CSV idêntico ao anterior - não será criado', {
                reason: 'same_as_last_csv',
                lastFile: path.basename(lastCsvPath),
                expectedFilename: filename,
                totalOrders: ordersToProcess.length,
                csvSignature: lastSig.substring(0, 16)
              });
              
              console.log('⏭️ CSV idêntico ao último gerado. Pulando criação de novo arquivo.');
              return {
                success: true,
                skipped: true,
                reason: 'same_as_last_csv',
                lastFilePath: lastCsvPath,
                totalOrders: ordersToProcess.length,
                timestamp: getBrazilianTimestamp()
              };
            } else {
              console.log(`🔍 CSVs diferentes - gerando novo arquivo`);
            }
          } else {
            console.log(`🔍 Período diferente - gerando novo arquivo`);
          }
        }
      } catch (cmpErr) {
        console.warn('⚠️ Falha na comparação com último CSV, prosseguindo com geração:', cmpErr.message);
      }

      // Verifica se o CSV tem conteúdo válido antes de salvar
      const lines = csvContent.split('\n').filter(line => line.trim() !== '');
      console.log(`📊 CSV final: ${lines.length} linhas (incluindo header)`);
      console.log(`🔍 CSV content preview: ${csvContent.substring(0, 200)}...`);
      
      if (lines.length <= 1) {
        const { logHelpers } = require('../utils/logger');
        
        logHelpers.logOrders('warn', '⚠️ [CSV] CSV vazio - não será criado arquivo', {
          reason: 'CSV vazio ou apenas header',
          totalOrders: ordersToProcess.length,
          csvLines: lines.length,
          expectedFilename: filename
        });
        
        console.log('⚠️ CSV vazio ou apenas header - não gerando arquivo');
        return {
          success: false,
          error: 'CSV vazio ou apenas header',
          totalOrders: ordersToProcess.length,
          timestamp: getBrazilianTimestamp()
        };
      }
      
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
      
      console.log(`🔍 Salvando arquivo CSV: ${filePath}`);
      console.log(`🔍 Tamanho do arquivo: ${csvWithBom.length} caracteres`);
      
      // Declara variáveis no escopo mais amplo para uso posterior
      let externalLogResult = null;
      let currentBrazilianDate = null;
      let totalUniqueOrders = 0;
      
      try {
        const { logHelpers } = require('../utils/logger');
        
        logHelpers.logOrders('info', '💾 [CSV] Iniciando gravação do arquivo CSV', {
          filename,
          filePath,
          fileSize: `${csvWithBom.length} caracteres`,
          totalOrders: ordersToProcess.length,
          csvLines: lines.length
        });
        
        await fs.writeFile(filePath, csvWithBom, 'utf8');
        
        // Verifica se o arquivo foi realmente criado
        const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
        const fileStats = fileExists ? await fs.stat(filePath) : null;
        
        if (fileExists && fileStats) {
          logHelpers.logOrders('info', '✅ [CSV] Arquivo criado com sucesso', {
            filename,
            filePath,
            fileSize: `${fileStats.size} bytes`,
            totalOrders: ordersToProcess.length,
            csvLines: lines.length,
            createdAt: fileStats.birthtime
          });
          
          console.log(`✅ Arquivo CSV de pedidos gerado: ${filePath}`);
        } else {
          logHelpers.logOrders('error', '❌ [CSV] Arquivo não foi criado', {
            filename,
            filePath,
            expectedSize: csvWithBom.length
          });
          throw new Error('Arquivo CSV não foi criado após writeFile');
        }
        
        // Envia dados para API externa de logs
        
        try {
          // Extrai a data/hora do período a partir do filename
          // Formato: ems-sl-pcdly-2025-09-02T00-01-00-00-01-05-00.csv
          const filenameParts = filename.match(/ems-sl-pcdly-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
          let periodDateTime;
          
          if (filenameParts && filenameParts[1]) {
            // Converte o formato do filename (2025-09-02T00-01-00) para o formato da API (2025-09-02T00:01:00)
            periodDateTime = filenameParts[1].replace(/-(\d{2})-(\d{2})$/, ':$1:$2').replace(/T(\d{2})-(\d{2})/, 'T$1:$2');
          } else {
            // Fallback para data atual se não conseguir extrair
            const { getBrazilianTimestamp } = require('../utils/dateUtils');
            periodDateTime = getBrazilianTimestamp();
          }
          
          currentBrazilianDate = periodDateTime; // Data/hora do período sendo processado
          
          // Conta pedidos únicos (não itens)
          const uniqueOrders = new Set(ordersToProcess.map(o => o.order));
          totalUniqueOrders = uniqueOrders.size;
          
          externalLogResult = await this.sendToExternalLogApi({
            period: filename,
            data: periodDateTime, // Data/hora do período solicitado
            status: 'pending',
            qtdy_items: lines.length - 1, // Total de linhas de dados (excluindo header)
            qtdy_orders: totalUniqueOrders // Total de pedidos únicos
          });
          console.log('📤 Resultado do envio para API externa:', externalLogResult);
        } catch (externalLogError) {
          console.error('❌ Erro ao enviar para API externa:', externalLogError.message);
        }
        
      } catch (writeError) {
        const { logHelpers } = require('../utils/logger');
        const dirExists = await fs.access(path.dirname(filePath)).then(() => true).catch(() => false);
        
        logHelpers.logOrders('error', '❌ [CSV] Falha ao criar arquivo CSV', {
          filename,
          filePath,
          errorMessage: writeError.message,
          errorCode: writeError.code,
          errorStack: writeError.stack,
          directoryExists: dirExists,
          parentDirectory: path.dirname(filePath)
        });
        
        console.error('❌ Erro ao escrever arquivo CSV:', writeError);
        console.error('📁 Caminho do arquivo:', filePath);
        console.error('📁 Diretório pai existe?', dirExists);
        throw writeError;
      }

      const result = {
        success: true,
        filename: filename,
        filePath: filePath,
        fileSize: Buffer.byteLength(csvWithBom, 'utf8'),
        timestamp: getBrazilianTimestamp(),
        totalOrders: ordersToProcess.length,
        originalOrders: orders.length,
        batchDocumentId: externalLogResult?.documentId || null
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
            
            // Valida se o arquivo CSV realmente existe antes de atualizar o lote
            const csvFileExists = await fs.access(filePath).then(() => true).catch(() => false);
            console.log(`🔍 Validando existência do arquivo CSV: ${csvFileExists ? '✅ Existe' : '❌ Não existe'}`);
            
            if (!csvFileExists) {
              console.error(`❌ ERRO CRÍTICO: Arquivo CSV não existe em: ${filePath}`);
              result.batchStatusUpdated = false;
              result.batchStatusError = 'Arquivo CSV não existe';
              result.fileValidationFailed = true;
            } else {
              // Atualiza status do lote para 'done' (mesmo em modo DEBUG)
              if (result.batchDocumentId && externalLogResult) {
                try {
                  console.log(`📝 Atualizando status do lote para 'done'...`);
                  
                  const updateResult = await this.updateBatchStatus(result.batchDocumentId, 'done');
                  if (updateResult.success) {
                    console.log(`✅ Status do lote atualizado com sucesso`);
                    result.batchStatusUpdated = true;
                  } else {
                    console.warn(`⚠️ Falha ao atualizar status do lote: ${updateResult.error}`);
                    result.batchStatusUpdated = false;
                    result.batchStatusError = updateResult.error;
                  }
                } catch (updateError) {
                  console.error(`❌ Erro ao atualizar status do lote:`, updateError.message);
                  result.batchStatusUpdated = false;
                  result.batchStatusError = updateError.message;
                }
              } else {
                console.warn('⚠️ DocumentId do lote não disponível - pulando atualização de status');
                result.batchStatusUpdated = false;
                result.batchStatusError = 'DocumentId não disponível';
              }
            }
            
            // Marca pedidos como sincronizados na emsOrdersV2
            try {
              console.log('📝 Marcando pedidos como sincronizados na emsOrdersV2...');
              console.log(`📊 Total de ${ordersToProcess.length} itens no CSV para marcar como sincronizados`);
              
              if (ordersToProcess.length > 0) {
                const axios = require('axios');
                
                let syncedCount = 0;
                let errorCount = 0;
                let notFoundCount = 0;
                
                // Para cada item do CSV, busca o registro e atualiza
                for (let i = 0; i < ordersToProcess.length; i++) {
                  const csvItem = ordersToProcess[i];
                  
                  try {
                    // 1. Busca o registro existente usando order + item + order_status
                    const filterUrl = `https://ems--piccadilly.myvtex.com/_v/orders/filter`;
                    const filterParams = {
                      order: csvItem.order,
                      item: csvItem.item
                    };
                    
                    const filterResponse = await axios.get(filterUrl, {
                      params: filterParams,
                      headers: {
                        'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
                        'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
                        'Accept': 'application/json'
                      },
                      timeout: 30000
                    });
                    
                    // 2. Se encontrou o registro, atualiza usando o ID
                    if (filterResponse.data?.success && filterResponse.data?.data?.length > 0) {
                      const existingRecord = filterResponse.data.data[0];
                      const recordId = existingRecord.id;
                      
                      console.log(`🔍 Registro encontrado: ${csvItem.order}-${csvItem.item} (ID: ${recordId})`);
                      
                      // Atualiza usando o ID do registro
                      const syncUrl = `https://ems--piccadilly.myvtex.com/_v/orders/${recordId}/sync`;
                      
                      await axios.patch(syncUrl, 
                        { isSync: true },
                        {
                          headers: {
                            'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
                            'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
                            'Content-Type': 'application/json'
                          },
                          timeout: 30000
                        }
                      );
                      
                      syncedCount++;
                      console.log(`✅ Registro ${recordId} (${csvItem.order}-${csvItem.item}) marcado como sincronizado (${i + 1}/${ordersToProcess.length})`);
                    } else {
                      notFoundCount++;
                      console.warn(`⚠️ Registro não encontrado: ${csvItem.order}-${csvItem.item}`);
                    }
                    
                  } catch (syncErr) {
                    errorCount++;
                    console.error(`❌ Erro ao processar ${csvItem.order}-${csvItem.item}:`, syncErr.response?.data || syncErr.message);
                  }
                  
                  // Pausa entre requisições para não sobrecarregar
                  if (i < ordersToProcess.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                  }
                }
                
                console.log(`✅ Sincronização concluída: ${syncedCount} atualizados, ${notFoundCount} não encontrados, ${errorCount} erros de ${ordersToProcess.length} itens`);
                
                result.syncedOrders = syncedCount;
                result.syncErrors = errorCount;
                result.syncNotFound = notFoundCount;
              } else {
                console.log('ℹ️ Nenhum item no CSV para marcar como sincronizado');
                result.syncedOrders = 0;
                result.syncErrors = 0;
              }
            } catch (syncError) {
              console.error('❌ Erro ao marcar pedidos como sincronizados:', syncError.message);
              result.syncError = syncError.message;
            }
            
            // Em modo DEBUG, não deleta o arquivo orders.json para facilitar análise
            if (debugMode) {
              console.log('🐛 [DEBUG MODE] Mantendo arquivo orders.json para análise');
              result.ordersFileDeleted = false;
              result.ordersFileKept = true;
            } else {
              // Deleta o arquivo orders.json após envio bem-sucedido (apenas em produção)
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
            }
            
            result.emarsysSent = true;
            result.sendResult = sendResult;
          } else {
            console.error('❌ Falha ao enviar CSV para Emarsys:', sendResult.error);
            result.emarsysSent = false;
            result.sendError = sendResult.error;
            
            // Atualiza status do lote para 'error' em caso de falha
            // (não valida existência do arquivo pois o erro pode ser justamente a falta dele)
            if (result.batchDocumentId && externalLogResult) {
              try {
                console.log(`📝 Atualizando status do lote para 'error'...`);
                
                await this.updateBatchStatus(result.batchDocumentId, 'error');
              } catch (updateError) {
                console.error(`❌ Erro ao atualizar status do lote:`, updateError.message);
              }
            }
          }
        } catch (sendError) {
          console.error('❌ Erro ao enviar CSV para Emarsys:', sendError.message);
          result.emarsysSent = false;
          result.sendError = sendError.message;
          
          // Atualiza status do lote para 'error' em caso de exceção
          // (não valida existência do arquivo pois o erro pode ser justamente a falta dele)
          if (result.batchDocumentId && externalLogResult) {
            try {
              console.log(`📝 Atualizando status do lote para 'error'...`);
              
              await this.updateBatchStatus(result.batchDocumentId, 'error');
            } catch (updateError) {
              console.error(`❌ Erro ao atualizar status do lote:`, updateError.message);
            }
          }
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
        console.error(`❌ Erro ao processar pedido ${i + 1}/${deduplicatedOrders.length} (${order.order || 'sem ID'}):`, error?.data || error.message);
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
          
          // Filtra pedidos de marketplace antes de marcar na emsOrdersV2
          const marketplaceValidator = require('../utils/marketplaceValidator');
          const filteredForSync = orders.filter(o => {
            const oid = o.order;
            return !marketplaceValidator.isMarketplaceOrder(oid);
          });

          
         

          const skippedMarketplace = orders.length - filteredForSync.length;
          if (skippedMarketplace > 0) {
            console.log(`↪️ ${skippedMarketplace} pedidos de marketplace pulados antes do sync em emsOrdersV2`);
          }
          
          
        } catch (syncError) {
          console.error('❌ Erro ao marcar pedidos como sincronizados:', syncError.message);
        }
        
        // Em modo DEBUG, não deleta o arquivo orders.json para facilitar análise
        const debugMode = process.env.DEBUG === 'true';
        if (debugMode) {
          console.log('🐛 [DEBUG MODE] Mantendo arquivo orders.json para análise');
        } else {
          // Deleta o arquivo orders.json após envio bem-sucedido (apenas em produção)
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
        }
        
        // Verifica se a limpeza está habilitada via variável de ambiente
        const cleanupEnabled = process.env.ENABLE_ORDER_CLEANUP !== 'false';
        
        if (!cleanupEnabled) {
          console.log('⏸️ Limpeza de orders pausada via ENABLE_ORDER_CLEANUP=false');
        } else {
          console.log('⚠️ ATENÇÃO: Limpeza de orders habilitada. Recomenda-se manter ENABLE_ORDER_CLEANUP=false para preservar histórico.');
          
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
      
      if (result.success && result.data) {
        console.log('✅ Upload de dados de vendas concluído com sucesso');
        console.log('🎯 RESPOSTA EMARSYS HAPI:');
        console.log('   📊 Status: Sucesso');
        console.log('   📁 Arquivo: ' + absolutePath);
        console.log('   📏 Tamanho: ' + result.fileSize + ' MB');
        console.log('   🌐 URL: ' + result.url);
        console.log('   📝 Mensagem: ' + result.message);
        console.log('   📄 Dados da resposta: ' + JSON.stringify(result.data));
      }
      
      return result;
    } catch (error) {

      console.error('❌ Erro ao enviar dados de vendas:', error.message);
      console.error('   📁 Arquivo: ' + absolutePath);
      console.error('   🚨 Erro: ' + result.error);

      return {
        success: false,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      };
    }
  }

  /**
   * Envia um pedido para o hook do VTEX Store Framework
   * @param {string} orderId - ID do pedido
   * @returns {Promise<Object>} Resposta do hook
   */
  async sendOrderToHook(orderId) {
    try {
      // URL do hook existente no VTEX Store Framework
      const hookUrl = 'https://ems--piccadilly.myvtex.com/_v/order/hook';
      const axios = require('axios');
      
      if (!orderId) {
        console.error('❌ Pedido sem orderId fornecido');
        return { 
          success: false, 
          error: 'Pedido sem orderId' 
        };
      }

      const orderDetail = await this.getOrderById(orderId);
      
      if (!orderDetail) {
        console.error(`❌ Não foi possível obter detalhes do pedido ${orderId}`);
        return { 
          success: false, 
          error: 'Detalhes do pedido não encontrados' 
        };
      }

      
      // Cria o payload garantindo que orderId esteja no nível raiz
      const payload = {
        orderId: orderId,
        ...orderDetail
      };
      
      console.log(`📨 [${orderId}] Enviando payload para hook com orderId: ${orderId}`);
      
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
      const safeOrderId = orderId || 'sem-id';
      console.error(`❌ Erro ao enviar pedido ${safeOrderId} para hook:`, error?.data || status || error.message, data || '');
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
      
      let orders;
      
      // Se pedidos já foram fornecidos, usa eles em vez de buscar novamente
      if (options.orders && Array.isArray(options.orders)) {
        console.log(`📦 Usando ${options.orders.length} pedidos já fornecidos`);
        orders = options.orders;
      } else if (options.dataInicial && options.dataFinal) {
        console.log(`📅 Buscando pedidos por período: ${options.dataInicial} até ${options.dataFinal}`);
        orders = await this.getAllOrdersInPeriod(options.dataInicial, options.dataFinal, false);
      } else {
        console.log('📦 sem horário definido na consulta');
        orders = [];
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
      
      const saveResult = await this.saveOrdersToFile(orders);
      
      if (!saveResult.success) {
        throw new Error(`Falha ao salvar pedidos: ${saveResult.error}`);
      }
      
      // 3. Buscar dados formatados do endpoint /_v/orders/filter
      console.log('🔄 Buscando dados formatados do emsOrdersV2');
      let formattedOrders = [];
      
      try {
        const axios = require('axios');
        
        // Extrai os orderIds para filtrar apenas os pedidos do período
        const orderIds = orders.map(order => order.orderId || order.id).filter(Boolean);
        console.log(`🔍 Buscando ${orderIds.length} pedidos formatados do emsOrdersV2...`);
        
        // Busca pedidos em lotes usando o endpoint /_v/orders/filter
        const BATCH_SIZE = 50; // Busca em lotes de 50 para não sobrecarregar
        const formattedUrl = `${process.env.VTEX_BASE_URL}/_v/orders/filter`;
        
        console.log(`[PROD-DEBUG] URL base do emsOrdersV2: ${formattedUrl}`);
        console.log(`[PROD-DEBUG] Total de pedidos a buscar: ${orderIds.length}`);
        console.log(`[PROD-DEBUG] Primeiros 5 orderIds:`, orderIds.slice(0, 5));
        
        for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
          const batchIds = orderIds.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(orderIds.length / BATCH_SIZE);
          
          console.log(`📦 Buscando lote ${batchNum}/${totalBatches} (${batchIds.length} pedidos)...`);
          
          // Busca cada pedido do lote
          let batchItemsFound = 0;
          let batchErrors = 0;
          let batchEmptyResponses = 0;
          
          for (const orderId of batchIds) {
            try {
              const requestUrl = `${formattedUrl}?order=${orderId}`;
              console.log(`[PROD-DEBUG] Consultando: ${requestUrl}`);
              
              const response = await axios.get(formattedUrl, {
                params: {
                  order: orderId
                },
                headers: {
                  'Accept': 'application/json',
                  'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
                  'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
                },
                timeout: 30000
              });
              
              console.log(`[PROD-DEBUG] Response status para ${orderId}: ${response.status}`);
              console.log(`[PROD-DEBUG] Response data.success: ${response?.data?.success}`);
              console.log(`[PROD-DEBUG] Response data.data type: ${Array.isArray(response?.data?.data) ? 'array' : typeof response?.data?.data}`);
              console.log(`[PROD-DEBUG] Response data.data length: ${response?.data?.data?.length || 0}`);
              
              // O endpoint retorna {success: true, data: [...]}
              if (response?.data?.success && Array.isArray(response.data.data)) {
                const itemsCount = response.data.data.length;
                if (itemsCount > 0) {
                  // Log do primeiro item como amostra
                  console.log(`[PROD-DEBUG] Primeiro item do pedido ${orderId}:`, JSON.stringify(response.data.data[0]).substring(0, 200));
                  formattedOrders.push(...response.data.data);
                  batchItemsFound += itemsCount;
                } else {
                  console.log(`[PROD-DEBUG] ⚠️ Pedido ${orderId} retornou array vazio`);
                  batchEmptyResponses++;
                }
              } else {
                console.warn(`[PROD-DEBUG] ⚠️ Resposta inesperada do endpoint para ${orderId}:`, {
                  status: response?.status,
                  success: response?.data?.success,
                  hasData: !!response?.data?.data,
                  isArray: Array.isArray(response?.data?.data),
                  dataLength: response?.data?.data?.length,
                  fullResponse: JSON.stringify(response?.data).substring(0, 300)
                });
                batchEmptyResponses++;
              }
            } catch (orderError) {
              console.error(`[PROD-DEBUG] ❌ Erro ao buscar pedido ${orderId}:`, {
                message: orderError.message,
                status: orderError.response?.status,
                statusText: orderError.response?.statusText,
                responseData: orderError.response?.data ? JSON.stringify(orderError.response.data).substring(0, 200) : 'N/A',
                url: `${formattedUrl}?order=${orderId}`
              });
              batchErrors++;
            }
            
            // Pequena pausa entre requisições para não sobrecarregar
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          console.log(`[PROD-DEBUG] Resumo do lote ${batchNum}: ${batchItemsFound} itens encontrados, ${batchEmptyResponses} vazios, ${batchErrors} erros`);
        }
        
        console.log(`✅ ${formattedOrders.length} itens encontrados em ${orderIds.length} pedidos do emsOrdersV2`);
        console.log(`[PROD-DEBUG] formattedOrders.length: ${formattedOrders.length}, é array: ${Array.isArray(formattedOrders)}`);
        
        // Filtro adicional: verifica se o pedido está no período especificado
        if (options.dataInicial && options.dataFinal && formattedOrders.length > 0) {
          const startDate = new Date(options.dataInicial);
          const endDate = new Date(options.dataFinal);
          
          console.log(`[PROD-DEBUG] Aplicando filtro de período: ${options.dataInicial} até ${options.dataFinal}`);
          const beforeFilter = formattedOrders.length;
          formattedOrders = formattedOrders.filter(o => {
            const orderDate = new Date(o.timestamp || o.creationDate || o.date);
            return orderDate >= startDate && orderDate <= endDate;
          });
          
          console.log(`🔍 Filtro por período: ${beforeFilter} -> ${formattedOrders.length} itens`);
        }
        
      } catch (formattedError) {
        console.error('[PROD-DEBUG] ❌ Erro CRÍTICO ao buscar dados formatados:', {
          message: formattedError.message,
          status: formattedError.response?.status,
          statusText: formattedError.response?.statusText,
          responseData: formattedError.response?.data,
          stack: formattedError.stack
        });
      }
      
      console.log(`[PROD-DEBUG] ========================================`);
      console.log(`[PROD-DEBUG] RESULTADO FINAL DA BUSCA emsOrdersV2:`);
      console.log(`[PROD-DEBUG] - Pedidos da VTEX OMS: ${orders.length}`);
      console.log(`[PROD-DEBUG] - Itens formatados encontrados: ${formattedOrders.length}`);
      console.log(`[PROD-DEBUG] - Tipo de formattedOrders: ${Array.isArray(formattedOrders) ? 'array' : typeof formattedOrders}`);
      console.log(`[PROD-DEBUG] ========================================`);

      console.log(`✅ ${formattedOrders.length} pedidos formatados encontrados de ${orders.length} pedidos da VTEX OMS`);

     
      const transformedOrders = await this.transformOrdersForEmarsys(formattedOrders);
      
      // 4.1. Registros já existem na emsOrdersV2 - apenas controle de isSync será feito após envio
      if (transformedOrders.emarsysData && transformedOrders.emarsysData.length > 0) {
        console.log('ℹ️ Registros já existem na emsOrdersV2 - controle de isSync será feito após envio para Emarsys');
      }
      
      const csvResult = await this.generateCsvFromOrders(transformedOrders.emarsysData, {
        ...options,
        autoSend: true, 
        startDate: options.dataInicial,
        endDate: options.dataFinal
      });
      console.log('📄 Gerando CSV...| 24/08 |', csvResult);
      
      if (!csvResult.success) {
        console.warn('⚠️ Falha ao gerar CSV, mas sincronização continuará');
      }
      
      const emarsysSendResult = {
        success: csvResult.emarsysSent || csvResult.skipped || false,
        error: csvResult.sendError || null,
        message: csvResult.emarsysSent ? 'Envio realizado' : (csvResult.skipped ? 'CSV pulado (idêntico)' : 'Envio falhou ao enviar')
      };

      const duration = Date.now() - startTime;
      
      // Salva estatísticas finais da sincronização
      const finalStats = {
        phase: 'sync_complete',
        totalOrders: orders.length,
        transformedOrders: transformedOrders.emarsysData?.length || 0,
        csvGenerated: csvResult.success,
        emarsysSent: emarsysSendResult.success,
        duration: duration,
        saveSuccess: saveResult.success,
        overallSuccess: true
      };

      await this.saveSyncStats(finalStats);
      
      console.log(`📊 Resumo final: ${orders.length} pedidos -> ${transformedOrders.emarsysData?.length || 0} transformados -> CSV: ${csvResult.success ? 'OK' : 'ERRO'} -> Emarsys: ${emarsysSendResult.success ? 'OK' : 'ERRO'}`);
      
      return {
        success: true,
        totalOrders: orders.length,
        transformedOrders: transformedOrders.emarsysData?.length || 0,
        message: 'Sincronização de pedidos concluída com sucesso',
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

  /**
   * Verifica se já existe um lote para o período especificado
   * @param {string} period - Nome do período (ex: "emarsys-sales-piccadilly-2025-09-02T00-01-00-2025-09-02T05-00-00")
   * @returns {Promise<Object>} Resultado da verificação { exists: boolean, batch: object|null }
   */
  async checkBatchExists(period) {
    try {
      const fs = require('fs-extra');
      const path = require('path');
      const axios = require('axios');
      const { normalizeVtexBaseUrl } = require('../utils/urlUtils');
      
      console.log(`🔍 Verificando se lote já existe: ${period}`);
      
      // Verifica localmente se o arquivo CSV já existe
      const outputDir = await this.ensureOutputDirectory();
      const expectedFilePath = path.join(outputDir, period);
      
      const fileExists = await fs.pathExists(expectedFilePath);
      
      if (fileExists) {
        console.log(`✅ Lote já existe localmente: ${period}`);
        const stats = await fs.stat(expectedFilePath);
        return {
          exists: true,
          batch: {
            period,
            filePath: expectedFilePath,
            createdAt: stats.birthtime,
            size: stats.size
          }
        };
      }
      
      // Se não existe localmente, verifica na API externa
      try {
        const vtexBaseUrl = normalizeVtexBaseUrl(process.env.VTEX_BASE_URL);
        const url = `${vtexBaseUrl}/_v/order-batches/check`;
        
        const response = await axios.post(url, { period }, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        if (response.data?.exists) {
          console.log(`✅ Lote já existe na API externa:`, response.data.batch);
          return {
            exists: true,
            batch: response.data.batch
          };
        }
      } catch (apiError) {
        console.warn('⚠️ Erro ao verificar lote na API externa (continuando verificação local):', apiError.message);
      }
      
      console.log(`✅ Lote não existe, pode prosseguir`);
      return {
        exists: false,
        batch: null
      };
      
    } catch (error) {
      console.error('❌ Erro ao verificar lote:', error.message);
      // Em caso de erro, retorna como não existe para não bloquear o fluxo
      return {
        exists: false,
        batch: null,
        error: error.message
      };
    }
  }

  /**
   * Envia dados para API externa de logs
   * @param {Object} data - Dados para enviar
   * @returns {Promise<Object>} Resultado do envio
   */
  async sendToExternalLogApi(data) {
    try {
      const axios = require('axios');
      const { normalizeVtexBaseUrl } = require('../utils/urlUtils');
      const vtexBaseUrl = normalizeVtexBaseUrl(process.env.VTEX_BASE_URL);
      const url = `${vtexBaseUrl}/_v/order-batches/create`;
      
      console.log('📤 Enviando dados para API externa de logs:', data);
      console.log('📤 URL da API:', url);
      
      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 segundos de timeout
      });
      
      console.log('✅ Dados enviados com sucesso para API externa:', response.status);
      console.log('✅ Resposta da API:', response.data);
      
      // Log local após salvar na entidade externa
      const { ordersLogger } = require('../utils/logger');
      ordersLogger.info('✅ Log externo salvo com sucesso', {
        type: 'external_log_saved',
        apiUrl: url,
        data: data,
        responseStatus: response.status,
        timestamp: getBrazilianTimestamp()
      });
      
      return {
        success: true,
        status: response.status,
        data: response.data,
        documentId: response.data?.data?.DocumentId || response.data?.DocumentId
      };
      
    } catch (error) {
      console.error('❌ Erro ao enviar dados para API externa:', error.message);
      
      // Log do erro
      const { ordersLogger } = require('../utils/logger');
      ordersLogger.error('❌ Erro ao salvar log externo', {
        type: 'external_log_error',
        error: error.message,
        data: data,
        timestamp: getBrazilianTimestamp()
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Atualiza o status do lote após envio para Emarsys
   * @param {string} documentId - ID do documento do lote
   * @param {string} status - Novo status ('done', 'error', etc.)
   * @returns {Promise<Object>} Resultado da atualização
   */
  async updateBatchStatus(documentId, status = 'done') {
    try {
      const axios = require('axios');
      const { normalizeVtexBaseUrl } = require('../utils/urlUtils');
      const vtexBaseUrl = normalizeVtexBaseUrl(process.env.VTEX_BASE_URL);
      const url = `${vtexBaseUrl}/_v/order-batches/${documentId}/status`;
      
      // Payload simplificado conforme API espera
      const updateData = {
        status: status
      };
      
      console.log(`📝 Atualizando status do lote ${documentId} para '${status}'...`);
      console.log('📤 URL da API:', url);
      console.log('📤 Payload:', updateData);
      
      const response = await axios.post(url, updateData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log(`✅ Status do lote ${documentId} atualizado com sucesso para '${status}'`);
      
      // Log local
      const { ordersLogger } = require('../utils/logger');
      ordersLogger.info('✅ Status do lote atualizado', {
        type: 'batch_status_updated',
        documentId: documentId,
        status: status,
        batchData: updateData,
        timestamp: getBrazilianTimestamp()
      });
      
      return {
        success: true,
        status: response.status,
        data: response.data
      };
      
    } catch (error) {
      console.error(`❌ Erro ao atualizar status do lote ${documentId}:`, error.message);
      
      // Log do erro
      const { ordersLogger } = require('../utils/logger');
      ordersLogger.error('❌ Erro ao atualizar status do lote', {
        type: 'batch_status_update_error',
        documentId: documentId,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = VtexOrdersService;
