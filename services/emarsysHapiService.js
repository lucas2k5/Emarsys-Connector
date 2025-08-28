const axios = require('axios');
const fs = require('fs/promises');
require('dotenv').config();

class EmarsysHapiService {
  constructor() {
    this.baseUrl = process.env.HAPI_URL;
    this.token = process.env.SALES_DATA_TOKEN || process.env.EMARSYS_SALES_TOKEN;
    this.merchantId = process.env.EMARSYS_MERCHANT_ID;
    this.headers = {
      'Accept': 'text/plain',
      'Authorization': 'Bearer ' + this.token,
      'Content-type': 'text/csv'
    };

    this.client = axios.create({ headers: this.headers });

    this._initializeAxiosRetry();

    this._initError = null;
    if (!this.baseUrl || !/^https?:\/\//i.test(this.baseUrl)) {
      this._initError = `HAPI_URL inválida ou ausente: "${this.baseUrl}"`;
    } else if (!this.token) {
      this._initError = `SALES_DATA_TOKEN ausente`;
    }
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
   * Envia arquivo de dados de vendas para Emarsys via HAPI
   * @param {string} filePath - Caminho do arquivo local
   * @returns {Promise<Object>} Resultado do envio
   */
  async uploadSalesDataFile(filePath) {
    try {
      if (this._initError) {
        return { success: false, error: this._initError };
      }

      // Check if file exists
      await fs.access(filePath);
      
      // Get file stats
      const stats = await fs.stat(filePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      
      const path = require('path');
      const absolutePath = path.resolve(filePath);
      console.log(`📁 File: ${absolutePath}`);
      console.log(`📊 Size: ${fileSizeInMB.toFixed(2)} MB`);

      const fileContent = await fs.readFile(filePath);
      let base = this.baseUrl.replace(/\/$/, '');
      if (base.endsWith('/hapi')) base = base.slice(0, -5);
      const fullUrl = `${base}/hapi/merchant/${this.merchantId}/sales-data/api`;

      const response = await this.client.post(fullUrl, fileContent, {
        headers: this.headers,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60000
      });
      
      console.log('🎯 RESPOSTA EMARSYS /sales-data api RECEBIDA:');
      console.log('   📊 Status: ' + response.status);
      console.log('   🌐 URL: ' + fullUrl);
      console.log('   📄 Dados: ' + JSON.stringify(response.data));
      
      return { 
        success: true, 
        data: response.data, 
        url: fullUrl,
        filePath: absolutePath,
        fileSize: fileSizeInMB.toFixed(2),
        message: 'Sales data upload completed successfully'
      };
    } catch (error) {
      // Normaliza erro para evitar [object Object]
      const status = error.response?.status;
      const data = error.response?.data;
      const code = error.code;
      const msg = error.message;
      const details = {
        status,
        code,
        message: msg,
        response: typeof data === 'string' ? data : (data ? JSON.stringify(data) : undefined)
      };
      console.log('🚨 ERRO EMARSYS HAPI:');
      console.log('   📊 Status: ' + (status || 'N/A'));
      console.log('   🔗 Código: ' + (code || 'N/A'));
      console.log('   📝 Mensagem: ' + msg);
      console.log('   📄 Resposta: ' + (details.response || 'N/A'));
      
      return { success: false, error: JSON.stringify(details) };
    }
  }

  async testConnection() {
    try {
      if (this._initError) {
        return { success: false, error: this._initError };
      }
      let base = this.baseUrl.replace(/\/$/, '');
      if (base.endsWith('/hapi')) base = base.slice(0, -5);
      const url = `${base}/hapi/merchant/${this.merchantId}/sales-data/api/status`;
      const response = await this.client.get(url);
      return { success: true, data: response.data };
    } catch (error) {
      const errorMsg = error.response?.data || error.message || 'Erro desconhecido';
      return { success: false, error: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg) };
    }
  }
}

module.exports = EmarsysHapiService; 