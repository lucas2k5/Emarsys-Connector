const axios = require('axios');
const path = require('path');
const { normalizeVtexBaseUrl } = require('../utils/urlUtils');

class EmsOrdersService {
  constructor() {
    this.vtexBaseUrl = normalizeVtexBaseUrl(process.env.VTEX_BASE_URL);
    this.entity = process.env.EMS_ORDERS_ENTITY_ID;
    this.exportsDir = path.join(__dirname, '..', 'exports');
  }

  /**
   * Codifica caracteres especiais na query _where para funcionar corretamente com a API
   * @param {string} whereClause - A cláusula where sem codificação
   * @returns {string} A cláusula where codificada
   */
  encodeWhereClause(whereClause) {
    return whereClause
      .replace(/=/g, '%3D')  // Codifica o caractere '=' para '%3D'
      .replace(/\(/g, '%28') // Codifica o caractere '(' para '%28'  
      .replace(/\)/g, '%29') // Codifica o caractere ')' para '%29'
      .replace(/\s+OR\s+/gi, '%20OR%20') // Codifica 'OR' com espaços
      .replace(/\s+AND\s+/gi, '%20AND%20'); // Codifica 'AND' com espaços
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
        const formBody = querystring.stringify({
          '_schema': this.entity,
          '_fields': 'id,order,item,isSync,order_status',
          '_sort': 'timestamp ASC',
          '_page': '1',
          '_perPage': '100'
        });

        const url = new URL(`https://hope.vtexcommercestable.com.br/api/dataentities/${this.entity}/search?isSync=false`);
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
   * @returns {Array} Array de pedidos pendentes
   */
  async listAllEmsOrdersV2() {
    try {
      console.log('🔍 Buscando pedidos com isSync=false via API customizada...');
      
      const url = `${this.vtexBaseUrl}/_v/orders/list`;
      const params = {
        _where: 'isSync%3Dfalse', // URL encoded: isSync=false (sem parênteses)
        page: 1,
        pageSize: 1000
      };
      
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
        'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
      };
      
      const response = await axios.get(url, {
        params,
        headers,
        timeout: 60000
      });
      
      const orders = Array.isArray(response.data) ? response.data : [];
      console.log(`✅ ${orders.length} pedidos com isSync=false encontrados`);
      
      return orders;
      
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos via API customizada:', error?.response?.data || error.message);
      return [];
    }
  }
}

module.exports = new EmsOrdersService();
