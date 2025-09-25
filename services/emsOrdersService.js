const axios = require('axios');
const path = require('path');
const OrderSyncHelper = require('../helpers/orderSyncHelper');

class EmsOrdersService {
  constructor() {
    this.vtexBaseUrl = process.env.VTEX_BASE_URL;
    this.entity = 'emsOrdersV2';
    this.exportsDir = path.join(__dirname, '..', 'exports');
    this.orderSyncHelper = new OrderSyncHelper(this.vtexBaseUrl, this.entity, () => this.getVtexHeaders());
  }

  getVtexHeaders() {
    return {
      'Accept': 'application/vnd.vtex.ds.v10+json',
      'Content-Type': 'application/json',
      'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
      'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
      'pragma': 'no-cache',
      'cache-control': 'max-age=0'
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
      const url = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/search`;
      
      // Busca por isSync=false (sempre false por padrão)
      const params = {
        _where: 'isSync=false',
        _fields: 'id,order,item,quantity,timestamp,price,customer_email,isSync',
        _size: 1000,
        _sort: 'timestamp ASC'
      };
      
      console.log('🔍 Buscando pedidos pendentes via data entities (isSync=false)...');
      
      const response = await axios.get(url, { 
        params, 
        headers: this.getVtexHeaders(), 
        timeout: 60000 
      });
      
      if (Array.isArray(response.data)) {
        console.log(`✅ ${response.data.length} pedidos pendentes encontrados (isSync=false)`);
        return response.data;
      }
      
      return [];
      
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos pendentes via data entities:', error.message);
      return [];
    }
  }

  /**
   * Verifica se um registro já existe na emsOrdersV2 com filtros específicos
   * @param {string} order - ID do pedido
   * @param {string} item - ID do item
   * @param {string} status - Status do pedido (opcional)
   * @returns {Promise<Object|null>} Registro existente ou null
   */
  async checkExistingRecord(order, item, status = null) {
    try {
      const searchUrl = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/search`;
      
      // Busca simplificada: apenas order + item (sem isSync para evitar problemas do Master Data V2)
      let whereClause = `order="${order}" AND item="${item}"`;
      if (status) {
        whereClause += ` AND order_status="${status}"`;
      }
      
      const params = {
        _where: whereClause,
        _fields: 'id,order,item,isSync,order_status',
        _size: 100
      };

      console.log(`🔍 Verificando se registro existe: order=${order} + item=${item} + status=${status}...`);
      console.log(`🔍 WHERE clause simplificada: ${whereClause}`);

      try {
        const searchRes = await axios.get(searchUrl, {
          params,
          headers: this.getVtexHeaders(),
          timeout: 30000
        });

        if (Array.isArray(searchRes.data) && searchRes.data.length > 0) {
          // Filtra apenas os que têm isSync=false (já que nunca será null)
          const pendingRecords = searchRes.data.filter(record => record.isSync === false);
          
          if (pendingRecords.length > 0) {
            const found = pendingRecords[0];
            console.log(`✅ Registro encontrado: ${found.id} (isSync: ${found.isSync}, status: ${found.order_status})`);
            return found;
          } else {
            console.log(`ℹ️ Registro encontrado mas já sincronizado: order=${order} + item=${item} (isSync: ${searchRes.data[0].isSync})`);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Erro na busca:`, error.message);
      }

      console.log(`ℹ️ Registro não encontrado: order=${order} + item=${item} + status=${status}`);
      
      // Busca alternativa sem filtro de status para debug
      const debugParams = {
        _where: `order="${order}" AND item="${item}"`,
        _fields: 'id,order,item,isSync,order_status',
        _size: 10
      };
      
      try {
        const debugRes = await axios.get(searchUrl, {
          params: debugParams,
          headers: this.getVtexHeaders(),
          timeout: 30000
        });
        
        if (Array.isArray(debugRes.data) && debugRes.data.length > 0) {
          console.log(`🔍 Registros encontrados sem filtro de status:`, debugRes.data.map(r => ({
            id: r.id,
            order: r.order,
            item: r.item,
            isSync: r.isSync,
            status: r.order_status
          })));
        }
      } catch (debugError) {
        console.log(`🔍 Erro na busca de debug:`, debugError.message);
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Erro ao verificar registro existente:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        order: order,
        item: item,
        status: status,
        url: `${this.vtexBaseUrl}/api/dataentities/${this.entity}/search`
      });
      return null;
    }
  }

  /**
   * Marca pedidos como sincronizados (isSync=true)
   * @param {Array} records - Array de registros para marcar como sincronizados
   * @returns {Object} Resultado da operação
   */
  async markAsSynced(records) {
    return await this.orderSyncHelper.markAsSynced(records);
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
