'use strict';

/**
 * Serviço de sync delta de clientes VTEX Master Data → Webhook.
 *
 * Suporta Hope Lingerie e Hope Resort via factory interna.
 *
 * Fluxo por execução:
 *   1. Busca clientes atualizados no CL (entidade Customer List) via REST-Range
 *   2. Para cada cliente, busca o primeiro endereço na entidade AD
 *   3. Monta payload unificado (CL + AD) pronto para enviar ao webhook
 *
 * Paginação via header REST-Range (Master Data v10).
 * Total lido via header rest-content-range (formato: "resources {from}-{to}/{total}").
 */

require('dotenv').config();

const axios = require('axios');
const contactWebhookService = require('./contactWebhookService');

const PAGE_SIZE = 50;

const CL_FIELDS = [
  'id', 'email', 'firstName', 'lastName', 'document', 'phone', 'homePhone',
  'gender', 'birthDate', 'isNewsletterOptIn', 'createdIn', 'updatedIn',
].join(',');

const AD_FIELDS = 'id,userId,street,number,complement,neighborhood,city,state,country,postalCode,receiverName';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Cria um fetcher de clientes para uma loja específica.
 * @param {string} baseUrl
 * @param {string} appKey
 * @param {string} appToken
 * @param {string} clientType - 'hope' | 'resort'
 */
function createFetcher(baseUrl, appKey, appToken, clientType) {
  const vtexHeaders = {
    'X-VTEX-API-AppKey':   appKey,
    'X-VTEX-API-AppToken': appToken,
    'Content-Type':        'application/json',
    'Accept':              'application/json',
  };

  const tag = `[clients-sync:${clientType}]`;

  async function fetchWithRetry(url, options, retries = 0) {
    try {
      return await axios.get(url, { ...options, timeout: 30000 });
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        await sleep(5000);
        return fetchWithRetry(url, options, retries);
      }
      if (status === 404) return null;
      if (retries < 3) {
        await sleep(2000);
        return fetchWithRetry(url, options, retries + 1);
      }
      throw err;
    }
  }

  async function fetchClientAddress(clientId) {
    try {
      const res = await fetchWithRetry(`${baseUrl}/api/dataentities/AD/search`, {
        headers: { ...vtexHeaders, 'REST-Range': 'resources=1-5' },
        params: {
          _fields: AD_FIELDS,
          _where:  `(userId=${clientId})`,
        },
      });

      const addresses = res?.data;
      return (Array.isArray(addresses) && addresses.length > 0) ? addresses[0] : null;
    } catch (err) {
      console.warn(`${tag} Endereço não encontrado para ${clientId}`);
      return null;
    }
  }

  function mapToPayload(client, address) {
    const cpf   = contactWebhookService.cleanDocument(client.document || '');
    const email = (client.email || '').toLowerCase().trim();

    if (!cpf && !email) return null;
    const customer_id = cpf || email;

    const addressStr = address?.street
      ? [address.street, address.number, address.complement].filter(Boolean).join(', ')
      : null;

    return {
      customer_id,
      client_type:  clientType,
      email:        email || null,
      cpf:          cpf   || null,
      first_name:   client.firstName || null,
      last_name:    client.lastName  || null,
      phone:        contactWebhookService.normalizePhone(client.homePhone) || null,
      mobile:       contactWebhookService.normalizePhone(client.phone)     || null,
      gender:       contactWebhookService.normalizeGenderShort(client.gender) || null,
      address:      addressStr          || null,
      city:         address?.city       || null,
      state:        address?.state      || null,
      country:      24,
      postal_code:  address?.postalCode || null,
      opt_in:       client.isNewsletterOptIn === true,
    };
  }

  async function fetchUpdatedClients(sinceDate) {
    const url    = `${baseUrl}/api/dataentities/CL/search`;
    const now    = new Date().toISOString();
    const params = {
      _where:  `(updatedIn between ${sinceDate} AND ${now})`,
      _fields: CL_FIELDS,
      _schema: 'cl',
      _sort:   'updatedIn ASC',
    };

    const clients = [];
    let from = 1;

    while (true) {
      const to = from + PAGE_SIZE - 1;

      const res = await fetchWithRetry(url, {
        headers: { ...vtexHeaders, 'REST-Range': `resources=${from}-${to}` },
        params,
      });

      if (!res || !Array.isArray(res.data) || res.data.length === 0) break;

      clients.push(...res.data);

      // VTEX Master Data retorna o total no header rest-content-range
      // Formato: "resources {from}-{to}/{total}"
      const contentRange = res.headers['rest-content-range'];
      const total = parseInt(contentRange?.split('/')[1] || '0');
      if (!total || to >= total) break;

      from += PAGE_SIZE;
      await sleep(200);
    }

    return clients;
  }

  async function fetchDeltaClients(sinceDate) {
    if (!baseUrl || !appKey || !appToken) {
      throw new Error(`${tag} Credenciais VTEX não configuradas`);
    }

    const clients = await fetchUpdatedClients(sinceDate);
    if (clients.length === 0) return [];

    console.log(`${tag} ${clients.length} clientes → buscando endereços...`);

    const payloads = [];
    let skipped = 0;

    for (const client of clients) {
      const address = await fetchClientAddress(client.id);
      await sleep(150);

      const payload = mapToPayload(client, address);
      if (!payload) {
        skipped++;
        console.warn(`${tag} Sem CPF/email: ${client.id} — ignorando`);
        continue;
      }

      payloads.push(payload);
    }

    if (skipped > 0) {
      console.log(`${tag} ${skipped} clientes sem CPF/email ignorados`);
    }

    return payloads;
  }

  return { fetchDeltaClients };
}

// ─── Instâncias por loja ──────────────────────────────────────────────────────

const hope = createFetcher(
  process.env.VTEX_BASE_URL_HOPE  || process.env.VTEX_BASE_URL  || '',
  process.env.VTEX_APP_KEY_HOPE   || process.env.VTEX_APP_KEY   || '',
  process.env.VTEX_APP_TOKEN_HOPE || process.env.VTEX_APP_TOKEN || '',
  'hope'
);

const resort = createFetcher(
  process.env.VTEX_BASE_URL_RESORT  || '',
  process.env.VTEX_APP_KEY_RESORT   || '',
  process.env.VTEX_APP_TOKEN_RESORT || '',
  'resort'
);

module.exports = {
  fetchDeltaClients:       hope.fetchDeltaClients,
  fetchDeltaClientsResort: resort.fetchDeltaClients,
};
