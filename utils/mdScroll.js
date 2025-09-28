const axios = require('axios');
const { normalizeVtexBaseUrl } = require('../utils/urlUtils');
const baseurlStable = 'https://piccadilly.vtexcommercestable.com.br';

async function scrollOrders(headers, customParams = {}) {
  const baseUrl = normalizeVtexBaseUrl(baseurlStable);
  const entity = process.env.EMS_ORDERS_ENTITY_ID || 'emsOrdersV2';

  const defaultParams = {
    _where: '(isSync=false)',
    _fields: 'id,order,item,isSync,order_status,timestamp',
    _sort: 'timestamp ASC',
    _page: 1,
    _perPage: 100
  };

  const params = { ...defaultParams, ...customParams};

  try {
    // Usa /search com paginação em vez de /scroll
    const response = await axios.get(`${baseUrl}/api/dataentities/${entity}/search`, {
      params,
      headers: {
        ...headers,
        'Accept': 'application/json'
      },
      timeout: 60000
    });
    return response.data;
  } catch (error) {
    throw error;
  }
}

module.exports = { scrollOrders };