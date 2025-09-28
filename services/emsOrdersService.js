const axios = require('axios');
const path = require('path');
const { normalizeVtexBaseUrl } = require('../utils/urlUtils');

class EmsOrdersService {
  constructor() {
    this.vtexBaseUrl = normalizeVtexBaseUrl(process.env.VTEX_BASE_URL);
    this.entity = 'emsOrdersV2';
    this.exportsDir = path.join(__dirname, '..', 'exports');
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
      console.log('🔍 Buscando pedidos pendentes usando nova abordagem...');
      
      // Busca todos os pedidos primeiro
      const allOrders = await this.listAllEmsOrdersV2();
      
      // Filtra apenas os pendentes
      const pending = allOrders.filter(order => 
        order.isSync === false || order.isSync === null || order.isSync === undefined
      );
      
      console.log(`✅ ${pending.length} pendentes de ${allOrders.length} total`);
      return pending;
      
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos pendentes:', error?.data || error.message);
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
    const https = require('https');
    const querystring = require('querystring');
    const { URL } = require('url');
    return new Promise((resolve, reject) => {
      try {
        // Prepara options para enviar body urlencoded em requisição GET
        // const whereParts = [
        //   'isSync=false',
        //   `order="${order}"`
        // ];
        // if (item) {
        //   whereParts.push(`item="${item}"`);
        // }
        // if (status) {
        //   whereParts.push(`order_status="${status}"`);
        // }
        const formBody = querystring.stringify({
          '_schema': 'emsOrdersV2',
          '_fields': 'id,order,item,isSync,order_status',
          '_sort': 'timestamp ASC',
          '_page': '1',
          '_perPage': '100'
        });

        const url = new URL('https://piccadilly.vtexcommercestable.com.br/api/dataentities/emsOrdersV2/search?isSync=false');
        const headers = this.getVtexHeaders();

        const options = {
          hostname: url.hostname,
          path: url.pathname,
          method: 'GET',
          headers: {
            ...headers,
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(formBody)
          }
        };

        // Faz a requisição
        const req = https.request(options, (res) => {
          let data = '';

          // Coleta os dados da resposta
          res.on('data', (chunk) => {
            data += chunk;
          });

          // Quando a resposta terminar
          res.on('end', () => {
            try {
              const jsonData = JSON.parse(data);
              
              const items = Array.isArray(jsonData) ? jsonData : [];
              const found = items[0];
      
              if (found && found.id) {
                  console.log(`✅ Registro encontrado: ${found.id}`);
                  resolve(found);
                  return;                
              }
              resolve(null);
              
            } catch (parseError) {
              console.error('❌ checkExistingRecord | Erro de parse:', parseError.message);
              resolve(null);
            }
          });
        });

        // Trata erros de requisição
        req.on('error', (error) => {
          console.error('🚨🚨🚨 ERRO CRÍTICO - Falha na requisição 🚨🚨🚨');
          console.error('📋 Detalhes da falha:');
          console.error(`   🔍 order: ${order}`);
          console.error(`   ❌ message: ${error?.data || error.message}`);
          resolve(null);
        });

        // Não enviar body em GET
        req.end();

      } catch (error) {
        console.error('🚨🚨🚨 ERRO CRÍTICO - Falha na configuração 🚨🚨🚨');
        console.error(`📋 order: ${order}, item: ${item}, status: ${status}`);
        console.error(`❌ message: ${error?.data || error.message}`);
        resolve(null);
      }
    });
  }

  
  /**
   * Busca todos os pedidos e filtra pelos que precisam ser processados (isSync=false)
   * @param {string} startDate - Data inicial
   * @param {string} endDate - Data final
   * @returns {Object} Resultado da operação
   */
  async fetchAndStoreOrders(startDate, endDate) {
    try {
      console.log(`📅 Buscando pedidos de ${startDate} até ${endDate}...`);
      console.log('ℹ️ [INFO] Buscando todos os pedidos e filtrando por isSync');
      
      // Busca todos os pedidos da base
      const allOrders = await this.listAllEmsOrdersV2();
      
      // Filtra apenas os que precisam ser processados (isSync=false)
      const pendingOrders = allOrders.filter(order => 
        order.isSync === false || order.isSync === null || order.isSync === undefined
      );
      
      console.log(`✅ ${allOrders.length} pedidos encontrados, ${pendingOrders.length} pendentes de sincronização`);
      
      return {
        success: true,
        stored: pendingOrders.length,
        totalFound: allOrders.length,
        message: `Encontrados ${allOrders.length} pedidos, ${pendingOrders.length} pendentes`,
        pendingOrders: pendingOrders.slice(0, 5), // Mostra os primeiros 5 como exemplo
        allOrders: allOrders.length
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

  /**
   * Lista todos os pedidos da emsOrdersV2 (sem filtro de isSync)
   * @returns {Array} Array de todos os pedidos
   */
  async listAllEmsOrdersV2() {
    try {
      const url = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/search`;
      const perPage = 100;
      let page = 1;
      let fetched = 0;
      let pages = 0;
      const allOrders = [];
      
      console.log('🔍 Buscando todos os pedidos via data entities com paginação...');
      
      while (true) {
        const params = {
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
        if (items.length > 0) allOrders.push(...items);
        fetched += items.length;
        pages += 1;
        if (items.length < perPage) break;
        page += 1;
      }
      
      console.log(`✅ ${allOrders.length} pedidos encontrados (pages=${pages}, fetched=${fetched})`);
      return allOrders;
      
    } catch (error) {
      console.error('❌ Erro ao buscar todos os pedidos via data entities:', error?.data || error.message);
      return [];
    }
  }
}

module.exports = new EmsOrdersService();
