'use strict';

/**
 * Backfill de clientes VTEX → Webhook para um período específico.
 *
 * Uso:
 *   node scripts/backfill-clients.js --from 2026-05-15 --to 2026-05-19
 *
 * Busca clientes atualizados OU criados no período e envia ao webhook configurado.
 */

require('dotenv').config();

const axios   = require('axios');
const moment  = require('moment-timezone');
const contactWebhookService = require('../services/contactWebhookService');

const TZ        = process.env.CRON_TIMEZONE || 'America/Sao_Paulo';
const PAGE_SIZE = 50;

const CL_FIELDS = [
  'id', 'email', 'firstName', 'lastName', 'document', 'phone', 'homePhone',
  'gender', 'birthDate', 'isNewsletterOptIn', 'createdIn', 'updatedIn',
].join(',');

const AD_FIELDS = 'id,userId,street,number,complement,neighborhood,city,state,country,postalCode,receiverName';

// ─── Parse args ───────────────────────────────────────────────────────────────

function getArg(name) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

function parseArgs() {
  const from = getArg('--from');
  const to   = getArg('--to');

  if (!from || !to) {
    console.error('❌ Uso: node scripts/backfill-clients.js --from YYYY-MM-DD --to YYYY-MM-DD');
    process.exit(1);
  }

  const fromDate = moment.tz(from, 'YYYY-MM-DD', TZ).startOf('day').toISOString();
  const toDate   = moment.tz(to,   'YYYY-MM-DD', TZ).endOf('day').toISOString();

  return { fromDate, toDate };
}

// ─── VTEX helpers ─────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const baseUrl  = process.env.VTEX_BASE_URL_HOPE  || process.env.VTEX_BASE_URL;
const appKey   = process.env.VTEX_APP_KEY_HOPE   || process.env.VTEX_APP_KEY;
const appToken = process.env.VTEX_APP_TOKEN_HOPE || process.env.VTEX_APP_TOKEN;

const vtexHeaders = {
  'X-VTEX-API-AppKey':   appKey,
  'X-VTEX-API-AppToken': appToken,
  'Content-Type':        'application/json',
  'Accept':              'application/json',
};

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

async function fetchClients(fromDate, toDate) {
  const url    = `${baseUrl}/api/dataentities/CL/search`;
  const params = {
    _where:  `(updatedIn between ${fromDate} AND ${toDate}) OR (createdIn between ${fromDate} AND ${toDate})`,
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

    const contentRange = res.headers['rest-content-range'];
    const total = parseInt(contentRange?.split('/')[1] || '0');
    if (!total || to >= total) break;

    from += PAGE_SIZE;
    await sleep(200);
  }

  return clients;
}

function mapPayload(client, address) {
  const cpf   = contactWebhookService.cleanDocument(client.document || '');
  const email = (client.email || '').toLowerCase().trim();

  if (!cpf && !email) return null;

  const addressStr = address?.street
    ? [address.street, address.number, address.complement].filter(Boolean).join(', ')
    : null;

  return {
    customer_id: cpf || email,
    client_type: 'hope',
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!baseUrl || !appKey || !appToken) {
    console.error('❌ Credenciais VTEX não configuradas');
    process.exit(1);
  }

  const { fromDate, toDate } = parseArgs();

  const webhookUrl = process.env.CONTACTS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('❌ CONTACTS_WEBHOOK_URL não configurado');
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  Backfill — Clientes Hope → Webhook                 ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  De       : ${moment(fromDate).tz(TZ).format('DD/MM/YYYY HH:mm:ss')}`);
  console.log(`  Até      : ${moment(toDate).tz(TZ).format('DD/MM/YYYY HH:mm:ss')}`);
  console.log(`  Webhook  : ${webhookUrl}`);
  console.log(`  Modo     : 🚀 ENVIO REAL\n`);

  console.log('🔄 Buscando clientes na VTEX...');
  const clients = await fetchClients(fromDate, toDate);
  console.log(`   → ${clients.length} cliente(s) encontrado(s)\n`);

  if (clients.length === 0) {
    console.log('ℹ️  Nenhum cliente no período.');
    return;
  }

  // Monta payloads buscando endereços em paralelo (5 simultâneos)
  const CONCURRENCY = 5;
  const payloads = [];
  let skipped = 0;
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
      process.stdout.write(`   Endereço [${done}/${clients.length}] ${client.id}...\r`);
      const payload = mapPayload(client, address);
      if (!payload) { skipped++; continue; }
      payloads.push(payload);
    }
    if (i + CONCURRENCY < clients.length) await sleep(200);
  }

  console.log(`\n   → ${payloads.length} para enviar, ${skipped} descartados (sem CPF e sem email)\n`);

  // Envio ao webhook
  let sent   = 0;
  let errors = 0;

  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    process.stdout.write(`   Enviando [${i + 1}/${payloads.length}] ${payload.email || payload.customer_id}...\r`);

    try {
      const result = await contactWebhookService.sendContact(payload);
      if (result.success) {
        sent++;
      } else {
        errors++;
        console.log(`\n   ❌ Falha ${payload.email}: ${result.error}`);
      }
    } catch (err) {
      errors++;
      console.log(`\n   ❌ Erro ${payload.email}: ${err.message}`);
    }

    await sleep(100);
  }

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Total encontrado : ${clients.length}`);
  console.log(`  Enviados         : ${sent}`);
  console.log(`  Erros            : ${errors}`);
  console.log(`  Descartados      : ${skipped}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
