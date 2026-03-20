/**
 * Serviço de envio de pedidos para Emarsys via Sales Data API (OAuth2).
 *
 * Envia um arquivo CSV como binary para a API HAPI/Scarab Research.
 * Autenticação via OAuth2 client_credentials (EmarsysOAuth2Service).
 *
 * Endpoint: POST https://admin.scarabresearch.com/hapi/merchant/{MERCHANT_ID}/sales-data/api
 * Content-Type: text/csv (binary upload)
 *
 * Campos CSV (nesta ordem):
 * item, price, order, timestamp, customer, quantity,
 * s_sales_channel, s_store_id, s_canal, s_loja, s_tipo_pagamento, s_cupom
 *
 * Variáveis de ambiente:
 * - EMARSYS_ORDERS_API_URL — endpoint completo da API
 * - EMARSYS_ORDERS_API_TIMEOUT — timeout em ms (padrão: 60000)
 */
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const emarsysOAuth2Service = require('./emarsysOAuth2Service');
const { logger, logHelpers } = require('../utils/logger');
const { getBrazilianTimestampForFilename, getBrazilianTimestamp } = require('../utils/dateUtils');
require('dotenv').config();

// Campos CSV na ordem exigida pela API
const CSV_HEADERS = [
  'item',
  'price',
  'order',
  'timestamp',
  'customer',
  'quantity',
  's_sales_channel',
  's_store_id',
  's_canal',
  's_loja',
  's_tipo_pagamento',
  's_cupom'
];

class EmarsysOrdersApiService {
  constructor() {
    this.apiUrl = process.env.EMARSYS_ORDERS_API_URL || '';
    this.timeout = parseInt(process.env.EMARSYS_ORDERS_API_TIMEOUT) || 60000;
    this.maxRetries = 3;

    if (!this.apiUrl) {
      console.warn('⚠️ [EmarsysOrdersAPI] EMARSYS_ORDERS_API_URL não configurado. Endpoint de pedidos pendente.');
    } else {
      console.log('✅ [EmarsysOrdersAPI] Configurado para:', this.apiUrl);
    }
  }

  /**
   * Verifica se o serviço está pronto para uso
   * @returns {boolean}
   */
  isConfigured() {
    return !!(this.apiUrl && emarsysOAuth2Service.isConfigured());
  }

  /**
   * Sanitiza um campo para CSV (escapa vírgulas e aspas)
   * @param {*} value
   * @returns {string}
   */
  sanitizeCsvField(value) {
    if (value === null || value === undefined) return '';
    const str = String(value).trim();
    // Se contém vírgula, aspas ou quebra de linha, envolve em aspas
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Formata preço com ponto decimal (ex: 129.90)
   * @param {*} price
   * @returns {string}
   */
  formatPrice(price) {
    if (price === null || price === undefined || price === '') return '0.00';
    const num = parseFloat(String(price).replace(',', '.'));
    if (isNaN(num)) return '0.00';
    return num.toFixed(2);
  }

  /**
   * Transforma um pedido do formato interno (SQLite) para uma linha CSV.
   *
   * Mapeamento:
   * - item          → orderData.item (SKU, mesmo do catálogo de produtos)
   * - price         → orderData.price
   * - order         → orderData.order (ID do pedido)
   * - timestamp     → orderData.timestamp
   * - customer      → orderData.email (identificador do cliente)
   * - quantity      → orderData.quantity
   * - s_sales_channel → orderData.s_sales_channel
   * - s_store_id    → orderData.s_store_id
   * - s_canal       → orderData.s_channel_source
   * - s_loja        → orderData.s_store_id
   * - s_tipo_pagamento → orderData.s_tipo_pagamento (se disponível)
   * - s_cupom       → orderData.s_discount
   *
   * @param {Object} orderData - Dados do pedido
   * @returns {string} Linha CSV
   */
  buildCsvRow(orderData) {
    const fields = [
      this.sanitizeCsvField(orderData.item),
      this.formatPrice(orderData.price),
      this.sanitizeCsvField(orderData.order),
      this.sanitizeCsvField(orderData.timestamp),
      this.sanitizeCsvField(orderData.email),
      this.sanitizeCsvField(orderData.quantity || 1),
      this.sanitizeCsvField(orderData.s_sales_channel || ''),
      this.sanitizeCsvField(orderData.s_store_id || ''),
      this.sanitizeCsvField(orderData.s_channel_source || ''),
      this.sanitizeCsvField(orderData.s_store_id || ''),
      this.sanitizeCsvField(orderData.s_tipo_pagamento || ''),
      this.sanitizeCsvField(orderData.s_discount || '')
    ];
    return fields.join(',');
  }

  /**
   * Gera conteúdo CSV completo a partir de um array de pedidos
   * @param {Array<Object>} orders - Array de pedidos
   * @returns {string} Conteúdo CSV com header
   */
  generateCsvContent(orders) {
    const header = CSV_HEADERS.join(',');
    const rows = orders.map(order => this.buildCsvRow(order));
    return header + '\n' + rows.join('\n') + '\n';
  }

  /**
   * Gera arquivo CSV e salva em /exports
   * @param {Array<Object>} orders - Array de pedidos
   * @param {Object} options - Opções (filename)
   * @returns {Promise<Object>} Resultado com filePath e csvContent
   */
  async generateAndSaveCsv(orders, options = {}) {
    if (!orders || orders.length === 0) {
      return { success: false, error: 'Nenhum pedido fornecido' };
    }

    const timestamp = getBrazilianTimestampForFilename();
    const filename = options.filename || `ventas-hope-${timestamp}.csv`;
    const outputDir = path.join(process.cwd(), 'exports');

    // Garantir diretório
    const fsExtra = require('fs-extra');
    await fsExtra.ensureDir(outputDir);

    const csvContent = this.generateCsvContent(orders);
    const filePath = path.join(outputDir, filename);

    await fs.writeFile(filePath, csvContent, 'utf8');

    const lines = csvContent.split('\n').filter(l => l.trim());
    logHelpers.logOrders('info', `[EmarsysOrdersAPI] CSV gerado: ${filename} (${lines.length - 1} pedidos)`, {
      filename,
      filePath,
      totalOrders: lines.length - 1
    });

    return {
      success: true,
      filename,
      filePath,
      csvContent,
      totalOrders: lines.length - 1,
      timestamp: getBrazilianTimestamp()
    };
  }

  /**
   * Envia arquivo CSV para a API Emarsys (upload binary)
   * @param {string} csvContentOrPath - Conteúdo CSV ou caminho do arquivo
   * @returns {Promise<Object>} Resultado do envio
   */
  async sendCsvToApi(csvContentOrPath) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Serviço não configurado. Verifique EMARSYS_ORDERS_API_URL e credenciais OAuth2.',
        errorType: 'CONFIG_ERROR'
      };
    }

    // Se for caminho de arquivo, ler conteúdo
    let csvContent;
    if (csvContentOrPath.includes('\n') || csvContentOrPath.includes(',')) {
      csvContent = csvContentOrPath;
    } else {
      csvContent = await fs.readFile(csvContentOrPath, 'utf8');
    }

    const csvBuffer = Buffer.from(csvContent, 'utf8');
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const token = await emarsysOAuth2Service.getAccessToken();

        logHelpers.logOrders('info', `[EmarsysOrdersAPI] Enviando CSV (tentativa ${attempt}/${this.maxRetries})`, {
          size: `${(csvBuffer.length / 1024).toFixed(2)} KB`,
          lines: csvContent.split('\n').filter(l => l.trim()).length - 1
        });

        const response = await axios.post(this.apiUrl, csvBuffer, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'text/csv',
            'Accept': 'application/json'
          },
          timeout: this.timeout,
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        });

        logHelpers.logOrders('info', `[EmarsysOrdersAPI] CSV enviado com sucesso (status: ${response.status})`, {
          status: response.status,
          data: response.data
        });

        return {
          success: true,
          data: response.data,
          status: response.status,
          attempts: attempt
        };
      } catch (error) {
        lastError = error;
        const status = error.response?.status;
        const data = error.response?.data;

        // Se 401, invalidar token e tentar novamente
        if (status === 401 && attempt < this.maxRetries) {
          logger.warn('[EmarsysOrdersAPI] Token expirado, renovando...');
          emarsysOAuth2Service.invalidateToken();
          continue;
        }

        const isRetryable = !status || status >= 500 || status === 429 ||
          error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';

        logHelpers.logOrdersError(error, {
          attempt,
          maxRetries: this.maxRetries,
          status,
          responseData: data,
          retryable: isRetryable
        });

        if (!isRetryable) {
          return {
            success: false,
            error: error.message,
            status,
            data,
            retryable: false,
            attempts: attempt
          };
        }

        if (attempt < this.maxRetries) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      error: `Falha após ${this.maxRetries} tentativas: ${lastError.message}`,
      retryable: true,
      attempts: this.maxRetries
    };
  }

  /**
   * Fluxo completo: gera CSV a partir de pedidos e envia para a API
   * @param {Array<Object>} orders - Array de pedidos
   * @param {Object} options - Opções
   * @returns {Promise<Object>} Resultado do envio
   */
  async generateAndSendOrders(orders, options = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Serviço não configurado',
        errorType: 'CONFIG_ERROR'
      };
    }

    if (!Array.isArray(orders) || orders.length === 0) {
      return { success: true, total: 0, message: 'Nenhum pedido para enviar' };
    }

    logHelpers.logOrders('info', `[EmarsysOrdersAPI] Iniciando fluxo completo: ${orders.length} pedidos`);

    // 1. Gerar CSV
    const csvResult = await this.generateAndSaveCsv(orders, options);
    if (!csvResult.success) {
      return csvResult;
    }

    // 2. Enviar CSV
    const sendResult = await this.sendCsvToApi(csvResult.csvContent);

    return {
      ...sendResult,
      csv: {
        filename: csvResult.filename,
        filePath: csvResult.filePath,
        totalOrders: csvResult.totalOrders
      }
    };
  }

  /**
   * Envia um arquivo CSV já existente para a API
   * @param {string} filePath - Caminho do arquivo CSV
   * @returns {Promise<Object>} Resultado do envio
   */
  async sendCsvFile(filePath) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Serviço não configurado',
        errorType: 'CONFIG_ERROR'
      };
    }

    logHelpers.logOrders('info', `[EmarsysOrdersAPI] Enviando arquivo CSV: ${path.basename(filePath)}`);
    return this.sendCsvToApi(filePath);
  }

  /**
   * Testa conectividade com a API (obtém token OAuth2)
   * @returns {Promise<Object>}
   */
  async testConnection() {
    if (!emarsysOAuth2Service.isConfigured()) {
      return { success: false, error: 'OAuth2 não configurado', configured: false };
    }

    if (!this.apiUrl) {
      return { success: false, error: 'EMARSYS_ORDERS_API_URL não configurado', configured: false };
    }

    try {
      const oauth2Test = await emarsysOAuth2Service.testConnection();
      return {
        success: oauth2Test.success,
        configured: true,
        apiUrl: this.apiUrl,
        csvHeaders: CSV_HEADERS,
        oauth2: oauth2Test
      };
    } catch (error) {
      return {
        success: false,
        configured: true,
        error: error.message
      };
    }
  }
}

module.exports = new EmarsysOrdersApiService();
