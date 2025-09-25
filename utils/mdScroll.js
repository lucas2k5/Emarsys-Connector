const axios = require('axios');
const querystring = require('querystring');
const { normalizeVtexBaseUrl } = require('../utils/urlUtils');
const baseurlStable = 'https://piccadilly.vtexcommercestable.com.br';
async function scrollOrders(headers) {
  const baseUrl = normalizeVtexBaseUrl(baseurlStable);
  const entity = process.env.EMS_ORDERS_ENTITY_ID || 'emsOrdersV2';
  const params = {
    _where: 'isSync=false OR isSync="false"',
    _fields: 'id,order,item,isSync,timestamp',
    _sort: 'timestamp ASC',
    _page: '1',
    _perPage: '100'
  };

  // Monta o body urlencoded
  const data = querystring.stringify(params);

  try {
    const response = await axios({
      method: 'get',
      url: `${baseUrl}/api/dataentities/${entity}/scroll`,
      headers: {
        ...headers,
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data // aqui vai o body (axios aceita GET com body)
    });
    return response.data;
  } catch (error) {
    throw error;
  }
}

module.exports = { scrollOrders };