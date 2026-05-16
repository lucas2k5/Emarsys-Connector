'use strict';

/**
 * Extração e append dos clientes de 2026 que faltaram no export full.
 * Corrige o bug de process.exit antes do stream fechar.
 *
 * Uso: node scripts/export-clients-2026.js
 */

require('dotenv').config();

const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');
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

async function loadExistingIds(csvPath) {
  const ids = new Set();
  const rl = readline.createInterface({ input: fs.createReadStream(csvPath, { encoding: 'utf8' }) });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    const id = line.split(',')[0].replace(/^\uFEFF/, '').replace(/^"/, '').replace(/"$/, '').trim();
    if (id) ids.add(id);
  }
  return ids;
}

function appendRows(filePath, rows) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
    stream.on('error', reject);
    stream.on('finish', resolve);
    for (const row of rows) {
      stream.write(CSV_HEADERS.map(c => escapeField(row[c])).join(',') + '\n');
    }
    stream.end();
  });
}

(async () => {
  console.log('\n📦 Extração 2026 — clientes que faltaram no export full\n');

  if (!BASE_URL || !APP_KEY || !APP_TOKEN) {
    console.error('❌ Credenciais VTEX não configuradas no .env');
    process.exit(1);
  }

  const tmpDir = path.join(__dirname, '..', 'tmp');
  const existingCsv = fs.readdirSync(tmpDir)
    .filter(f => f.startsWith('clients-full-') && f.endsWith('.csv'))
    .sort().pop();

  if (!existingCsv) {
    console.error('❌ Nenhum CSV existente encontrado em tmp/.');
    process.exit(1);
  }

  const existingPath = path.join(tmpDir, existingCsv);
  console.log(`   CSV: ${existingCsv}`);
  console.log(`   Carregando IDs existentes para deduplicação...`);
  const existingIds = await loadExistingIds(existingPath);
  console.log(`   ${existingIds.size.toLocaleString('pt-BR')} customer_ids carregados\n`);

  // Scroll: Jan 2026 → Dez 2026
  const FROM = '2026-01-01T00:00:00.000Z';
  const TO   = '2026-12-31T23:59:59.999Z';
  process.stdout.write(`   Buscando [2026-01-01 → 2026-12-31] `);

  const allRows = [];
  let token = null;

  while (true) {
    let result;
    try {
      result = await fetchScrollPage(token, FROM, TO);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        process.stdout.write('(rate limit, aguardando 10s...)');
        await sleep(10000);
        continue;
      }
      const errMsg = err.response?.data?.Message || err.message;
      process.stdout.write(`\n   ⚠️  Erro: ${errMsg} — encerrando com ${allRows.length} registros`);
      break;
    }
    const { records, nextToken } = result;
    if (!records || records.length === 0) break;
    for (const client of records) {
      const row = mapToRow(client);
      if (row) allRows.push(row);
    }
    process.stdout.write('.');
    if (!nextToken) break;
    token = nextToken;
    await sleep(300);
  }

  process.stdout.write(` ${allRows.length.toLocaleString('pt-BR')} clientes buscados\n`);

  const newRows = allRows.filter(r => !existingIds.has(String(r.customer_id)));
  console.log(`   Novos únicos: ${newRows.length.toLocaleString('pt-BR')} de ${allRows.length.toLocaleString('pt-BR')}`);

  if (newRows.length > 0) {
    console.log(`   Gravando no CSV...`);
    await appendRows(existingPath, newRows); // aguarda flush antes de encerrar
    console.log(`   ✅ Append concluído`);
  }

  const totalLines = existingIds.size + newRows.length;
  console.log(`\n   Total final estimado: ${totalLines.toLocaleString('pt-BR')} clientes`);
  console.log(`   Arquivo: ${existingPath}\n`);
})().catch(e => {
  console.error('\n❌ ERRO:', e.response?.data || e.message);
  process.exit(1);
});
