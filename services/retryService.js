/**
 * Serviço de reprocessamento e retry para falhas de sincronização
 */

const fs = require('fs-extra');
const path = require('path');
const { getBrazilianTimestamp } = require('../utils/dateUtils');

class RetryService {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data');
    this.retryFile = path.join(this.dataDir, 'retry-queue.json');
    this.maxRetries = 3;
    this.retryDelay = 5 * 60 * 1000; // 5 minutos
  }

  /**
   * Adiciona uma falha à fila de reprocessamento
   * @param {Object} failureData - Dados da falha
   * @param {string} failureData.type - Tipo de falha (sync-orders, csv-generation, etc.)
   * @param {Object} failureData.payload - Payload da requisição
   * @param {Object} failureData.error - Erro que ocorreu
   * @param {string} failureData.timestamp - Timestamp da falha
   * @param {Object} failureData.context - Contexto adicional
   */
  async addToRetryQueue(failureData) {
    try {
      await this.ensureDataDirectory();
      
      let retryQueue = [];
      if (await fs.pathExists(this.retryFile)) {
        retryQueue = await fs.readJson(this.retryFile);
      }

      const retryItem = {
        id: `retry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: failureData.type,
        payload: failureData.payload,
        error: {
          message: failureData.error.message,
          stack: failureData.error.stack,
          code: failureData.error.code
        },
        timestamp: failureData.timestamp || getBrazilianTimestamp(),
        context: failureData.context || {},
        attempts: 0,
        maxAttempts: this.maxRetries,
        nextRetry: new Date(Date.now() + this.retryDelay).toISOString(),
        status: 'pending' // pending, processing, completed, failed
      };

      retryQueue.push(retryItem);
      await fs.writeJson(this.retryFile, retryQueue, { spaces: 2 });

      console.log(`🔄 Falha adicionada à fila de reprocessamento: ${retryItem.id}`);
      return retryItem.id;

    } catch (error) {
      console.error('❌ Erro ao adicionar à fila de retry:', error);
      throw error;
    }
  }

  /**
   * Processa a fila de retry
   */
  async processRetryQueue() {
    try {
      if (!await fs.pathExists(this.retryFile)) {
        return { processed: 0, failed: 0 };
      }

      const retryQueue = await fs.readJson(this.retryFile);
      const now = new Date();
      let processed = 0;
      let failed = 0;

      for (const item of retryQueue) {
        if (item.status === 'pending' && new Date(item.nextRetry) <= now) {
          try {
            console.log(`🔄 Processando retry: ${item.id} (tentativa ${item.attempts + 1}/${item.maxAttempts})`);
            
            item.status = 'processing';
            item.attempts++;
            item.lastAttempt = getBrazilianTimestamp();

            // Executa o reprocessamento baseado no tipo
            const result = await this.executeRetry(item);
            
            if (result.success) {
              item.status = 'completed';
              item.completedAt = getBrazilianTimestamp();
              processed++;
              console.log(`✅ Retry bem-sucedido: ${item.id}`);
            } else {
              if (item.attempts >= item.maxAttempts) {
                item.status = 'failed';
                item.failedAt = getBrazilianTimestamp();
                failed++;
                console.log(`❌ Retry falhou definitivamente: ${item.id}`);
              } else {
                item.status = 'pending';
                item.nextRetry = new Date(Date.now() + this.retryDelay).toISOString();
                console.log(`⏳ Retry reagendado: ${item.id} (próxima tentativa: ${item.nextRetry})`);
              }
            }

          } catch (error) {
            console.error(`❌ Erro no retry ${item.id}:`, error);
            item.status = 'failed';
            item.failedAt = getBrazilianTimestamp();
            failed++;
          }
        }
      }

      // Remove itens completados ou falhados definitivamente
      const activeQueue = retryQueue.filter(item => 
        item.status === 'pending' || item.status === 'processing'
      );

      await fs.writeJson(this.retryFile, activeQueue, { spaces: 2 });

      return { processed, failed, remaining: activeQueue.length };

    } catch (error) {
      console.error('❌ Erro ao processar fila de retry:', error);
      throw error;
    }
  }

  /**
   * Executa o reprocessamento baseado no tipo
   * @param {Object} retryItem - Item da fila de retry
   */
  async executeRetry(retryItem) {
    try {
      switch (retryItem.type) {
        case 'sync-orders':
          return await this.retrySyncOrders(retryItem);
        case 'csv-generation':
          return await this.retryCsvGeneration(retryItem);
        case 'emarsys-sync':
          return await this.retryEmarsysSync(retryItem);
        default:
          throw new Error(`Tipo de retry não suportado: ${retryItem.type}`);
      }
    } catch (error) {
      console.error(`❌ Erro no retry ${retryItem.type}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Retry para sincronização de pedidos
   * Usa a nova rota /api/background/cron-orders (com SQLite)
   */
  async retrySyncOrders(retryItem) {
    const axios = require('axios');
    
    try {
      // Usar a mesma lógica de baseUrl do cronService
      const isProduction = process.env.NODE_ENV === 'production';
      const baseUrl = isProduction && process.env.BASE_URL 
        ? process.env.BASE_URL 
        : `http://localhost:${process.env.PORT || 3000}`;
      
      const response = await axios({
        method: 'POST',
        url: `${baseUrl}/api/background/cron-orders`, // NOVA ROTA com SQLite
        data: retryItem.payload,
        timeout: 120000
      });

      return { success: response.status === 200, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Retry para geração de CSV
   */
  async retryCsvGeneration(retryItem) {
    const axios = require('axios');
    
    try {
      const response = await axios({
        method: 'GET',
        url: 'http://localhost:3000/api/integration/orders-extract-all',
        params: retryItem.payload,
        timeout: 120000
      });

      return { success: response.status === 200, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Retry para sincronização com Emarsys
   */
  async retryEmarsysSync(retryItem) {
    const axios = require('axios');
    
    try {
      const response = await axios({
        method: 'POST',
        url: 'http://localhost:3000/api/emarsys/sales/send-csv-file',
        data: retryItem.payload,
        timeout: 120000
      });

      return { success: response.status === 200, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtém estatísticas da fila de retry
   */
  async getRetryStats() {
    try {
      if (!await fs.pathExists(this.retryFile)) {
        return { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 };
      }

      const retryQueue = await fs.readJson(this.retryFile);
      
      return {
        total: retryQueue.length,
        pending: retryQueue.filter(item => item.status === 'pending').length,
        processing: retryQueue.filter(item => item.status === 'processing').length,
        completed: retryQueue.filter(item => item.status === 'completed').length,
        failed: retryQueue.filter(item => item.status === 'failed').length
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas de retry:', error);
      return { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 };
    }
  }

  /**
   * Limpa a fila de retry (remove itens antigos)
   */
  async cleanupRetryQueue(daysToKeep = 7) {
    try {
      if (!await fs.pathExists(this.retryFile)) {
        return { removed: 0 };
      }

      const retryQueue = await fs.readJson(this.retryFile);
      const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000));
      
      const activeQueue = retryQueue.filter(item => {
        const itemDate = new Date(item.timestamp);
        return itemDate > cutoffDate;
      });

      const removed = retryQueue.length - activeQueue.length;
      await fs.writeJson(this.retryFile, activeQueue, { spaces: 2 });

      console.log(`🧹 Limpeza da fila de retry: ${removed} itens removidos`);
      return { removed };

    } catch (error) {
      console.error('❌ Erro na limpeza da fila de retry:', error);
      throw error;
    }
  }

  /**
   * Garante que o diretório de dados existe
   */
  async ensureDataDirectory() {
    await fs.ensureDir(this.dataDir);
  }
}

module.exports = RetryService;
