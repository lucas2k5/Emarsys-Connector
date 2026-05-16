'use strict';

/**
 * Extração complementar — Jul/2024 → Dez/2025 (slices 1-6 que falharam por rate limit).
 * Aguarda 10 min no início para garantir que as sessões anteriores expiraram na VTEX.
 *
 * Uso: node scripts/export-clients-missing2.js
 */

require('dotenv').config();

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');
const readline = require('readline');

const BASE_URL  = process.env.VTEX_BASE_URL_HOPE  || process.env.VTEX_BASE_URL  || '';
const APP_KEY   = process.env.VTEX_APP_KEY_HOPE   || process.env.VTEX_APP_KEY   || '';
const APP_TOKEN = process.env.VTEX_APP_TOKEN_HOPE || process.env.VTEX_APP_TOKEN || '';

const PAGE_SIZE = 1000;
const VTEX_HEADERS = {
  'X-VTEX-API-AppKey':   APP_KEY,
  'X-VTEX-API-AppToken': APP_TOKEN,
  'Accept':              'application/vnd.vtex.ds.v10+json',
  'Content-Type':        'application/json',
  'pragma':              'no-cache',
  'cache-control':       'max-age=0',
};

const CL_FIELDS = [
  'id', 'email', 'firstName', 'lastName', 'document', 'phone', 'homePhone',
  'gender', 'birthDate', 'isNewsletterOptIn', 'createdIn', 'updatedIn',
].join(',');

const CSV_HEADERS = [
  'customer_id', 'client_type', 'email', 'cpf',
  'first_name', 'last_name', 'phone', 'mobile',
  'gender', 'address', 'city', 'state', 'country', 'postal_code', 'opt_in',
];

// Fatias Jul/2024 → Dez/2025 (que falharam por rate limit)
const DATE_SLICES = [
  { from: '2024-07-01T00:00:00.000Z', to: '2024-09-30T23:59:59.999Z' },
  { from: '2024-10-01T00:00:00.000Z', to: '2024-12-31T23:59:59.999Z' },
  { from: '2025-01-01T00:00:00.000Z', to: '2025-03-31T23:59:59.999Z' },
  { from: '2025-04-01T00:00:00.000Z', to: '2025-06-30T23:59:59.999Z' },
  { from: '2025-07-01T00:00:00.000Z', to: '2025-09-30T23:59:59.999Z' },
  { from: '2025-10-01T00:00:00.000Z', to: '2025-12-31T23:59:59.999Z' },
];

const DELAY_BETWEEN_SLICES_MS = 6 * 60 * 1000; // 6 min entre fatias

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanDocument(doc) {
  if (!doc) return '';
  return String(doc).replace(/[^\d]/g, '');
}

function normalizePhone(phone) {
  if (!phone) return '';
  const clean = phone.trim().replace(/[^\d+]/g, '');
  if (clean.startsWith('+55')) return clean;
  if (clean.startsWith('55') && clean.length >= 12) return '+' + clean;
  if (clean.length >= 10) return '+55' + clean;
  return clean;
}

function normalizeGender(gender) {
  if (!gender) return '';
  const map = { male: 'M', female: 'F', masculino: 'M', feminino: 'F', m: 'M', f: 'F' };
  return map[String(gender).trim().toLowerCase()] || '';
}

function escapeField(value) {
  if (value === null || value === undefined || value === '') return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function mapToRow(client) {
  const cpf   = cleanDocument(client.document || '');
  const email = (client.email || '').toLowerCase().trim();
  const customer_id = cpf || email;
  if (!customer_id) return null;
  return {
    customer_id, client_type: 'hope',
    email: email || '', cpf: cpf || '',
    first_name: client.firstName || '', last_name: client.lastName || '',
    phone: normalizePhone(client.homePhone), mobile: normalizePhone(client.phone),
    gender: normalizeGender(client.gender),
    address: '', city: '', state: '', country: 24, postal_code: '',
    opt_in: client.isNewsletterOptIn === true,
  };
}

async function fetchScrollPage(token, fromDate, toDate) {
  const params = {
    _size: PAGE_SIZE, _fields: CL_FIELDS, _sort: 'createdIn ASC',
    _where: `(createdIn between ${fromDate} AND ${toDate})`,
  };
  if (token) params._token = token;
  const res = await axios.get(`${BASE_URL}/api/dataentities/CL/scroll`, {
    params, headers: VTEX_HEADERS, timeout: 120000,
  });
  return {
    records:   res.data || [],
    nextToken: res.headers['x-vtex-md-token'] || res.headers['x-vtex-page-token'] || null,
  };
}

async function processSlice(slice, sliceIndex) {
  const label = `[${slice.from.slice(0, 10)} → ${slice.to.slice(0, 10)}]`;
  process.stdout.write(`\n   Fatia ${sliceIndex + 1}/${DATE_SLICES.length} ${label} `);
  const rows = [];
  let token = null;

  while (true) {
    let result;
    try {
      result = await fetchScrollPage(token, slice.from, slice.to);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        process.stdout.write('(rate limit, aguardando 10s...)');
        await sleep(10000);
        continue;
      }
      const errMsg = err.response?.data?.Message || err.message;
      process.stdout.write(`\n     ⚠️  Erro: ${errMsg} — ${rows.length} registros salvos`);
      break;
    }
    const { records, nextToken } = result;
    if (!records || records.length === 0) break;
    for (const client of records) {
      const row = mapToRow(client);
      if (row) rows.push(row);
    }
    process.stdout.write('.');
    if (!nextToken) break;
    token = nextToken;
    await sleep(300);
  }

  process.stdout.write(` ${rows.length.toLocaleString('pt-BR')} clientes`);
  return rows;
}

async function loadExistingIds(csvPath) {
  const ids = new Set();
  if (!fs.existsSync(csvPath)) return ids;
  const rl = readline.createInterface({ input: fs.createReadStream(csvPath, { encoding: 'utf8' }) });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    const id = line.split(',')[0].replace(/^"/, '').replace(/"$/, '');
    if (id) ids.add(id);
  }
  return ids;
}

(async () => {
  console.log('\n📦 Extração complementar — Jul/2024 → Dez/2025 (fatias faltantes)\n');

  const tmpDir = path.join(__dirname, '..', 'tmp');
  const existingCsv = fs.readdirSync(tmpDir)
    .filter(f => f.startsWith('clients-full-') && f.endsWith('.csv'))
    .sort().pop();

  if (!existingCsv) {
    console.error('❌ Nenhum CSV existente encontrado em tmp/.');
    process.exit(1);
  }

  const existingPath = path.join(tmpDir, existingCsv);
  console.log(`   CSV existente: ${existingCsv} — carregando IDs para deduplicação...`);
  const existingIds = await loadExistingIds(existingPath);
  console.log(`   ${existingIds.size.toLocaleString('pt-BR')} customer_ids já existentes`);

  console.log('\n   ⏳ Aguardando 10 min para sessões VTEX anteriores expirarem...');
  await sleep(10 * 60 * 1000);

  const startedAt = Date.now();
  const allNewRows = [];

  for (let i = 0; i < DATE_SLICES.length; i++) {
    const rows = await processSlice(DATE_SLICES[i], i);
    allNewRows.push(...rows);
    if (i < DATE_SLICES.length - 1) {
      process.stdout.write(`\n   ⏳ Aguardando 6 min para sessão expirar na VTEX...`);
      await sleep(DELAY_BETWEEN_SLICES_MS);
    }
  }

  const newRows = allNewRows.filter(r => !existingIds.has(String(r.customer_id)));
  console.log(`\n\n   Novos únicos: ${newRows.length.toLocaleString('pt-BR')} de ${allNewRows.length.toLocaleString('pt-BR')} buscados`);

  const appendStream = fs.createWriteStream(existingPath, { flags: 'a', encoding: 'utf8' });
  for (const row of newRows) {
    appendStream.write(CSV_HEADERS.map(c => escapeField(row[c])).join(',') + '\n');
  }
  appendStream.end();

  const totalLines = existingIds.size + newRows.length;
  const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`✅ Concluído em ${duration}s`);
  console.log(`   Total final no CSV: ${totalLines.toLocaleString('pt-BR')} clientes`);
  console.log(`   Arquivo: ${existingPath}\n`);

  process.exit(0);
})().catch(e => {
  console.error('\n❌ ERRO:', e.response?.data || e.message);
  process.exit(1);
});
