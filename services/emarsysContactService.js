const axios = require('axios');
const { generateWSSEHeaderFromEnv } = require('../utils/emarsysAuth');

class EmarsysService {
  constructor() {
    this.baseURL = 'https://api.emarsys.net/api/v2';
  }

  /**
   * Gera um novo header WSSE para cada requisição
   * @returns {string} Header WSSE atualizado
   */
  async generateAuthHeader() {
    try {
      console.log('🔐 Gerando novo token WSSE...');
      const wsseHeader = generateWSSEHeaderFromEnv();
      console.log('✅ Token WSSE gerado com sucesso');
      return wsseHeader;
    } catch (error) {
      throw new Error(`Erro na autenticação: ${error.message}`);
    }
  }

  /**
   * Cria ou atualiza um contato na Emarsys
   * @param {Object} contactData - Dados do contato
   * @returns {Object} Resposta da API
   */
  async createContact(contactData) {
    try {
      // Gera um novo header de autenticação para cada envio
      const wsseHeader = await this.generateAuthHeader();

      const payload = {
        key_id: '3', // Campo email como chave primária
        ...contactData
      };

      const response = await axios.post(
        `${this.baseURL}/contact`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-WSSE': wsseHeader
          }
        }
      );

      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
        status: error.response?.status || 500
      };
    }
  }

  /**
   * Busca um contato por email
   * @param {string} email - Email do contato
   * @returns {Object} Resposta da API
   */
  async getContactByEmail(email) {
    try {
      // Gera um novo header de autenticação para cada requisição
      const wsseHeader = await this.generateAuthHeader();

      const response = await axios.get(
        `${this.baseURL}/contact/email/${encodeURIComponent(email)}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-WSSE': wsseHeader
          }
        }
      );

      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
        status: error.response?.status || 500
      };
    }
  }

  /**
   * Atualiza um contato existente
   * @param {string} email - Email do contato
   * @param {Object} contactData - Dados para atualização
   * @returns {Object} Resposta da API
   */
  async updateContact(email, contactData) {
    try {
      // Gera um novo header de autenticação para cada requisição
      const wsseHeader = await this.generateAuthHeader();

      const payload = {
        key_id: '3',
        '3': email, // Campo email
        ...contactData
      };

      const response = await axios.put(
        `${this.baseURL}/contact`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-WSSE': wsseHeader
          }
        }
      );

      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
        status: error.response?.status || 500
      };
    }
  }
}

module.exports = new EmarsysService(); 