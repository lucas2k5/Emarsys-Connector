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
    
    try {
      const res = await this.client.get(url, { params });
      return res.data;
    } catch (error) {
      console.error('Erro ao buscar pedidos (OMS):', error?.response?.data || error.message);
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
   * Transforma pedido da VTEX para formato SQLite
   * @param {Object} order - Pedido da VTEX
   * @returns {Array} Array de pedidos formatados para SQLite
   */
  transformOrderToSQLite(order) {
    const formattedOrders = [];
    const orderId = order.orderId || order.id;
    if (!orderId) return formattedOrders;
    
    if (order.items && Array.isArray(order.items)) {
      for (const item of order.items) {
        formattedOrders.push({
          order: orderId,
          item: item.id || item.sku || item.productId || item.refId,
          email: order.clientProfileData?.email || order.customerEmail || null,
          quantity: item.quantity || 1,
          price: item.price || item.sellingPrice || item.priceDefinition?.calculatedSellingPrice || 0,
          timestamp: order.creationDate || order.invoiceCreatedDate || new Date().toISOString(),
          isSync: false,
          order_status: order.status || order.orderStatus || null,
          s_channel_source: order.salesChannel || order.channel || 'web',
          s_store_id: 'piccadilly',
          s_sales_channel: order.salesChannel || 'ecommerce',
          s_discount: order.discountValue || item.discount || '0'
        });
      }
    } else {
      formattedOrders.push({
        order: orderId,
        item: orderId,
        email: order.clientProfileData?.email || order.customerEmail || null,
        quantity: order.totalItems || 1,
        price: order.totalValue || order.value || 0,
        timestamp: order.creationDate || order.invoiceCreatedDate || new Date().toISOString(),
        isSync: false,
        order_status: order.status || order.orderStatus || null,
        s_channel_source: order.salesChannel || order.channel || 'web',
        s_store_id: 'piccadilly',
        s_sales_channel: order.salesChannel || 'ecommerce',
        s_discount: order.discountValue || '0'
      });
    }
    
    return formattedOrders;
  }

  /**
   * Salva pedidos da VTEX no SQLite
   * @param {Array} orders - Array de pedidos da VTEX
   * @returns {Promise<Object>} Resultado da operação
   */
  async saveOrdersToSQLite(orders) {
    try {
      await this.initDatabase();
      
      const formattedOrders = [];
      for (const order of orders) {
        const transformed = this.transformOrderToSQLite(order);
        formattedOrders.push(...transformed);
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
      
      if (options.startDate && options.endDate) {
        return this.db.findByPeriod(options.startDate, options.endDate);
      }
      
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
   * Transforma dados dos pedidos do SQLite para o formato da Emarsys
   * @param {Array} orders - Array de pedidos do SQLite
   * @param {boolean} checkDuplicates - Se deve verificar duplicatas
   * @returns {Promise<Object>} Dados transformados
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
    
    // Verifica duplicatas usando SQLite
    let processedItemIds = new Set();
    if (checkDuplicates) {
      const uniqueItemIds = orders.map(order => `${order.order}_${order.item}`).filter(Boolean);
      
      // Verifica quais já foram processados (isSync=true)
      await this.initDatabase();
      const allOrders = this.db.listAllOrders({ limit: 10000 });
      const syncedOrders = allOrders
        .filter(o => o.isSync === true || o.isSync === 1)
        .map(o => `${o.order}_${o.item}`);
      
      processedItemIds = new Set(syncedOrders);
      
      if (processedItemIds.size > 0) {
        console.log(`⏭️ Pulando ${processedItemIds.size} itens já sincronizados`);
      }
    }
    
    for (const order of orders) {
      try {
        const orderId = order.order;
        const uniqueItemId = `${orderId}_${order.item}`;
        
        if (checkDuplicates && processedItemIds.has(uniqueItemId)) {
          skippedDuplicates++;
          continue;
        }
        
        // Valida se o orderId segue o padrão exato: 13 dígitos + "-01"
        const orderIdPattern = /^\d{13}-01$/;
        if (!orderIdPattern.test(orderId)) {
          skippedMarketplace++;
          continue;
        }

        // Validações de campos obrigatórios
        const email = order.email;
        const item = order.item;
        const quantity = order.quantity;
        const price = order.price;
        
        if (!email || !item || !quantity || !price) {
          errorOrders.push({
            orderId,
            reason: 'missing_required_fields',
            missingFields: {
              email: !email,
              item: !item,
              quantity: !quantity,
              price: !price
            }
          });
          continue;
        }

        // Verifica se o pedido está cancelado
        const canceledStatuses = ['canceled', 'refunded', 'returned'];
        const isCanceled = canceledStatuses.includes(order.order_status) || canceledStatuses.includes(order.status);
        
        let finalQuantity = quantity;
        let finalPrice = price;
        let discount = order.s_discount || order.discount || '0';
        
        if (isCanceled) {
          finalQuantity = typeof finalQuantity === 'string' ? `-${Math.abs(parseFloat(finalQuantity))}` : -Math.abs(finalQuantity);
          finalPrice = `-${Math.abs(parseFloat(finalPrice)).toFixed(2)}`;
          discount = parseFloat(discount) === 0 ? '-0.00' : `-${Math.abs(parseFloat(discount)).toFixed(2)}`;
          canceledOrders++;
        }
        
        const saleRecord = {
          order: orderId,
          item: item,
          email: email,
          quantity: finalQuantity,
          timestamp: order.timestamp || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
          price: finalPrice,
          s_channel_source: order.s_channel_source || 'web',
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
        console.error(`❌ Erro ao processar pedido ${order.order}:`, error?.message);
        errorOrders.push({
          orderId: order.order,
          reason: 'processing_error',
          error: error.message
        });
      }
    }

    console.log(`✅ Transformados ${orders.length} pedidos em ${emarsysData.length} registros para Emarsys`);
    console.log(`📊 Estatísticas: ${emarsysData.length} processados, ${skippedMarketplace} pulados (marketplace), ${skippedDuplicates} pulados (duplicatas), ${canceledOrders} cancelados, ${errorOrders.length} com erro`);
    
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
        successRate: orders.length > 0 ? ((emarsysData.length / orders.length) * 100).toFixed(2) + '%' : '0%'
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

      // Gera nome do arquivo
      let timestamp = getBrazilianTimestampForFilename();
      let period = options.period || 'default';
      
      if (options.brazilianDate) {
        const brazilianDate = options.brazilianDate;
        const currentTime = new Date().toLocaleTimeString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }).replace(/:/g, '-');
        timestamp = `${brazilianDate}T${currentTime}`;
      }
      
      const sanitizedPeriod = period.replace(/[<>:"/\\|?*]/g, '-');
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
      if (quantity === null || quantity === undefined || isNaN(parseFloat(order.quantity))) {
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

    // Remove duplicatas
    const uniqueOrders = new Map();
    for (const order of orders) {
      const uniqueKey = `${order.order}_${order.item}`;
      if (!uniqueOrders.has(uniqueKey)) {
        uniqueOrders.set(uniqueKey, order);
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
      const startTime = Date.now();
      
      let orders = [];
      
      // Se pedidos já foram fornecidos, usa eles
      if (options.orders && Array.isArray(options.orders)) {
        console.log(`📦 Usando ${options.orders.length} pedidos já fornecidos`);
        orders = options.orders;
      } else if (options.dataInicial && options.dataFinal) {
        console.log(`📅 Buscando pedidos por período: ${options.dataInicial} até ${options.dataFinal}`);
        orders = await this.getAllOrdersInPeriod(options.dataInicial, options.dataFinal, false);
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

      // Buscar pedidos salvos do SQLite para processar
      const dbOrders = options.dataInicial && options.dataFinal 
        ? await this.getPendingSyncOrders({ startDate: options.dataInicial, endDate: options.dataFinal })
        : await this.getPendingSyncOrders();
      
      // Transformar para formato Emarsys
      const transformedOrders = await this.transformOrdersForEmarsys(dbOrders);
      
      // Gerar CSV e enviar
      const csvResult = await this.generateCsvFromOrders(transformedOrders.emarsysData, {
        ...options,
        autoSend: true,
        startDate: options.dataInicial,
        endDate: options.dataFinal
      });

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

