require('dotenv').config({ debug: true });
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');


class EmarsysSalesService {
  constructor() {
    this.baseURL = process.env.EMARSYS_HAPI_URL;
    this.bearerToken = process.env.EMARSYS_BEARER_TOKEN;
    const defaultExports = process.env.VERCEL ? '/tmp/exports' : path.join(__dirname, '..', 'exports');
    this.exportsDir = process.env.EXPORTS_DIR || defaultExports;
  }

  getAuthToken() {
    if (!this.bearerToken) {
      throw new Error('SALES_DATA_TOKEN ou EMARSYS_SALES_TOKEN não configurado nas variáveis de ambiente');
    }
    return this.bearerToken;
  }

  /**
   * Busca o último arquivo CSV de orders gerado
   * @returns {Object|null} Informações do arquivo ou null se não encontrado
   */
  async getLatestOrdersCsvFile() {
    try {
      const files = await fs.readdir(this.exportsDir);
      
      const orderCsvFiles = files
        .filter(file => file.endsWith('.csv') && file.includes('orders-data'))
        .map(filename => {
          const filePath = path.join(this.exportsDir, filename);
          return { filename, filePath };
        })
        .sort((a, b) => {
          const timestampA = a.filename.match(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
          const timestampB = b.filename.match(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
          
          if (timestampA && timestampB) {
            return timestampB[0].localeCompare(timestampA[0]);
          }
          return b.filename.localeCompare(a.filename);
        });

      if (orderCsvFiles.length === 0) {
        console.log('📁 Nenhum arquivo CSV de orders encontrado no diretório exports');
        return null;
      }

      const latestFile = orderCsvFiles[0];
      const stats = await fs.stat(latestFile.filePath);
      
      console.log(`📄 Último arquivo CSV de orders encontrado: ${latestFile.filename}`);
      console.log('   SALES_DATA_TOKEN:', process.env.SALES_DATA_TOKEN);
      console.log(`📄 Tamanho: ${stats.size} bytes, Modificado: ${stats.mtime}`);
      
      return {
        ...latestFile,
        size: stats.size,
        modified: stats.mtime,
        content: null
      };
    } catch (error) {
      console.error('❌ Erro ao buscar último arquivo CSV:', error.message);
      return null;
    }
  }

  /**
   * Carrega o conteúdo de um arquivo CSV
   * @param {string} filePath - Caminho do arquivo
   * @returns {string} Conteúdo do arquivo
   */
  async loadCsvContent(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      console.log(`📄 Conteúdo CSV carregado: ${content.length} caracteres`);
      return content;
    } catch (error) {
      console.error('❌ Erro ao carregar conteúdo CSV:', error.message);
      throw error;
    }
  }

  /**
   * Envia um arquivo CSV específico para a Emarsys
   * @param {string} filename - Nome do arquivo CSV (opcional, usa o mais recente se não informado)
   * @returns {Object} Resultado do envio
   */
  async sendCsvFileToEmarsys(filename = null) {
    try {
      console.log('📤 [EmarsysSalesService] Enviando arquivo CSV para Emarsys...');
      
      const token = this.getAuthToken();
      console.log('🔑 Token: sendCsvFileToEmarsys', token);
      let csvFile;

      if (filename) {
        // Usa arquivo específico
        const filePath = path.join(this.exportsDir, filename);
        try {
          const stats = await fs.stat(filePath);
          csvFile = { filename, filePath, size: stats.size, modified: stats.mtime };
          console.log(`📄 Usando arquivo específico: ${filename}`);
        } catch (error) {
          throw new Error(`Arquivo não encontrado: ${filename}`);
        }
      } else {
        // Usa o arquivo mais recente
        csvFile = await this.getLatestOrdersCsvFile();
        if (!csvFile) {
          throw new Error('Nenhum arquivo CSV de orders encontrado');
        }
      }

      const csvContent = await this.loadCsvContent(csvFile.filePath);

      const response = await axios.post(this.baseURL, csvContent, {
        headers: {
          'Authorization': `bearer ${token}`,
          'Content-type': 'text/csv',
          'Accept': 'text/plain'
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60000
      });

      console.log('✅ Resposta da Emarsys recebida:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data
      });

      return {
        success: true,
        response: response.data,
        source: 'file',
        filename: csvFile.filename,
        csvSize: csvContent.length,
        fileSize: csvFile.size
      };
    } catch (error) {
      console.error('❌ Erro ao enviar arquivo CSV para Emarsys:');
      console.error('   🚨 Message:', error.message);
      
      return {
        success: false,
        error: error.response?.data || error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        filename: filename
      };
    }
  }

  /**
   * Envia apenas pedidos não sincronizados
   * @param {Array} orders - Array de pedidos
   * @returns {Object} Resultado do envio
   */
  async sendUnsyncedOrders(orders) {
    try {
      console.log('🔍 [EmarsysSalesService] Iniciando sendUnsyncedOrders...');
      console.log('📊 Total de pedidos recebidos:', orders.length);
      
      // Filtra apenas pedidos não sincronizados
      const unsyncedOrders = orders.filter(order => !order.isSync);
      console.log('📊 Pedidos não sincronizados:', unsyncedOrders.length);
      
      if (unsyncedOrders.length === 0) {
        console.log('ℹ️ Nenhum pedido não sincronizado encontrado');
        return {
          success: true,
          message: 'Nenhum pedido não sincronizado encontrado',
          total: 0,
          timestamp: new Date().toISOString()
        };
      }

      console.log(`🔄 Enviando ${unsyncedOrders.length} pedidos não sincronizados...`);
      console.log('📋 Primeiros 3 pedidos:', unsyncedOrders.slice(0, 3).map(o => ({
        order: o.order,
        customer_email: o.customer_email,
        item: o.item,
        isSync: o.isSync
      })));
      
      const result = await this.sendOrdersBatch(unsyncedOrders);
      
      console.log('📤 Resultado do sendOrdersBatch:', result);
      return result;

    } catch (error) {
      console.error('❌ Erro ao enviar pedidos não sincronizados:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

}

module.exports = new EmarsysSalesService(); 