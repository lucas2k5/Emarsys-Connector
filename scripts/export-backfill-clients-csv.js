'use strict';

/**
 * Exporta para CSV os clientes enviados no backfill (15/05 a 19/05/2026).
 * Não envia ao webhook — apenas gera o arquivo.
 */

require('dotenv').config();

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const moment = require('moment-timezone');
const contactWebhookService = require('../services/contactWebhookService');

const TZ        = 'America/Sao_Paulo';
const PAGE_SIZE = 50;
const FROM_DATE = '2026-05-15T00:00:00.000Z';
const TO_DATE   = '2026-05-19T23:59:59.999Z';

const CL_FIELDS = [
  'id', 'email', 'firstName', 'lastName', 'document', 'phone', 'homePhone',
  'gender', 'isNewsletterOptIn', 'createdIn', 'updatedIn',
].join(',');
const AD_FIELDS = 'id,userId,street,number,complement,city,state,postalCode';

const baseUrl  = process.env.VTEX_BASE_URL_HOPE  || process.env.VTEX_BASE_URL;
const appKey   = process.env.VTEX_APP_KEY_HOPE   || process.env.VTEX_APP_KEY;
const appToken = process.env.VTEX_APP_TOKEN_HOPE || process.env.VTEX_APP_TOKEN;

const vtexHeaders = {
  'X-VTEX-API-AppKey':   appKey,
  'X-VTEX-API-AppToken': appToken,
  'Content-Type': 'application/json',
  'Accept':       'application/json',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, options, retries = 0) {
  try {
    return await axios.get(url, { ...options, timeout: 30000 });
  } catch (err) {
    const status = err.response?.status;
    if (status === 429) { await sleep(5000); return fetchWithRetry(url, options, retries); }
    if (status === 404) return null;
    if (retries < 3)   { await sleep(2000); return fetchWithRetry(url, options, retries + 1); }
    throw err;
  }
}

async function fetchClients() {
  const url    = `${baseUrl}/api/dataentities/CL/search`;
  const params = {
    _where:  `(updatedIn between ${FROM_DATE} AND ${TO_DATE}) OR (createdIn between ${FROM_DATE} AND ${TO_DATE})`,
    _fields: CL_FIELDS,
    _schema: 'cl',
    _sort:   'createdIn ASC',
  };
  const clients = [];
  let from = 1;
  while (true) {
    const to  = from + PAGE_SIZE - 1;
    const res = await fetchWithRetry(url, {
      headers: { ...vtexHeaders, 'REST-Range': `resources=${from}-${to}` },
      params,
    });
    if (!res || !Array.isArray(res.data) || res.data.length === 0) break;
    clients.push(...res.data);
    const total = parseInt(res.headers['rest-content-range']?.split('/')[1] || '0');
    if (!total || to >= total) break;
    from += PAGE_SIZE;
    await sleep(200);
  }
  return clients;
}

async function fetchAddress(clientId) {
  try {
    const res = await fetchWithRetry(`${baseUrl}/api/dataentities/AD/search`, {
      headers: { ...vtexHeaders, 'REST-Range': 'resources=1-5' },
      params: { _fields: AD_FIELDS, _where: `(userId=${clientId})` },
    });
    const list = res?.data;
    return Array.isArray(list) && list.length > 0 ? list[0] : null;
  } catch { return null; }
}

function escape(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  Export CSV — Clientes Backfill 15-19/05/2026        ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  console.log('🔄 Buscando clientes na VTEX...');
  const clients = await fetchClients();
  console.log(`   → ${clients.length} clientes encontrados\n`);

  const CONCURRENCY = 5;
  const rows = [];
  let done = 0;

  for (let i = 0; i < clients.length; i += CONCURRENCY) {
    const batch = clients.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (client) => {
        const address = await fetchAddress(client.id);
        return { client, address };
      })
    );
    for (const { client, address } of batchResults) {
      done++;
      process.stdout.write(`   Endereço [${done}/${clients.length}]...\r`);

      const cpf   = contactWebhookService.cleanDocument(client.document || '');
      const email = (client.email || '').toLowerCase().trim();
      if (!cpf && !email) continue;

      const addressStr = address?.street
        ? [address.street, address.number, address.complement].filter(Boolean).join(', ')
        : '';

      rows.push({
        customer_id: cpf || email,
        email,
        cpf,
        first_name:  client.firstName || '',
        last_name:   client.lastName  || '',
        phone:       contactWebhookService.normalizePhone(client.homePhone) || '',
        mobile:      contactWebhookService.normalizePhone(client.phone)     || '',
        gender:      contactWebhookService.normalizeGenderShort(client.gender) || '',
        address:     addressStr,
        city:        address?.city       || '',
        state:       address?.state      || '',
        postal_code: address?.postalCode || '',
        country:     24,
        opt_in:      client.isNewsletterOptIn === true ? 'true' : 'false',
        created_in:  client.createdIn || '',
        updated_in:  client.updatedIn || '',
      });
    }
    if (i + CONCURRENCY < clients.length) await sleep(200);
  }

  console.log('\n');

  // Gera CSV
  const headers = [
    'customer_id','email','cpf','first_name','last_name','phone','mobile',
    'gender','address','city','state','postal_code','country','opt_in',
    'created_in','updated_in'
  ];

  const timestamp = moment().tz(TZ).format('YYYY-MM-DD_HH-mm');
  const outPath   = path.join(__dirname, '..', 'tmp', `backfill-clients-15-19-maio-${timestamp}.csv`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h])).join(','));
  }
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

  console.log(`✅ CSV gerado: ${outPath}`);
  console.log(`   Linhas: ${rows.length} clientes`);
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
