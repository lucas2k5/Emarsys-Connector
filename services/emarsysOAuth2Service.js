/**
 * Serviço de autenticação OAuth2 para Emarsys.
 *
 * Gerencia o fluxo client_credentials para obter e renovar tokens de acesso.
 * Mantém o token em cache e renova automaticamente antes de expirar.
 *
 * Variáveis de ambiente:
 * - EMARSYS_OAUTH2_CLIENT_ID
 * - EMARSYS_OAUTH2_CLIENT_SECRET
 * - EMARSYS_OAUTH2_TOKEN_ENDPOINT
 */
const axios = require('axios');
const { logger, logHelpers } = require('../utils/logger');
require('dotenv').config();

class EmarsysOAuth2Service {
  constructor() {
    this.clientId = process.env.EMARSYS_OAUTH2_CLIENT_ID;
    this.clientSecret = process.env.EMARSYS_OAUTH2_CLIENT_SECRET;
    this.tokenEndpoint = process.env.EMARSYS_OAUTH2_TOKEN_ENDPOINT;

    // Cache do token
    this.accessToken = null;
    this.tokenExpiresAt = null;

    // Margem de segurança: renovar 60s antes de expirar
    this.expiryMarginSeconds = 60;

    if (!this.clientId || !this.clientSecret || !this.tokenEndpoint) {
      console.warn('⚠️ [EmarsysOAuth2] Credenciais OAuth2 não configuradas. Envio de pedidos via API desabilitado.');
    } else {
      console.log('✅ [EmarsysOAuth2] Configurado:', this.tokenEndpoint);
    }
  }

  /**
   * Verifica se o serviço OAuth2 está configurado
   * @returns {boolean}
   */
  isConfigured() {
    return !!(this.clientId && this.clientSecret && this.tokenEndpoint);
  }

  /**
   * Verifica se o token atual ainda é válido
   * @returns {boolean}
   */
  isTokenValid() {
    if (!this.accessToken || !this.tokenExpiresAt) return false;
    const now = Date.now();
    return now < (this.tokenExpiresAt - this.expiryMarginSeconds * 1000);
  }

  /**
   * Obtém um token de acesso válido (usa cache ou solicita novo)
   * @returns {Promise<string>} Access token
   */
  async getAccessToken() {
    if (!this.isConfigured()) {
      throw new Error('OAuth2 não configurado. Verifique EMARSYS_OAUTH2_CLIENT_ID, EMARSYS_OAUTH2_CLIENT_SECRET e EMARSYS_OAUTH2_TOKEN_ENDPOINT');
    }

    if (this.isTokenValid()) {
      return this.accessToken;
    }

    return this.requestNewToken();
  }

  /**
   * Solicita um novo token via client_credentials grant
   * @returns {Promise<string>} Access token
   */
  async requestNewToken() {
    logger.info('[EmarsysOAuth2] Solicitando novo token de acesso...');

    try {
      const response = await axios.post(this.tokenEndpoint, new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret
      }).toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15000
      });

      const { access_token, expires_in } = response.data;

      if (!access_token) {
        throw new Error('Resposta do token endpoint não contém access_token');
      }

      this.accessToken = access_token;
      this.tokenExpiresAt = Date.now() + (expires_in || 3600) * 1000;

      logger.info('[EmarsysOAuth2] Token obtido com sucesso', {
        expiresIn: expires_in || 3600,
        expiresAt: new Date(this.tokenExpiresAt).toISOString()
      });

      return this.accessToken;
    } catch (error) {
      const status = error.response?.status;
      const data = error.response?.data;

      logger.error('[EmarsysOAuth2] Falha ao obter token', {
        status,
        error: error.message,
        responseData: data
      });

      // Limpar token inválido
      this.accessToken = null;
      this.tokenExpiresAt = null;

      throw new Error(`Falha na autenticação OAuth2: ${error.message}`);
    }
  }

  /**
   * Retorna headers de autenticação prontos para uso
   * @returns {Promise<Object>} Headers com Authorization Bearer
   */
  async getAuthHeaders() {
    const token = await this.getAccessToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Invalida o token em cache (força renovação na próxima chamada)
   */
  invalidateToken() {
    this.accessToken = null;
    this.tokenExpiresAt = null;
    logger.info('[EmarsysOAuth2] Token invalidado manualmente');
  }

  /**
   * Testa a conectividade com o token endpoint
   * @returns {Promise<Object>}
   */
  async testConnection() {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'OAuth2 não configurado',
        configured: false
      };
    }

    try {
      const token = await this.getAccessToken();
      return {
        success: true,
        configured: true,
        tokenEndpoint: this.tokenEndpoint,
        tokenValid: this.isTokenValid(),
        expiresAt: new Date(this.tokenExpiresAt).toISOString()
      };
    } catch (error) {
      return {
        success: false,
        configured: true,
        error: error.message,
        tokenEndpoint: this.tokenEndpoint
      };
    }
  }
}

module.exports = new EmarsysOAuth2Service();
