'use strict';

/**
 * Simulação do delta sync de clientes — SEM enviar ao webhook, SEM atualizar lastClientSync.json
 *
 * Uso:
 *   node scripts/simulate-clients-sync.js              # início do dia de hoje (meia-noite SP)
 *   node scripts/simulate-clients-sync.js --since 2h   # últimas 2 horas
 *   node scripts/simulate-clients-sync.js --since 30m  # últimos 30 minutos
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

// ─── Parse --since arg ────────────────────────────────────────────────────────

function parseSinceDate() {
  const sinceArg = process.argv.find(a => a.startsWith('--since'));
  if (sinceArg) {
    const val = sinceArg.includes('=') ? sinceArg.split('=')[1] : process.argv[process.argv.indexOf(sinceArg) + 1];
    if (val && val.endsWith('h')) {
      const hours = parseInt(val);
      return moment().tz(TZ).subtract(hours, 'hours').toISOString();
    }
    if (val && val.endsWith('m')) {
      const minutes = parseInt(val);
      return moment().tz(TZ).subtract(minutes, 'minutes').toISOString();
    }
  }
  // Padrão: início do dia de hoje no fuso SP
  return moment().tz(TZ).startOf('day').toISOString();
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

async function fetchClients(sinceDate) {
  const now    = new Date().toISOString();
  const url    = `${baseUrl}/api/dataentities/CL/search`;
  const params = {
    _where:  `(updatedIn between ${sinceDate} AND ${now}) OR (createdIn between ${sinceDate} AND ${now})`,
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
    _meta: {
      createdIn: client.createdIn,
      updatedIn: client.updatedIn,
    },
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!baseUrl || !appKey || !appToken) {
    console.error('❌ Credenciais VTEX não configuradas (VTEX_BASE_URL, VTEX_APP_KEY, VTEX_APP_TOKEN)');
    process.exit(1);
  }

  const sinceDate = parseSinceDate();
  const now       = new Date().toISOString();

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  Simulação — Delta Sync Clientes Hope                ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Período   : ${moment(sinceDate).tz(TZ).format('DD/MM/YYYY HH:mm:ss')} → agora`);
  console.log(`  Base URL  : ${baseUrl}`);
  console.log(`  Modo      : 🔍 SIMULAÇÃO (sem envio ao webhook)\n`);

  console.log('🔄 Buscando clientes na VTEX...');
  const clients = await fetchClients(sinceDate);
  console.log(`   → ${clients.length} cliente(s) encontrado(s)\n`);

  if (clients.length === 0) {
    console.log('ℹ️  Nenhum cliente no período. Tente --since 2h ou --since 24h');
    return;
  }

  const payloads  = [];
  let   skipped   = 0;

  for (let i = 0; i < clients.length; i++) {
    const client  = clients[i];
    process.stdout.write(`   [${i + 1}/${clients.length}] Buscando endereço de ${client.id}...\r`);
    const address = await fetchAddress(client.id);
    await sleep(150);

    const payload = mapPayload(client, address);
    if (!payload) { skipped++; continue; }
    payloads.push(payload);
  }

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Total encontrado : ${clients.length}`);
  console.log(`  Para enviar      : ${payloads.length}`);
  console.log(`  Descartados      : ${skipped} (sem CPF e sem email)`);
  console.log('═══════════════════════════════════════════════════════\n');

  payloads.forEach((p, i) => {
    console.log(`[${i + 1}] ${p.email || '(sem email)'} | CPF: ${p.cpf || '(sem cpf)'} | customer_id: ${p.customer_id}`);
    console.log(`     Nome: ${[p.first_name, p.last_name].filter(Boolean).join(' ') || '(sem nome)'}`);
    console.log(`     Endereço: ${p.address || '(sem endereço)'} — ${p.city || ''}/${p.state || ''}`);
    console.log(`     opt_in: ${p.opt_in} | gender: ${p.gender || 'null'} | phone: ${p.phone || 'null'}`);
    console.log(`     createdIn: ${p._meta.createdIn} | updatedIn: ${p._meta.updatedIn || 'null'}`);
    console.log();
  });
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
