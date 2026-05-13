'use strict';

/**
 * Serviço de sync delta de clientes VTEX Master Data → Webhook.
 *
 * Fluxo por execução:
 *   1. Busca clientes atualizados no CL (entidade Customer List) via REST-Range
 *   2. Para cada cliente, busca o primeiro endereço na entidade AD
 *   3. Monta payload unificado (CL + AD) pronto para enviar ao webhook
 *
 * Paginação via header REST-Range (obrigatório no Master Data v10).
 */

require('dotenv').config();

const axios = require('axios');
const contactWebhookService = require('./contactWebhookService');

const BASE_URL  = process.env.VTEX_BASE_URL_HOPE  || process.env.VTEX_BASE_URL  || '';
const APP_KEY   = process.env.VTEX_APP_KEY_HOPE   || process.env.VTEX_APP_KEY   || '';
const APP_TOKEN = process.env.VTEX_APP_TOKEN_HOPE || process.env.VTEX_APP_TOKEN || '';

const CLIENT_TYPE = process.env.CONTACTS_WEBHOOK_CLIENT_TYPE || 'hope';
const PAGE_SIZE   = 50;

const CL_FIELDS = [
  'id', 'email', 'firstName', 'lastName', 'document', 'phone', 'homePhone',
  'gender', 'birthDate', 'isNewsletterOptIn', 'createdIn', 'updatedIn',
].join(',');

const AD_FIELDS = 'id,userId,street,number,complement,neighborhood,city,state,country,postalCode,receiverName';

const vtexHeaders = {
  'X-VTEX-API-AppKey':   APP_KEY,
  'X-VTEX-API-AppToken': APP_TOKEN,
  'Content-Type':        'application/json',
  'Accept':              'application/json',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

/**
 * Busca o primeiro endereço do cliente na entidade AD.
 * Retorna null se não encontrado ou em caso de erro (não bloqueia o envio).
 */
async function fetchClientAddress(clientId) {
  try {
    const res = await fetchWithRetry(`${BASE_URL}/api/dataentities/AD/search`, {
      headers: { ...vtexHeaders, 'REST-Range': 'resources=1-5' },
      params: {
        _fields: AD_FIELDS,
        _where:  `(userId=${clientId})`,
      },
    });

    const addresses = res?.data;
    return (Array.isArray(addresses) && addresses.length > 0) ? addresses[0] : null;
  } catch (err) {
    console.warn(`[clients-sync] Endereço não encontrado para ${clientId}`);
    return null;
  }
}

/**
 * Monta o payload unificado (CL + AD) para enviar ao webhook.
 * Retorna null se o cliente não tem CPF nem email (não pode gerar customer_id).
 */
function mapToPayload(client, address) {
  const cpf   = contactWebhookService.cleanDocument(client.document || '');
  const email = (client.email || '').toLowerCase().trim();

  const customer_id = contactWebhookService.generateCustomerId(cpf, email);
  if (!customer_id) return null;

  // Monta string de endereço a partir dos campos do AD
  const addressStr = address?.street
    ? [address.street, address.number, address.complement].filter(Boolean).join(', ')
    : null;

  return {
    customer_id,
    client_type:  CLIENT_TYPE,
    email:        email || null,
    cpf:          cpf   || null,
    first_name:   client.firstName || null,
    last_name:    client.lastName  || null,
    phone:        contactWebhookService.normalizePhone(client.homePhone) || null,  // homePhone = principal
    mobile:       contactWebhookService.normalizePhone(client.phone)     || null,  // phone = celular
    gender:       contactWebhookService.normalizeGenderShort(client.gender) || null,
    address:      addressStr         || null,
    city:         address?.city      || null,
    state:        address?.state     || null,
    country:      24,                                                               // fixo: 24 = Brasil
    postal_code:  address?.postalCode || null,
    opt_in:       client.isNewsletterOptIn === true,
  };
}

/**
 * Busca todos os clientes atualizados desde sinceDate no CL, com paginação REST-Range.
 */
async function fetchUpdatedClients(sinceDate) {
  const url    = `${BASE_URL}/api/dataentities/CL/search`;
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

    const contentRange = res.headers['content-range'];
    const total = parseInt(contentRange?.split('/')[1] || '0');
    if (!total || to >= total) break;

    from += PAGE_SIZE;
    await sleep(200);
  }

  return clients;
}

/**
 * Busca clientes atualizados desde sinceDate, enriquece com endereço AD e
 * retorna array de payloads prontos para enviar ao webhook.
 *
 * @param {string} sinceDate - ISO 8601 (ex: "2026-05-13T14:00:00.000Z")
 * @returns {Promise<Array>} Array de payloads prontos para o webhook
 */
async function fetchDeltaClients(sinceDate) {
  if (!BASE_URL || !APP_KEY || !APP_TOKEN) {
    throw new Error('[vtexClientService] Credenciais VTEX não configuradas');
  }

  const clients = await fetchUpdatedClients(sinceDate);
  if (clients.length === 0) return [];

  console.log(`[clients-sync] ${clients.length} clientes → buscando endereços...`);

  const payloads = [];
  let skipped = 0;

  for (const client of clients) {
    const address = await fetchClientAddress(client.id);
    await sleep(150); // respeitar rate limit entre chamadas AD

    const payload = mapToPayload(client, address);
    if (!payload) {
      skipped++;
      console.warn(`[clients-sync] Sem CPF/email: ${client.id} — ignorando`);
      continue;
    }

    payloads.push(payload);
  }

  if (skipped > 0) {
    console.log(`[clients-sync] ${skipped} clientes sem CPF/email ignorados`);
  }

  return payloads;
}

module.exports = { fetchDeltaClients };
