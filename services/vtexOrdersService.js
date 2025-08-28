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
    this.client = rateLimit(axios.create({
      baseURL: baseURL,
      headers
    }), { maxRequests: 3900, perMilliseconds: 1000 });
    
    // Initialize axios-retry asynchronously
    this._initializeAxiosRetry();

    // Configuração de diretórios
    const defaultDataDir = process.env.VERCEL ? '/tmp/data' : path.join(__dirname, '..', 'data');
    const defaultExports = process.env.VERCEL ? '/tmp/exports' : path.join(__dirname, '..', 'exports');
    this.dataDir = process.env.DATA_DIR || defaultDataDir;
    this.exportsDir = process.env.EXPORTS_DIR || defaultExports;
    this.ordersFile = path.join(this.dataDir, 'orders.json');
    this.lastSyncFile = path.join(this.dataDir, 'last-sync.json');
    this.emarsysSyncFile = path.join(this.dataDir, 'emarsys-sync.json');
  }

  async _initializeAxiosRetry() {
    try {
      const axiosRetry = (await import('axios-retry')).default;
      axiosRetry(this.client, {
        retries: 3,
        retryDelay: axiosRetry.exponentialDelay,
        retryCondition: err => (axiosRetry.isNetworkOrIdempotentRequestError(err) || err.response?.status >= 400)
      });
    } catch (error) {
      console.error('Failed to initialize axios-retry:', error);
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
    try {
      const res = await this.client.get(url, { params });
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
      const response = await this.client.get(this.ordersUrl, {
        params: {
          page,
          pageSize
        },
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos da VTEX:', error.message);
      throw new Error(`Erro ao buscar pedidos: ${error.message}`);
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
    const defaultExports = process.env.VERCEL ? '/tmp/exports' : path.join(__dirname, '..', 'exports');
    let outputDir = process.env.EXPORTS_DIR || defaultExports;
    
    try {
      await fs.mkdir(outputDir, { recursive: true });
      console.log(`📁 Diretório de exports criado/verificado: ${outputDir}`);
      return outputDir;
    } catch (error) {
      console.error(`❌ Erro ao criar diretório ${outputDir}:`, error.message);
      
      // Fallback para /tmp se houver erro
      if (process.env.VERCEL) {
        const fallbackDir = '/tmp';
        console.log(`🔄 Usando diretório fallback: ${fallbackDir}`);
        try {
          await fs.mkdir(fallbackDir, { recursive: true });
          return fallbackDir;
        } catch (fallbackError) {
          console.error(`❌ Erro ao criar diretório fallback ${fallbackDir}:`, fallbackError.message);
          throw fallbackError;
        }
      } else {
        throw error;
      }
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
   * @returns {Array} Array com dados no formato da Emarsys
   */
  transformOrdersForEmarsys(orders) {
    const emarsysData = [];
    let skippedMarketplace = 0;
    
    for (const order of orders) {
      const orderId = order.order || order.orderId || order.id || '';
      
      // Valida se o orderId segue o padrão exato: 13 dígitos + "-01"
      const orderIdPattern = /^\d{13}-01$/;
      if (!orderIdPattern.test(orderId)) {
        console.log(`⏭️ Pulando pedido do marketplace: ${orderId}`);
        skippedMarketplace++;
        continue;
      }
      
      // Os dados já vêm no formato correto, apenas ajustamos os nomes dos campos
      const saleRecord = {
        order: orderId,
        item: order.item || '',
        email: order.customer_email || order.email || '',
        quantity: order.quantity,
        timestamp: order.timestamp || order.creationDate || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        price: order.price || '0',
        s_channel_source: order.s_channel_source || order.marketplace?.name || order.affiliateId || 'web',
        s_store_id: order.s_store_id || 'piccadilly',
        s_sales_channel: order.s_sales_channel || 'ecommerce',
        s_discount: order.s_discount || '0'
      };

      emarsysData.push(saleRecord);
    }

    console.log(`✅ Transformados ${orders.length} pedidos em ${emarsysData.length} registros para Emarsys`);
    if (skippedMarketplace > 0) {
      console.log(`⏭️ ${skippedMarketplace} pedidos do marketplace foram pulados`);
    }
    return emarsysData;
  }

  /**
   * Gera arquivo CSV completo para envio à Emarsys
   * @param {Array} orders - Array de pedidos já formatados para CSV
   * @param {Object} options - Opções de configuração (filename, etc.)
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

      // Valida os dados antes de gerar CSV
      const validationResult = this.validateOrderDataForEmarsys(ordersToProcess);
      if (validationResult.errors.length > 0) {
        console.error(`❌ ${validationResult.errors.length} erros de validação encontrados:`);
        console.error('Primeiros 10 erros:', validationResult.errors.slice(0, 10));
        
        // Filtra apenas pedidos válidos
        const validOrders = ordersToProcess.filter((order, index) => {
          const lineNum = index + 2;
          const hasErrors = validationResult.errors.some(error => error.includes(`Linha ${lineNum}:`));
          return !hasErrors;
        });
        
        console.log(`🔄 Filtrando pedidos: ${ordersToProcess.length} -> ${validOrders.length} válidos`);
        
        if (validOrders.length === 0) {
          console.error('❌ Nenhum pedido válido encontrado após validação. Verifique os dados de origem.');
          console.error('📊 Exemplo de pedido com erro:', ordersToProcess[0]);
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

      // Salva o arquivo com BOM para UTF-8
      const csvWithBom = '\ufeff' + csvContent;
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
    // Posição 1: order (String) - ID do pedido
    // Posição 2: item (String) - SKU do produto  
    // Posição 3: email (String) - Email do cliente
    // Posição 4: quantity (Float) - Quantidade
    // Posição 5: timestamp (Date) - Data/hora do pedido
    // Posição 6: price (Float) - Preço unitário
    // Posição 7: s_channel_source (String) - Canal de origem
    // Posição 8: s_store_id (String) - ID da loja
    // Posição 9: s_sales_channel (String) - Canal de vendas
    // Posição 10: s_discount (String) - Desconto aplicado
    const headers = [
      'order',              // Posição 1 - ID do pedido
      'item',               // Posição 2 - SKU do produto
      'email',              // Posição 3 - Email do cliente
      'quantity',           // Posição 4 - Quantidade
      'timestamp',          // Posição 5 - Data/hora do pedido
      'price',              // Posição 6 - Preço unitário
      's_channel_source',   // Posição 7 - Canal de origem
      's_store_id',         // Posição 8 - ID da loja
      's_sales_channel',    // Posição 9 - Canal de vendas
      's_discount'          // Posição 10 - Desconto aplicado
    ];

    let csvContent = headers.join(',') + '\n';

    for (const order of orders) {
      // Validação de campos obrigatórios conforme schema da Emarsys
      const requiredFields = ['order', 'item', 'email', 'quantity', 'timestamp', 'price'];
      const missingFields = requiredFields.filter(field => !order[field]);
      console.log('📄 missingFields... | order | 22/08 |', order);
      if (missingFields.length > 0) {
        console.warn(`⚠️ Pedido ${order.order || 'sem ID'} está faltando campos obrigatórios: ${missingFields.join(', ')}`);
        continue; // Pula pedidos inválidos
      }

      const row = [
        this.sanitizeField(order.order, 25, 'order'),                     // Posição 1 - order
        this.sanitizeField(order.item, 25, 'item'),                       // Posição 2 - item
        this.sanitizeField(order.email, 25, 'email'),                     // Posição 3 - email
        this.sanitizeField(order.quantity, 25, 'quantity'),               // Posição 4 - quantity
        this.sanitizeField(order.timestamp, 25, 'timestamp'),             // Posição 5 - timestamp
        this.sanitizeField(order.price, 25, 'price'),                     // Posição 6 - price
        this.sanitizeField(order.s_channel_source || 'web', 25, 's_channel_source'), // Posição 7 - s_channel_source
        this.sanitizeField(order.s_store_id || 'piccadilly', 25, 's_store_id'), // Posição 8 - s_store_id
        this.sanitizeField(order.s_sales_channel || 'ecommerce', 25, 's_sales_channel'), // Posição 9 - s_sales_channel
        this.sanitizeField(order.s_discount || '0', 25, 's_discount')     // Posição 10 - s_discount
      ];
      csvContent += row.join(',') + '\n';
    }

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
       .replace(/,/g, ' ')          // Substitui vírgulas por espaços
       .replace(/\r?\n/g, ' ')      // Remove quebras de linha
       .trim();                     // Remove espaços extras
     
     // Trunca se necessário (exceto para email que não tem limite)
     if (fieldName !== 'email' && cleanValue.length > maxLength) {
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
  generateSimpleCsvContent(orders, headers = null) {
    // Headers padrão baseados no schema do Smart Insight da Emarsys
    const defaultHeaders = [
      'item', 'price', 'order', 'timestamp', 'customer', 'quantity',
      's_channel_source', 's_store_id', 's_sales_channel', 's_discount'
    ];
    
    const csvHeaders = headers || defaultHeaders;
    let csvContent = csvHeaders.join(',') + '\n';

      for (const order of orders) {
        const row = csvHeaders.map(header => 
          this.sanitizeField(order[header] || '', 25, header)
        );
        csvContent += row.join(',') + '\n';
      }

    return csvContent;
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
      
      // 1. Buscar todos os pedidos
      console.log('📦 Buscando pedidos da VTEX...');
      const orders = await this.fetchAllOrders();
      
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
      
      // 3. Transformar dados para formato Emarsys
      console.log('🔄 Transformando dados para formato Emarsys...');
      const transformedOrders = this.transformOrdersForEmarsys(orders);
      
      // 4. Gerar CSV
      console.log('📄 Gerando CSV...| 22/08 |');
      const csvResult = await this.generateCsvFromOrders(transformedOrders, options);
      console.log('📄 Gerando CSV...| 22/08 |', csvResult);
      
      if (!csvResult.success) {
        console.warn('⚠️ Falha ao gerar CSV, mas sincronização continuará');
      }
      
      const duration = Date.now() - startTime;
      
      console.log(`🎉 Sincronização de pedidos concluída em ${duration}ms - mica`);
      
      return {
        success: true,
        totalOrders: orders.length,
        message: 'Sincronização de pedidos concluída com sucesso',
        orders: orders,
        saveResult: saveResult,
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

module.exports = VtexOrdersService;
