const axios = require('axios');
const path = require('path');

class EmsOrdersService {
  constructor() {
    this.vtexBaseUrl = process.env.VTEX_BASE_URL;
    this.entity = 'emsOrdersV2';
    this.exportsDir = path.join(__dirname, '..', 'exports');
  }

  getVtexHeaders() {
    return {
      'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
      'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
      'Content-Type': 'application/json'
    };
  }

  getVtexAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'VtexIdclientAutCookie': process.env.VTEX_AUTH_TOKEN || process.env.VTEX_APP_TOKEN
    };
  }

  /**
   * [DEPRECATED] Os registros já existem na base, não precisa inserir novos
   * Este método agora apenas retorna sucesso pois os pedidos já estão na base
   * @param {Array} orders - Array de pedidos (não usado mais)
   * @returns {Object} Resultado da operação
   */
  async upsertEmsOrdersV2(orders) {
    console.log('ℹ️ [INFO] Registros já existem na base - não é necessário inserir novos pedidos');
    console.log(`ℹ️ [INFO] ${orders ? orders.length : 0} pedidos recebidos para processamento`);
    
    // Simula sucesso pois os registros já existem
    const orderIds = orders ? orders.map(order => order.order || order.orderId).filter(Boolean) : [];
    
    return { 
      success: true, 
      message: 'Registros já existem na base - apenas controle de isSync será feito',
      upserts: orderIds,
      skipped: true
    };
  }

  /**
   * Lista pedidos pendentes de sincronização (isSync=false)
   * @returns {Array} Array de pedidos pendentes
   */
  async listEmsOrdersV2PendingSync() {
    try {
      // Tenta primeiro usar a API de data entities (mais confiável)
      const url = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/search`;
      const params = {
        _where: 'isSync=false OR isSync=null',
        _fields: 'id,order,item,quantity,timestamp,price,customer_email,isSync',
        _size: 1000,
        _sort: 'timestamp ASC'
      };
      
      console.log('🔍 Buscando pedidos pendentes via data entities...');
      const response = await axios.get(url, { 
        params, 
        headers: this.getVtexHeaders(), 
        timeout: 60000 
      });
      
      if (Array.isArray(response.data)) {
        console.log(`✅ ${response.data.length} pedidos pendentes encontrados via data entities`);
        return response.data;
      }
      
      return [];
      
    } catch (error) {
      console.warn('⚠️ Erro ao buscar via data entities, tentando endpoint customizado:', error.message);
      
      // Fallback: tenta usar o endpoint customizado
      try {
        const url = `${this.vtexBaseUrl}/_v/orders/search`;
        const params = {
          isSync: false,
          _size: 1000,
          _sort: 'timestamp ASC'
        };
        
        console.log('🔍 Tentando buscar via endpoint customizado...');
        const response = await axios.get(url, { 
          params, 
          headers: this.getVtexAuthHeaders(), 
          timeout: 60000 
        });
        
        if (Array.isArray(response.data)) {
          console.log(`✅ ${response.data.length} pedidos pendentes encontrados via endpoint customizado`);
          return response.data;
        }
        
        return [];
      } catch (fallbackError) {
        console.warn('⚠️ Ambos os endpoints falharam, retornando array vazio:', fallbackError.message);
        return [];
      }
    }
  }

  /**
   * Marca pedidos como sincronizados (isSync=true)
   * @param {Array} records - Array de registros para marcar como sincronizados
   * @returns {Object} Resultado da operação
   */
  async markAsSynced(records) {
    let updated = 0;
    
    for (const rec of records) {
      if (!rec.id && !rec.order) continue;
      
      try {
        // Prioriza usar API de data entities (mais confiável)
        if (rec.id) {
          const baseDocsUrl = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/documents`;
          await axios.patch(`${baseDocsUrl}/${rec.id}`, { isSync: true }, { 
            headers: this.getVtexHeaders(), 
            timeout: 20000 
          });
          updated += 1;
          console.log(`✅ Pedido ${rec.order || rec.id} marcado como sincronizado via data entities`);
          continue;
        }
        
        // Fallback: tenta usar endpoint customizado
        if (rec.order) {
          const updateUrl = `${this.vtexBaseUrl}/_v/orders/${rec.order}`;
          const updateBody = { isSync: true };
          
          const response = await axios.patch(updateUrl, updateBody, { 
            headers: this.getVtexAuthHeaders(), 
            timeout: 20000 
          });
          
          if (response.status >= 200 && response.status < 300) {
            updated += 1;
            console.log(`✅ Pedido ${rec.order} marcado como sincronizado via endpoint customizado`);
          }
        }
      } catch (err) {
        console.warn(`⚠️ Erro ao marcar pedido ${rec.order || rec.id} como sincronizado:`, err.response?.data || err.message);
      }
    }
    
    return { success: true, updated };
  }

  /**
   * Processa pedidos pendentes e envia para Emarsys
   * @param {Object} options - Opções de processamento
   * @returns {Object} Resultado do processamento
   */
  async processPendingOrders(options = {}) {
    try {
      console.log('🔄 Iniciando processamento de pedidos pendentes...');
      
      // 1. Lista pedidos pendentes
      const pending = await this.listEmsOrdersV2PendingSync();
      if (!pending.length) {
        return { success: true, message: 'Sem pedidos pendentes para enviar', sent: 0 };
      }
      
      console.log(`📊 ${pending.length} pedidos pendentes encontrados`);
      
      // 2. Envia para Emarsys usando o serviço existente
      const emarsysSalesService = require('./emarsysSalesService');
      const result = await emarsysSalesService.sendUnsyncedOrders(pending);
      
      // 3. Se o envio foi bem-sucedido, marca como sincronizados
      if (result.success && result.total > 0) {
        await this.markAsSynced(pending);
        console.log(`✅ ${pending.length} pedidos marcados como sincronizados`);
      }
      
      return {
        success: result.success,
        sent: result.total || 0,
        failed: result.failed || 0,
        message: result.message || 'Processamento concluído',
        details: result
      };
      
    } catch (error) {
      console.error('❌ Erro ao processar pedidos pendentes:', error);
      return {
        success: false,
        error: error.message,
        sent: 0,
        failed: 0
      };
    }
  }

  /**
   * Reprocessa pedidos não enviados (força reprocessamento)
   * @param {Object} options - Opções de reprocessamento
   * @returns {Object} Resultado do reprocessamento
   */
  async reprocessUnsentOrders(options = {}) {
    try {
      console.log('🔄 Iniciando reprocessamento de pedidos não enviados...');
      
      // 1. Lista todos os pedidos com isSync=false
      const unsent = await this.listEmsOrdersV2PendingSync();
      if (!unsent.length) {
        return { success: true, message: 'Nenhum pedido não enviado encontrado', processed: 0 };
      }
      
      console.log(`📊 ${unsent.length} pedidos não enviados encontrados`);
      
      // 2. Envia para Emarsys
      const emarsysSalesService = require('./emarsysSalesService');
      const result = await emarsysSalesService.sendUnsyncedOrders(unsent);
      
      // 3. Marca como sincronizados se o envio foi bem-sucedido
      if (result.success && result.total > 0) {
        await this.markAsSynced(unsent);
        console.log(`✅ ${unsent.length} pedidos reprocessados e marcados como sincronizados`);
      }
      
      return {
        success: result.success,
        processed: result.total || 0,
        failed: result.failed || 0,
        message: result.message || 'Reprocessamento concluído',
        details: result
      };
      
    } catch (error) {
      console.error('❌ Erro ao reprocessar pedidos:', error);
      return {
        success: false,
        error: error.message,
        processed: 0,
        failed: 0
      };
    }
  }

  /**
   * Busca pedidos por período (registros já existem na base)
   * @param {string} startDate - Data inicial
   * @param {string} endDate - Data final
   * @returns {Object} Resultado da operação
   */
  async fetchAndStoreOrders(startDate, endDate) {
    try {
      console.log(`📅 Buscando pedidos de ${startDate} até ${endDate}...`);
      console.log('ℹ️ [INFO] Registros já existem na base - apenas listando pedidos pendentes');
      
      // Busca pedidos pendentes diretamente da base existente
      const pendingOrders = await this.listEmsOrdersV2PendingSync();
      
      console.log(`✅ ${pendingOrders.length} pedidos pendentes encontrados na base existente`);
      
      return {
        success: true,
        stored: pendingOrders.length,
        totalFound: pendingOrders.length,
        message: 'Pedidos já existem na base - listando pendentes',
        pendingOrders: pendingOrders.slice(0, 2) // Mostra apenas os primeiros 2 como exemplo
      };
      
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos:', error);
      return {
        success: false,
        error: error.message,
        stored: 0
      };
    }
  }
}

module.exports = new EmsOrdersService();
