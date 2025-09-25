const axios = require('axios');
const path = require('path');
const OrderSyncHelper = require('../helpers/orderSyncHelper');
const { normalizeVtexBaseUrl } = require('../utils/urlUtils');

class EmsOrdersService {
  constructor() {
    this.vtexBaseUrl = normalizeVtexBaseUrl(process.env.VTEX_BASE_URL);
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
      const perPage = 100;
      let page = 1;
      let fetched = 0;
      let pages = 0;
      const pending = [];
      
      console.log('🔍 Buscando pedidos pendentes via data entities com paginação (_page/_perPage)...');
      
      while (true) {
        const params = {
          _where: 'isSync=false OR isSync="false" OR isSync IS NULL',
          _fields: 'id,order,item,quantity,timestamp,price,customer_email,isSync,order_status',
          _schema: this.entity,
          _page: page,
          _perPage: perPage,
          _sort: 'timestamp ASC'
        };
        
        const response = await axios.get(url, {
          params,
          headers: this.getVtexHeaders(),
          timeout: 60000
        });
        const items = Array.isArray(response.data) ? response.data : [];
        if (items.length > 0) pending.push(...items);
        fetched += items.length;
        pages += 1;
        if (items.length < perPage) break;
        page += 1;
      }
      
      console.log(`✅ ${pending.length} pendentes (pages=${pages}, fetched=${fetched})`);
      return pending;
      
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
  async checkExistingRecord(order, item, status) {
    try {
      const searchUrl = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/search`;
      
      // Busca direta e resiliente com where completo e paginação mínima
      const where = `order="${order}" AND item="${item}" AND (isSync=false OR isSync="false" OR isSync IS NULL)`;
      const params = {
        _where: where,
        _fields: 'id,order,item,isSync,order_status',
        _schema: this.entity,
        _page: 1,
        _perPage: 1
      };

      console.log(`🔍 Verificando registro pendente: order=${order} + item=${item} (status esperado: ${status || 'qualquer'})...`);

      const searchRes = await axios.get(searchUrl, {
        params,
        headers: this.getVtexHeaders(),
        timeout: 30000
      });

      const items = Array.isArray(searchRes.data) ? searchRes.data : [];
      const found = items[0];
      if (found && found.id) {
        if (status == null || status === undefined || found.order_status === status) {
          console.log(`✅ Registro encontrado: ${found.id} (isSync: ${found.isSync}, status: ${found.order_status})`);
          return found;
        }
      }

      console.log(`ℹ️ Registro não encontrado entre pendentes: order=${order} + item=${item} + status=${status}`);
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
    console.log('▶️ markAsSynced | Iniciando marcação de pedidos como sincronizados...');
    return await this.orderSyncHelper.markAsSynced(records, this.getVtexHeaders());
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
