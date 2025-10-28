const VtexOrdersService = require('../services/vtexOrdersService');
const vtexProductService = require('../services/vtexProductService');

/**
 * Serviço unificado para sincronização VTEX
 * Centraliza toda a lógica de sincronização removendo redundâncias
 */
class SyncService {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
  }

  /**
   * Executa sincronização apenas de pedidos
   */
  async executeOrdersSync() {
    try {
      console.log('📦 Iniciando sincronização de pedidos...');
      
      const vtexOrdersService = new VtexOrdersService();
      const result = await vtexOrdersService.syncOrders();
      
      if (result.success) {
        console.log(`✅ Sincronização de pedidos concluída: ${result.totalOrders || 0} pedidos - mica 2`);
      } else {
        console.error(`❌ Sincronização de pedidos falhou: ${result.error}`);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Erro na sincronização de pedidos:', error);
      return {
        success: false,
        error: error.message,
        totalOrders: 0
      };
    }
  }

  /**
   * Executa sincronização apenas de produtos
   */
  async executeProductsSync() {
    try {
      console.log('📋 Iniciando sincronização de produtos...');
      
      const result = await vtexProductService.syncProducts();
      
      if (result.success) {
        console.log(`✅ Sincronização de produtos concluída: ${result.totalProducts || 0} produtos`);
      } else {
        console.error(`❌ Sincronização de produtos falhou: ${result.error}`);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Erro na sincronização de produtos:', error);
      return {
        success: false,
        error: error.message,
        totalProducts: 0
      };
    }
  }

  /**
   * Gera CSV de produtos
   */
  async generateProductsCsv() {
    try {
      console.log('📄 Gerando CSV de produtos...');
      
      // Primeiro carregar produtos do arquivo
      const products = await vtexProductService.loadProductsFromFile();
      
      if (!products || products.length === 0) {
        return {
          success: false,
          error: 'Nenhum produto encontrado. Execute a sincronização de produtos primeiro.'
        };
      }
      
      // Gerar CSV com os produtos carregados
      const result = await vtexProductService.generateEmarsysProductCsv(products);
      
      return {
        success: true,
        message: 'CSV de produtos gerado com sucesso',
        ...result
      };
      
    } catch (error) {
      console.error('❌ Erro ao gerar CSV de produtos:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verifica se há sincronização em andamento
   */
  async checkRunningSync() {
    try {
      const lastProductSync = await vtexProductService.getLastSyncInfo();
      return lastProductSync && lastProductSync.isRunning;
    } catch (error) {
      // Ignora erro se não conseguir verificar
      return false;
    }
  }

  /**
   * Obtém status do serviço
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new SyncService();
