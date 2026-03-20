/**
 * Serviço de envio de pedidos para Emarsys via API (OAuth2).
 *
 * Substitui o envio via SFTP/HAPI para pedidos.
 * Usa o EmarsysOAuth2Service para autenticação.
 *
 * IMPORTANTE: O método buildOrderPayload() precisa ser atualizado
 * quando o formato do payload da API for definido.
 *
 * Variáveis de ambiente:
 * - EMARSYS_ORDERS_API_URL — endpoint da API de pedidos (a definir)
 */
const axios = require('axios');
const emarsysOAuth2Service = require('./emarsysOAuth2Service');
const { logger, logHelpers } = require('../utils/logger');
require('dotenv').config();

class EmarsysOrdersApiService {
  constructor() {
    this.apiUrl = process.env.EMARSYS_ORDERS_API_URL || '';
    this.timeout = parseInt(process.env.EMARSYS_ORDERS_API_TIMEOUT) || 30000;
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
   * Transforma dados do pedido do formato interno (SQLite) para o payload da API Emarsys.
   *
   * TODO: Atualizar este método quando o formato do payload for definido.
   * Atualmente retorna os campos disponíveis no SQLite.
   *
   * @param {Object} orderData - Dados do pedido (formato SQLite)
   * @returns {Object} Payload formatado para a API
   */
  buildOrderPayload(orderData) {
    // TODO: Ajustar para o formato exato exigido pela API Emarsys
    return {
      order: orderData.order,
      item: orderData.item,
      email: orderData.email,
      quantity: orderData.quantity,
      price: orderData.price,
      timestamp: orderData.timestamp,
      order_status: orderData.order_status,
      s_channel_source: orderData.s_channel_source,
      s_store_id: orderData.s_store_id,
      s_sales_channel: orderData.s_sales_channel,
      s_discount: orderData.s_discount
    };
  }

  /**
   * Envia um pedido individual para a API Emarsys
   * @param {Object} orderData - Dados do pedido
   * @returns {Promise<Object>} Resultado do envio
   */
  async sendOrder(orderData) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Serviço não configurado. Verifique EMARSYS_ORDERS_API_URL e credenciais OAuth2.',
        errorType: 'CONFIG_ERROR'
      };
    }

    const payload = this.buildOrderPayload(orderData);
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const headers = await emarsysOAuth2Service.getAuthHeaders();

        logHelpers.logOrders('info', `[EmarsysOrdersAPI] Enviando pedido (tentativa ${attempt}/${this.maxRetries})`, {
          order: orderData.order,
          item: orderData.item
        });

        const response = await axios.post(this.apiUrl, payload, {
          headers,
          timeout: this.timeout
        });

        logHelpers.logOrders('info', `[EmarsysOrdersAPI] Pedido enviado com sucesso (status: ${response.status})`, {
          order: orderData.order,
          item: orderData.item
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
          order: orderData.order,
          retryable: isRetryable
        });

        if (!isRetryable) {
          return {
            success: false,
            error: error.message,
            status,
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
   * Envia múltiplos pedidos em lote
   * @param {Array<Object>} orders - Array de pedidos
   * @param {Object} options - Opções
   * @returns {Promise<Object>} Resultado do envio em lote
   */
  async sendOrdersBatch(orders, options = {}) {
    const { delayBetween = 100 } = options;

    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Serviço não configurado',
        errorType: 'CONFIG_ERROR'
      };
    }

    if (!Array.isArray(orders) || orders.length === 0) {
      return { success: true, total: 0, sent: 0, failed: 0 };
    }

    logHelpers.logOrders('info', `[EmarsysOrdersAPI] Iniciando envio batch de ${orders.length} pedidos`);

    const results = { total: orders.length, sent: 0, failed: 0, errors: [] };

    for (let i = 0; i < orders.length; i++) {
      const result = await this.sendOrder(orders[i]);

      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push({
          index: i,
          order: orders[i].order,
          item: orders[i].item,
          error: result.error
        });
      }

      if ((i + 1) % 100 === 0 || i === orders.length - 1) {
        logHelpers.logOrders('info', `[EmarsysOrdersAPI] Progresso: ${i + 1}/${orders.length} (${results.sent} OK, ${results.failed} erros)`);
      }

      if (i < orders.length - 1 && delayBetween > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetween));
      }
    }

    logHelpers.logOrders('info', `[EmarsysOrdersAPI] Batch concluído`, results);

    return {
      success: results.failed === 0,
      ...results
    };
  }

  /**
   * Testa conectividade com a API
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
