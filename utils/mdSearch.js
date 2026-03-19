const axios = require('axios');
//const { normalizeVtexBaseUrl } = require('../utils/urlUtils');
const baseurlStable = 'https://hope.vtexcommercestable.com.br/api/dataentities';

/**
 * Codifica caracteres especiais na query _where para funcionar corretamente com a API
 * @param {string} whereClause - A cláusula where sem codificação
 * @returns {string} A cláusula where codificada
 */
function encodeWhereClause(whereClause) {
  return whereClause
    .replace(/=/g, '%3D')  // Codifica o caractere '=' para '%3D'
    .replace(/\(/g, '%28') // Codifica o caractere '(' para '%28'  
    .replace(/\)/g, '%29'); // Codifica o caractere ')' para '%29'
}

async function searchOrders(headers, customParams = {}) {
  const baseUrl = baseurlStable;
  const entity = process.env.EMS_ORDERS_ENTITY_ID;

  const defaultParams = {
    _where: encodeWhereClause('(isSync=false)'), // Codifica caracteres especiais para funcionar corretamente
    _fields: 'id,order,item,isSync,order_status,timestamp',
    _sort: 'timestamp ASC',
    _page: 1,
    _perPage: 100
  };

  const params = { ...defaultParams, ...customParams};

  try {
    // Usa /search com paginação em vez de /search
    const response = await axios.get(`${baseUrl}/${entity}/search`, {
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

module.exports = { searchOrders };