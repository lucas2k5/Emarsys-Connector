const axios = require('axios');
const rateLimit = require('axios-rate-limit');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs-extra');
const { getDatabase } = require('../database/sqlite');
const { getBrazilianTimestamp, getBrazilianTimestampForFilename } = require('../utils/dateUtils');
require('dotenv').config();

/**
 * Serviço otimizado para sincronização de pedidos
 * Consolida funcionalidades de busca VTEX, armazenamento SQLite e geração de CSV
 */
class OrdersSyncService {
  constructor() {
    // Configuração do cliente VTEX
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
    
    this.client = rateLimit(axios.create({
      baseURL: baseURL,
      headers
    }), { maxRequests: 3900, perMilliseconds: 1000 });
    
    this._initializeAxiosRetry();
    
    // Configuração de diretórios
    const defaultExports = path.join(__dirname, '..', 'exports');
    this.exportsDir = process.env.EXPORTS_DIR || defaultExports;
    this.dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
    this.ordersFile = path.join(this.dataDir, 'orders.json');
    this.errorLogFile = path.join(this.dataDir, 'sync-errors.json');
    
    // Inicializar banco de dados
    this.db = null;
  }

  /**
   * Inicializa retry automático para requisições
   */
  _initializeAxiosRetry() {
    try {
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
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, config.retryCount) * 1000));
            return this.client.request(config);
          }
          
          return Promise.reject(error);
        }
      );
    } catch (error) {
      console.error('Failed to initialize retry:', error);
    }
  }

  /**
   * Inicializa o banco de dados SQLite
   */
  async initDatabase() {
    if (!this.db) {
      this.db = getDatabase();
      await this.db.init();
    }
    return this.db;
  }

  /**
   * Busca pedidos por período (OMS) usando query params
   * @param {string} startDateISO - Data inicial em ISO UTC
   * @param {string} endDateISO - Data final em ISO UTC
   * @param {number} page - Número da página (1-based)
   * @param {Object} options - Parâmetros adicionais
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
    
    if (options.f_status) {
      params.f_status = options.f_status;
    }
    
    // Log detalhado para debug de datas (com conversão para horário de São Paulo)
    const moment = require('moment-timezone');
    const startSP = moment(startDateISO).tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss');
    const endSP = moment(endDateISO).tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss');
    
    console.log('🔍 [OrdersSyncService] DEBUG FILTRO DE DATAS:');
    console.log(`   📅 Data inicial UTC: ${startDateISO} → 🇧🇷 São Paulo: ${startSP}`);
    console.log(`   📅 Data final UTC: ${endDateISO} → 🇧🇷 São Paulo: ${endSP}`);
    console.log(`   🔍 Filtro aplicado: ${params.f_creationDate}`);
    console.log('🔍 [OrdersSyncService] searchOrdersByPeriod debug:', {
      startDateISO,
      endDateISO,
      page,
      options,
      params
    });
    console.log(`   📄 Página: ${page}`);
    
    try {
      console.log('🔍 [OrdersSyncService] Fazendo requisição para VTEX OMS:', { url, params });
      const res = await this.client.get(url, { params });
      
      // Log da resposta para debug
      console.log('🔍 [OrdersSyncService] Resposta da VTEX OMS:', {
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
      } else {
        console.log('   ⚠️ Nenhum pedido encontrado na resposta da VTEX');
      }
      
      return res.data;
    } catch (error) {
      console.error('❌ [OrdersSyncService] Erro ao buscar pedidos (OMS):', error?.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Busca todos os pedidos em um período com paginação automática
   * @param {string} startDate - Data inicial
   * @param {string} toDate - Data final
   * @param {boolean} useBatching - Se deve usar busca em lotes
   * @returns {Promise<Array>} Array com todos os pedidos
   */
  async getAllOrdersInPeriod(startDate, toDate, useBatching = false) {
    if (useBatching) {
      return this.getAllOrdersInPeriodBatched(startDate, toDate);
    }
    
    try {
      console.log(`🔄 Buscando pedidos de ${startDate} até ${toDate}...`);
      
      let allOrders = [];
      let page = 1;
      let hasMorePages = true;
      const MAX_PAGES = 30;
      const PER_PAGE = 100;

      while (hasMorePages && page <= MAX_PAGES) {
        try {
          const orderFeed = await this.searchOrdersByPeriod(startDate, toDate, page, {
            per_page: PER_PAGE,
            orderBy: 'creationDate,asc'
          });
          
          if (orderFeed && orderFeed.list) {
            allOrders = allOrders.concat(orderFeed.list);
            console.log(`✅ Página ${page}: ${orderFeed.list.length} pedidos encontrados`);
            
            if (orderFeed.paging && orderFeed.paging.pages) {
              const totalPages = orderFeed.paging.pages;
              const currentPage = orderFeed.paging.currentPage || page;
              hasMorePages = currentPage < totalPages && page < MAX_PAGES;
              page++;
            } else {
              hasMorePages = false;
            }
          } else {
            hasMorePages = false;
          }

        } catch (error) {
          if (error?.response?.data?.error?.message?.includes('Max page exceed')) {
            console.warn(`⚠️ Limite de páginas da VTEX atingido na página ${page}`);
            hasMorePages = false;
          } else {
            throw error;
          }
        }

        if (hasMorePages) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`🎉 Busca concluída! Total de ${allOrders.length} pedidos encontrados`);
      return allOrders;
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos no período:', error);
      throw error;
    }
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
      
      const start = new Date(startDate);
      const end = new Date(toDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error(`Datas inválidas: ${startDate} até ${toDate}`);
      }
      
      let allOrders = [];
      let currentDate = new Date(start);
      
      while (currentDate <= end) {
        const batchStart = new Date(currentDate);
        const batchEnd = new Date(currentDate);
        
        const batchDurationMs = daysPerBatch * 24 * 60 * 60 * 1000;
        batchEnd.setTime(batchEnd.getTime() + batchDurationMs);
        
        if (batchEnd > end) {
          batchEnd.setTime(end.getTime());
        }
        
        const batchStartISO = batchStart.toISOString();
        const batchEndISO = batchEnd.toISOString();
        
        console.log(`📦 Lote: ${batchStartISO} até ${batchEndISO}`);
        
        try {
          const batchOrders = await this.getAllOrdersInPeriod(batchStartISO, batchEndISO);
          allOrders = allOrders.concat(batchOrders);
          console.log(`✅ Lote concluído: ${batchOrders.length} pedidos`);
        } catch (error) {
          console.error(`❌ Erro no lote ${batchStartISO} - ${batchEndISO}:`, error?.message);
        }
        
        currentDate.setTime(currentDate.getTime() + batchDurationMs);
        
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
   * Obtém detalhes de um pedido específico
   * @param {string} orderId - ID do pedido
   * @returns {Promise<Object>} Detalhes do pedido
   */
  async getOrderById(orderId) {
    const url = `/api/oms/pvt/orders/${orderId}`;
    return this.client.get(url)
      .then(res => res.data)
      .catch(function (error) {
        console.error(`Erro ao obter pedido ${orderId}:`, error);
        throw error;
      });
  }

  /**
   * Formata CPF com pontos e traço (ex: 43926321806 -> 439.263.218-06)
   * @param {string} cpf - CPF sem formatação
   * @returns {string} CPF formatado
   */
  formatCPF(cpf) {
    const cleanCPF = cpf.replace(/\D+/g, '');
    if (cleanCPF.length !== 11) {
      return cpf; // Retorna original se não for CPF válido
    }
    return `${cleanCPF.slice(0, 3)}.${cleanCPF.slice(3, 6)}.${cleanCPF.slice(6, 9)}-${cleanCPF.slice(9, 11)}`;
  }

  /**
   * Busca email do cliente na CL (Customer List) via CPF/documento
   * Tenta primeiro sem formatação, depois com formatação (pontos e traço)
   * @param {string} document - CPF/documento do cliente
   * @returns {Promise<Object|null>} Dados do cliente com email ou null
   */
  async getCustomerEmailByDocument(document) {
    try {
      if (!document) {
        console.log('⚠️ Documento vazio para buscar email na CL');
        return null;
      }

      // Limpar e formatar documento (remover caracteres especiais)
      const cleanDocument = document.replace(/\D+/g, '');
      if (cleanDocument.length < 11) {
        console.log('⚠️ Documento inválido (muito curto):', document);
        return null;
      }

      const baseUrl = process.env.VTEX_BASE_URL || 'https://piccadilly.myvtex.com';
      const url = `${baseUrl}/api/dataentities/CL/search`;
      
      const headers = {
        'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
        'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
        'Accept': 'application/vnd.vtex.ds.v10+json'
      };

      // Função auxiliar para fazer a busca
      const searchByDocument = async (docToSearch) => {
        const params = {
          _where: `document=${docToSearch}`,
          _fields: 'email,id,document,gender,isNewsletterOptIn',
          _size: 1
        };

        const response = await axios.get(url, {
          params,
          headers,
          timeout: 10000
        });

        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          const customer = response.data[0];
          const email = customer.email;
          
          if (email && email.includes('@') && !email.includes('@ct.vtex.com.br')) {
            return {
              id: customer.id,
              email: email,
              document: customer.document,
              gender: customer.gender || '',
              isNewsletterOptIn: customer.isNewsletterOptIn
            };
          }
        }
        return null;
      };

      // Primeira tentativa: buscar sem formatação
      console.log(`🔍 Buscando email na CL via CPF: ${cleanDocument}`);
      let result = await searchByDocument(cleanDocument);

      if (result) {
        console.log(`✅ Email encontrado na CL via CPF: ${result.email} (ID: ${result.id})`);
        return result;
      }

      // Segunda tentativa: buscar com formatação (pontos e traço)
      if (cleanDocument.length === 11) {
        const formattedDocument = this.formatCPF(cleanDocument);
        console.log(`🔍 Buscando email na CL via CPF formatado: ${formattedDocument}`);
        result = await searchByDocument(formattedDocument);

        if (result) {
          console.log(`✅ Email encontrado na CL via CPF formatado: ${result.email} (ID: ${result.id})`);
          return result;
        }
      }

      console.log(`❌ Nenhum registro encontrado na CL para CPF: ${cleanDocument} (tentativas: sem formatação e com formatação)`);
      return null;

    } catch (error) {
      if (error?.response?.status === 404) {
        console.log(`❌ Cliente não encontrado na CL para CPF: ${document}`);
        return null;
      }
      console.error(`❌ Erro ao buscar email na CL via CPF ${document}:`, error.message);
      return null;
    }
  }

  /**
   * Calcula desconto individual de um item usando priceTags
   * @param {Object} item - Item do pedido
   * @returns {string} Valor do desconto formatado
   */
  calculateItemDiscount(item) {
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

  transformOrderToSQLite(order, email = null) {
    const formattedOrders = [];
    const orderId = order.orderId || order.id;
    if (!orderId) return formattedOrders;
    
    // Usa o email fornecido (que vem da consulta por CPF) ou tenta extrair do pedido
    let finalEmail = email;
    if (!finalEmail) {
      finalEmail = order.clientProfileData?.email || order.customerEmail || null;
      // Validar se não é hash ou email inválido
      if (finalEmail && (finalEmail.includes('@ct.vtex.com.br') || !finalEmail.includes('@') || finalEmail.includes('@piccadilly.com.br'))) {
        finalEmail = null; // Descartar email hash ou inválido
      }
    }
    
    if (order.items && Array.isArray(order.items) && order.items.length > 0) {
      // Processar cada item individualmente
      for (const item of order.items) {
        // Prioriza refId, que é o identificador correto do item
        // Se não tiver refId, tenta id, sku ou productId como fallback
        const itemId = item.refId;
        
        // Se ainda não tiver itemId válido, pula este item
        if (!itemId || itemId === orderId) {
          console.warn(`⚠️ Pedido ${orderId}: item sem refId válido, pulando item:`, item);
          continue;
        }
        
        // Usar preço correto: price (preço de venda com desconto) ao invés de listPrice
        let itemPrice = item.price || item.sellingPrice || item.priceDefinition?.calculatedSellingPrice || 0;
        const itemListPrice = item.listPrice || item.price || 0;
        
        // Converter de centavos para reais se necessário (VTEX geralmente retorna em centavos)
        // Se o preço for muito grande (>1000) ou muito pequeno (<1), provavelmente está em centavos
        if (itemPrice > 1000 || (itemPrice > 0 && itemPrice < 1 && itemPrice !== 0)) {
          itemPrice = itemPrice / 100;
        }
        
        // Calcular desconto individual do item
        const itemDiscount = this.calculateItemDiscount(item);
        
        formattedOrders.push({
          order: orderId,
          item: itemId,
          email: finalEmail,
          quantity: item.quantity,
          price: itemPrice.toFixed(2),
          timestamp: order.creationDate,
          isSync: false,
          order_status: order.status || order.orderStatus || null,
          s_channel_source: order.salesChannel || order.channel || 'web',
          s_store_id: 'piccadilly',
          s_sales_channel: order.salesChannel || 'ecommerce',
          s_discount: itemDiscount // Desconto individual calculado do item
        });
      }
    } else {
      // Se não há itens, não criar registro placeholder com orderId como item
      // Isso causa problemas depois. Melhor não salvar nada se não tiver itens válidos
      console.warn(`⚠️ Pedido ${orderId}: sem itens válidos, não será salvo no banco`);
    }
    
    return formattedOrders;
  }

  /**
   * Salva pedidos da VTEX no SQLite
   * Busca detalhes completos de cada pedido para garantir refId correto
   * @param {Array} orders - Array de pedidos da VTEX
   * @returns {Promise<Object>} Resultado da operação
   */
  async saveOrdersToSQLite(orders) {
    try {
      await this.initDatabase();
      
      const formattedOrders = [];
      
      // Buscar detalhes completos de cada pedido (similar ao sendOrderToHook)
      for (const order of orders) {
        const orderId = order.orderId;
        if (!orderId) continue;
        
        try {
          // Busca detalhes completos do pedido para garantir que temos refId correto
          const orderDetail = await this.getOrderById(orderId);
          
          if (!orderDetail) {
            console.warn(`⚠️ Não foi possível obter detalhes do pedido ${orderId}`);
            // Fallback: tenta usar o pedido original mesmo sem detalhes
            const transformed = this.transformOrderToSQLite(order);
            formattedOrders.push(...transformed);
            continue;
          }
          
          // Buscar email via CPF se não tiver email válido no pedido
          let email = null;
          
          // Tenta obter email do pedido diretamente
          if (orderDetail?.clientProfileData?.email || orderDetail?.customerEmail) {
            const orderEmail = orderDetail.clientProfileData?.email || orderDetail.customerEmail;
            // Validar se não é email hash ou inválido
            if (orderEmail && orderEmail.includes('@') && !orderEmail.includes('@ct.vtex.com.br') && !orderEmail.includes('@piccadilly.com.br') && orderEmail !== 'piccadilly@piccadilly.com.br') {
              email = orderEmail;
            }
          }
          
          // Se não encontrou email válido, buscar via CPF na CL
          if (!email && orderDetail?.clientProfileData?.document) {
            const document = orderDetail.clientProfileData.document;
            console.log(`🔍 Buscando email na CL via CPF para pedido ${orderId}: ${document}`);
            const customerData = await this.getCustomerEmailByDocument(document);
            if (customerData && customerData.email) {
              email = customerData.email;
              console.log(`✅ Email encontrado na CL via CPF para pedido ${orderId}: ${email}`);
            }
          }
          
          // Transforma usando os detalhes completos do pedido e o email encontrado
          const transformed = this.transformOrderToSQLite(orderDetail, email);
          formattedOrders.push(...transformed);
          
          // Rate limit para não sobrecarregar a API
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`❌ Erro ao buscar detalhes do pedido ${orderId}:`, error.message);
          // Fallback: tenta usar o pedido original mesmo sem detalhes
          try {
            const transformed = this.transformOrderToSQLite(order);
            formattedOrders.push(...transformed);
          } catch (fallbackError) {
            console.error(`❌ Erro ao processar pedido ${orderId} (fallback):`, fallbackError.message);
          }
        }
      }
      
      if (formattedOrders.length > 0) {
        const result = this.db.insertBatch(formattedOrders);
        return {
          success: true,
          inserted: result.inserted || 0,
          updated: result.updated || 0,
          total: formattedOrders.length
        };
      }
      
      return { success: true, inserted: 0, updated: 0, total: 0 };
    } catch (error) {
      console.error('❌ Erro ao salvar pedidos no SQLite:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca pedidos pendentes de sincronização do SQLite
   * @param {Object} options - Opções de filtro (startDate, endDate)
   * @returns {Promise<Array>} Array de pedidos pendentes
   */
  async getPendingSyncOrders(options = {}) {
    try {
      await this.initDatabase();
      
      // SEMPRE usar listPendingSync para garantir que apenas pedidos pendentes (isSync = 0) sejam retornados
      // Mesmo se período for especificado, filtra por isSync = 0
      return this.db.listPendingSync(options);
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos pendentes:', error);
      return [];
    }
  }

  /**
   * Marca pedidos como sincronizados no SQLite
   * @param {Array} orders - Array de objetos {order, item}
   * @returns {Promise<Object>} Resultado da operação
   */
  async markOrdersAsSynced(orders) {
    try {
      await this.initDatabase();
      
      let syncedCount = 0;
      let errorCount = 0;
      
      for (const orderItem of orders) {
        try {
          const result = this.db.markOrderAsSynced(orderItem.order, orderItem.item);
          if (result.success && result.updated) {
            syncedCount++;
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ Erro ao marcar ${orderItem.order}-${orderItem.item}:`, error.message);
        }
      }
      
      return {
        success: true,
        synced: syncedCount,
        errors: errorCount,
        total: orders.length
      };
    } catch (error) {
      console.error('❌ Erro ao marcar pedidos como sincronizados:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Transforma dados dos pedidos para o formato da Emarsys (versão idêntica ao vtexOrdersService)
   * @param {Array} orders - Array de pedidos da VTEX
   * @param {boolean} checkDuplicates - Se deve verificar duplicatas (padrão: true)
   * @returns {Promise<Object>} Array com dados no formato da Emarsys
   */
  async transformOrdersForEmarsysNew(orders, checkDuplicates = true) {
    const emarsysData = [];
    let skippedMarketplace = 0;
    let skippedDuplicates = 0;
    let canceledOrders = 0;
    const skippedOrders = [];
    const processedOrders = [];
    const errorOrders = [];
    
    console.log(`[PROD-DEBUG] ========================================`);
    console.log(`[PROD-DEBUG] ENTRADA transformOrdersForEmarsysNew:`);
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
      // Para ordersSyncService, usa verificação de duplicatas via SQLite
      await this.initDatabase();
      const allOrders = this.db.listAllOrders({ limit: 10000 });
      const syncedOrders = allOrders
        .filter(o => o.isSync === true || o.isSync === 1)
        .map(o => `${o.order}_${o.item}`);
      processedItemIds = new Set(syncedOrders);
      
      if (processedItemIds.size > 0) {
        console.log(`⏭️ Pulando ${processedItemIds.size} itens já processados`);
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
          
          // Salva log de erro (se método existir)
          if (this.saveErrorLog) {
            await this.saveErrorLog({
              type: 'missing_fields',
              orderId,
              missingFields,
              order: order
            });
          }
        }

        // Verifica se o pedido está cancelado para aplicar valores negativos
        // Inclui status: canceled, payment-pending, refunded, returned
        const canceledStatuses = ['canceled', 'refunded', 'returned'];
        const isCanceled = canceledStatuses.includes(order.order_status) || canceledStatuses.includes(order.status);
        
        // Para pedidos cancelados, aplica valores negativos
        let finalQuantity = quantity;
        let finalPrice = price;
        // Usa s_discount do SQLite (campo correto), com fallback para discount
        let discount = order.s_discount || order.discount || '0';
        
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

        // Salva log de erro (se método existir)
        if (this.saveErrorLog) {
          await this.saveErrorLog({
            type: 'processing_error',
            orderId: order.order,
            error: error.message,
            stack: error.stack,
            order: order
          });
        }
      }
    }

    // Salva estatísticas detalhadas (se método existir)
    const stats = {
      totalInput: orders.length,
      totalProcessed: emarsysData.length,
      skippedMarketplace,
      skippedDuplicates,
      canceledOrders,
      errorCount: errorOrders.length,
      successRate: ((emarsysData.length / orders.length) * 100).toFixed(2) + '%'
    };

    if (this.saveSyncStats) {
      await this.saveSyncStats({
        phase: 'transformation',
        ...stats,
        skippedOrders: skippedOrders.length > 0 ? skippedOrders.slice(0, 10) : [], // Primeiros 10 para não sobrecarregar
        errorOrders: errorOrders.length > 0 ? errorOrders.slice(0, 10) : []
      });
    }

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
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Resultado da operação
   */
  async generateCsvFromOrders(orders, options = {}) {
    try {
      console.log('📊 Gerando arquivo CSV dos pedidos para Emarsys...');
      
      if (!orders || orders.length === 0) {
        return {
          success: false,
          error: 'Nenhum pedido fornecido',
          timestamp: getBrazilianTimestamp()
        };
      }

      // Gera nome do arquivo seguindo o padrão: ems-sl-pcdly-YYYY-MM-DDTHH-MM-SS-default.csv
      let timestamp = getBrazilianTimestampForFilename();
      let period = options.period || 'default';
      
      // Se brazilianDate foi fornecido, usa ele com o horário atual
      if (options.brazilianDate) {
        const brazilianDate = options.brazilianDate;
        // Obtém horário atual no fuso de Brasília
        const now = new Date();
        const brazilianTime = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }).formatToParts(now);
        
        const parts = {};
        brazilianTime.forEach(part => {
          parts[part.type] = part.value;
        });
        
        // Formata como HH-MM-SS
        const currentTime = `${parts.hour}-${parts.minute}-${parts.second}`;
        timestamp = `${brazilianDate}T${currentTime}`;
      }
      
      // Sempre usa 'default' como período se não especificado
      const sanitizedPeriod = (period || 'default').replace(/[<>:"/\\|?*]/g, '-');
      
      // Padrão: ems-sl-pcdly-YYYY-MM-DDTHH-MM-SS-default.csv
      let filename = options.filename || `ems-sl-pcdly-${timestamp}-${sanitizedPeriod}.csv`;
      if (!filename.endsWith('.csv')) {
        filename += '.csv';
      }

      // Cria diretório de saída
      await fs.ensureDir(this.exportsDir);
      const filePath = path.join(this.exportsDir, filename);

      // Valida dados
      const validationResult = this.validateOrderDataForEmarsys(orders);
      if (validationResult.errors.length > 0) {
        console.error(`❌ ${validationResult.errors.length} erros de validação encontrados`);
        const validOrders = orders.filter((_, index) => {
          const lineNum = index + 2;
          return !validationResult.errors.some(error => error.includes(`Linha ${lineNum}:`));
        });
        
        if (validOrders.length === 0) {
          throw new Error('Nenhum pedido válido encontrado após validação');
        }
        
        orders = validOrders;
      }

      // Gera conteúdo CSV
      const csvContent = this.generateEmarsysCsvContent(orders);
      const lines = csvContent.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length <= 1) {
        return {
          success: false,
          error: 'CSV vazio ou apenas header',
          timestamp: getBrazilianTimestamp()
        };
      }

      // Salva arquivo com BOM
      const csvWithBom = '\ufeff' + csvContent;
      await fs.writeFile(filePath, csvWithBom, 'utf8');

      const result = {
        success: true,
        filename: filename,
        filePath: filePath,
        fileSize: Buffer.byteLength(csvWithBom, 'utf8'),
        timestamp: getBrazilianTimestamp(),
        totalOrders: orders.length
      };

      // Se autoSend estiver habilitado, envia o CSV e marca como sincronizado
      if (options.autoSend === true) {
        try {
          const emarsysSalesService = require('./emarsysSalesService');
          const sendResult = await emarsysSalesService.sendCsvFileToEmarsys(filename);
          
          if (sendResult.success) {
            // Marca pedidos como sincronizados
            await this.markOrdersAsSynced(orders.map(o => ({ order: o.order, item: o.item })));
            result.emarsysSent = true;
            result.sendResult = sendResult;
          } else {
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
      const lineNum = index + 2;
      
      if (!order.order) errors.push(`Linha ${lineNum}: order é obrigatório`);
      if (!order.item) errors.push(`Linha ${lineNum}: item é obrigatório`);
      if (!order.email) {
        errors.push(`Linha ${lineNum}: email é obrigatório`);
      } else if (!order.email.includes('@')) {
        errors.push(`Linha ${lineNum}: email deve ser um email válido`);
      }
      if (order.quantity === null || order.quantity === undefined || isNaN(parseFloat(order.quantity))) {
        errors.push(`Linha ${lineNum}: quantity deve ser um número válido`);
      }
      if (!order.timestamp) {
        errors.push(`Linha ${lineNum}: timestamp é obrigatório`);
      } else {
        try {
          const date = new Date(order.timestamp);
          if (isNaN(date.getTime())) {
            errors.push(`Linha ${lineNum}: timestamp não é uma data válida`);
          }
        } catch (error) {
          errors.push(`Linha ${lineNum}: timestamp inválido`);
        }
      }
      if (!order.price || isNaN(parseFloat(order.price))) {
        errors.push(`Linha ${lineNum}: price deve ser um número válido`);
      }

      const maxLengths = {
        item: 25,
        order: 25,
        s_channel_source: 25,
        s_store_id: 25,
        s_sales_channel: 25,
        s_discount: 25
      };

      Object.entries(maxLengths).forEach(([field, maxLength]) => {
        const value = String(order[field] || '');
        if (value.length > maxLength) {
          errors.push(`Linha ${lineNum}: Campo ${field} muito longo (${value.length} caracteres, máximo ${maxLength})`);
        }
      });
    });

    return { errors, warnings };
  }

  /**
   * Gera conteúdo CSV no formato específico da Emarsys
   * @param {Array} orders - Array de pedidos
   * @returns {string} Conteúdo CSV formatado
   */
  generateEmarsysCsvContent(orders) {
    const headers = [
      'order', 'item', 'email', 'quantity', 'timestamp',
      'price', 's_channel_source', 's_store_id', 's_sales_channel', 's_discount'
    ];

    // Remove duplicatas usando order, item e order_status (chave única do banco)
    const uniqueOrders = new Map();
    for (const order of orders) {
      // Usa order, item e order_status como chave única (mesma constraint do banco)
      const orderStatus = order.order_status || order.status;
      const uniqueKey = `${order.order}_${order.item}_${orderStatus}`;
      if (!uniqueOrders.has(uniqueKey)) {
        uniqueOrders.set(uniqueKey, order);
      } else {
        console.log(`⚠️ Duplicata detectada no CSV: ${uniqueKey} - removendo`);
      }
    }

    const deduplicatedOrders = Array.from(uniqueOrders.values());
    let csvContent = headers.join(',') + '\n';

    for (const order of deduplicatedOrders) {
      const requiredFields = ['order', 'item', 'email', 'quantity', 'timestamp', 'price'];
      const missingFields = requiredFields.filter(field => !order[field]);
      
      if (missingFields.length > 0) {
        continue;
      }

      const row = [
        this.sanitizeField(order.order, 25, 'order'),
        this.sanitizeField(order.item, 25, 'item'),
        this.sanitizeField(order.email, 0, 'email'),
        this.sanitizeField(order.quantity, 25, 'quantity'),
        this.sanitizeField(order.timestamp, 25, 'timestamp'),
        this.sanitizeField(order.price, 25, 'price'),
        this.sanitizeField(order.s_channel_source || 'web', 25, 's_channel_source'),
        this.sanitizeField(order.s_store_id || 'piccadilly', 25, 's_store_id'),
        this.sanitizeField(order.s_sales_channel || 'ecommerce', 25, 's_sales_channel'),
        this.sanitizeField(order.s_discount ?? '0', 25, 's_discount')
      ];
      
      if (row.length === 10 && row[0] && row[1] && row[2] && row[3] && row[4] && row[5]) {
        csvContent += row.join(',') + '\n';
      }
    }

    return csvContent.trim();
  }

  /**
   * Sanitiza campo para CSV
   * @param {*} value - Valor a ser sanitizado
   * @param {number} maxLength - Comprimento máximo
   * @param {string} fieldName - Nome do campo
   * @returns {string} Valor sanitizado
   */
  sanitizeField(value, maxLength = 25, fieldName = '') {
    if (value === null || value === undefined) return '';
    
    if (fieldName === 'timestamp') {
      try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return '';
        return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
      } catch (error) {
        return '';
      }
    }
    
    let cleanValue = String(value)
      .replace(/"/g, '')
      .replace(/\r?\n/g, ' ')
      .trim();
    
    if (fieldName === 'email') {
      cleanValue = cleanValue.replace(/,/g, '');
    } else {
      cleanValue = cleanValue.replace(/,/g, ' ');
    }
    
    if (maxLength > 0 && cleanValue.length > maxLength) {
      cleanValue = cleanValue.substring(0, maxLength);
    }
    
    return cleanValue;
  }

  /**
   * Executa sincronização completa de pedidos
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Resultado da sincronização
   */
  async syncOrders(options = {}) {
    try {
      console.log('🔄 Iniciando sincronização completa de pedidos...');
      console.log('📋 [OrdersSyncService] Opções recebidas:', {
        hasOrders: !!(options.orders && Array.isArray(options.orders)),
        ordersCount: options.orders?.length || 0,
        dataInicial: options.dataInicial,
        dataFinal: options.dataFinal,
        maxOrders: options.maxOrders,
        allOptions: Object.keys(options)
      });
      const startTime = Date.now();
      
      let orders = [];
      
      // Se pedidos já foram fornecidos, usa eles
      if (options.orders && Array.isArray(options.orders)) {
        console.log(`📦 Usando ${options.orders.length} pedidos já fornecidos`);
        orders = options.orders;
      } else if (options.dataInicial && options.dataFinal) {
        console.log(`📅 Buscando pedidos por período: ${options.dataInicial} até ${options.dataFinal}`);
        orders = await this.getAllOrdersInPeriod(options.dataInicial, options.dataFinal, false);
      } else {
        console.warn('⚠️ [OrdersSyncService] Nenhuma opção de busca válida fornecida:', {
          hasOrders: !!(options.orders && Array.isArray(options.orders)),
          hasDataInicial: !!options.dataInicial,
          hasDataFinal: !!options.dataFinal,
          dataInicial: options.dataInicial,
          dataFinal: options.dataFinal
        });
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
      
      // Salvar pedidos no SQLite
      const saveResult = await this.saveOrdersToSQLite(orders);
      console.log(`✅ ${saveResult.inserted || 0} inseridos, ${saveResult.updated || 0} atualizados no SQLite`);

      // Buscar detalhes completos dos pedidos que foram salvos (para obter email)
      // Se não tiver email, vamos buscar os detalhes da VTEX
      console.log('🔍 Verificando se pedidos salvos têm email...');
      let dbOrders = await this.getPendingSyncOrders(
        options.dataInicial && options.dataFinal 
          ? { startDate: options.dataInicial, endDate: options.dataFinal }
          : {}
      );
      
      // Se pedidos salvos não têm email, buscar detalhes da VTEX e email via CPF na CL
      const ordersWithoutEmail = dbOrders.filter(o => !o.email);
      if (ordersWithoutEmail.length > 0) {
        console.log(`📧 ${ordersWithoutEmail.length} pedidos sem email, buscando detalhes da VTEX e email via CPF na CL...`);
        for (const dbOrder of ordersWithoutEmail.slice(0, 50)) { // Limitar a 50 para não sobrecarregar
          try {
            // 1. Buscar detalhes completos do pedido
            const orderDetail = await this.getOrderById(dbOrder.order);
            
            let email = null;
            
            // 2. Tentar obter email do pedido diretamente
            if (orderDetail?.clientProfileData?.email || orderDetail?.customerEmail) {
              email = orderDetail.clientProfileData?.email || orderDetail.customerEmail;
              // Validar se não é email hash
              if (email && (email.includes('@ct.vtex.com.br') || !email.includes('@'))) {
                email = null; // Descartar email hash
              }
            }
            
            // 3. Se não encontrou email válido, buscar via CPF na CL
            if (!email && orderDetail?.clientProfileData?.document) {
              const document = orderDetail.clientProfileData.document;
              console.log(`🔍 Buscando email na CL via CPF: ${document}`);
              const customerData = await this.getCustomerEmailByDocument(document);
              if (customerData && customerData.email) {
                email = customerData.email;
                console.log(`✅ Email encontrado na CL via CPF para pedido ${dbOrder.order}: ${email}`);
              }
            }
            
            // 4. Atualizar email no SQLite se encontrou
            if (email && email.includes('@') && !email.includes('@ct.vtex.com.br')) {
              await this.db.init();
              const stmt = this.db.db.prepare('UPDATE orders SET email = ? WHERE "order" = ? AND item = ?');
              stmt.run(email, dbOrder.order, dbOrder.item);
              console.log(`✅ Email atualizado para pedido ${dbOrder.order}: ${email}`);
            } else {
              console.warn(`⚠️ Email não encontrado para pedido ${dbOrder.order}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 300)); // Rate limit
          } catch (error) {
            console.warn(`⚠️ Erro ao buscar email do pedido ${dbOrder.order}:`, error.message);
          }
        }
        
        // Buscar novamente os pedidos atualizados
        dbOrders = await this.getPendingSyncOrders(
          options.dataInicial && options.dataFinal 
            ? { startDate: options.dataInicial, endDate: options.dataFinal }
            : {}
        );
      }
      
      // Transformar para formato Emarsys
      const transformedOrders = await this.transformOrdersForEmarsysNew(dbOrders);
      
      // Gerar CSV apenas se houver dados transformados
      let csvResult = null;
      if (transformedOrders.emarsysData && transformedOrders.emarsysData.length > 0) {
        csvResult = await this.generateCsvFromOrders(transformedOrders.emarsysData, {
          ...options,
          autoSend: true,
          startDate: options.dataInicial,
          endDate: options.dataFinal
        });
      } else {
        console.warn('⚠️ Nenhum pedido válido para gerar CSV. Verifique os logs acima para detalhes dos erros.');
        csvResult = {
          success: false,
          error: 'Nenhum pedido válido após transformação',
          stats: transformedOrders.stats
        };
      }

      const duration = Date.now() - startTime;
      
      return {
        success: true,
        totalOrders: orders.length,
        transformedOrders: transformedOrders.emarsysData?.length || 0,
        message: 'Sincronização de pedidos concluída com sucesso',
        csvResult: csvResult,
        duration: duration,
        timestamp: getBrazilianTimestamp()
      };
      
    } catch (error) {
      console.error('❌ Erro na sincronização de pedidos:', error);
      return {
        success: false,
        error: error.message,
        totalOrders: 0,
        timestamp: getBrazilianTimestamp()
      };
    }
  }
}

module.exports = OrdersSyncService;

