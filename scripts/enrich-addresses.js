'use strict';

/**
 * Enriquece o CSV clients-com-cpf-nao-emarsys com endereços do VTEX Master Data AD.
 * Fluxo por cliente: CPF → GET CL (id) → GET AD (endereço)
 * Concorrência: 10 paralelas, retry automático em rate limit.
 *
 * Uso: node scripts/enrich-addresses.js
 * Saída: tmp/clients-com-cpf-nao-emarsys-enriched-{timestamp}.csv
 */

require('dotenv').config();

const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const BASE_URL  = process.env.VTEX_BASE_URL_HOPE  || process.env.VTEX_BASE_URL  || '';
const APP_KEY   = process.env.VTEX_APP_KEY_HOPE   || process.env.VTEX_APP_KEY   || '';
const APP_TOKEN = process.env.VTEX_APP_TOKEN_HOPE || process.env.VTEX_APP_TOKEN || '';

const CONCURRENCY = 10;
const VTEX_HEADERS = {
  'X-VTEX-API-AppKey':   APP_KEY,
  'X-VTEX-API-AppToken': APP_TOKEN,
  'Accept':              'application/vnd.vtex.ds.v10+json',
  'Content-Type':        'application/json',
};

const CSV_HEADERS = [
  'customer_id', 'client_type', 'email', 'cpf',
  'first_name', 'last_name', 'phone', 'mobile',
  'gender', 'address', 'city', 'state', 'country', 'postal_code', 'opt_in',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeField(value) {
  if (value === null || value === undefined || value === '') return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function vtexGet(url, params, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, { headers: VTEX_HEADERS, params, timeout: 30000 });
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 || status === 503) {
        const wait = attempt * 3000;
        await sleep(wait);
        continue;
      }
      return null;
    }
  }
  return null;
}

async function fetchCLIdByCpf(cpf) {
  const data = await vtexGet(`${BASE_URL}/api/dataentities/CL/search`, {
    _fields: 'id',
    _where: `document=${cpf}`,
    _size: 1,
  });
  return Array.isArray(data) && data.length > 0 ? data[0].id : null;
}

async function fetchAddress(clId) {
  const data = await vtexGet(`${BASE_URL}/api/dataentities/AD/search`, {
    _fields: 'street,number,complement,neighborhood,city,state,postalCode',
    _where:  `userId=${clId}`,
    _size:   1,
  });
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function enrichClient(row) {
  if (!row.cpf) return row;

  const clId = await fetchCLIdByCpf(row.cpf);
  if (!clId) return row;

  const addr = await fetchAddress(clId);
  if (!addr) return row;

  const addressStr = [addr.street, addr.number, addr.complement].filter(Boolean).join(', ');
  return {
    ...row,
    address:     addressStr || '',
    city:        addr.city        || '',
    state:       addr.state       || '',
    postal_code: (addr.postalCode || '').replace(/[^\d]/g, ''),
  };
}

async function processInBatches(rows, concurrency, onProgress) {
  const results = new Array(rows.length);
  let completed = 0;

  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(r => enrichClient(r)));
    for (let j = 0; j < settled.length; j++) {
      results[i + j] = settled[j].status === 'fulfilled' ? settled[j].value : batch[j];
      completed++;
    }
    onProgress(completed, rows.length);
    await sleep(100); // pequena pausa entre lotes
  }

  return results;
}

async function readCsv(filePath) {
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: 'utf8' }) });
  let headers = null;
  for await (const line of rl) {
    const cleanLine = line.replace(/^\uFEFF/, '');
    if (!headers) { headers = cleanLine.split(','); continue; }
    if (!cleanLine.trim()) continue;
    const values = cleanLine.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    rows.push(row);
  }
  return rows;
}

function writeRows(filePath, rows) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.write('\uFEFF');
    stream.write(CSV_HEADERS.join(',') + '\n');
    for (const row of rows) {
      stream.write(CSV_HEADERS.map(c => escapeField(row[c])).join(',') + '\n');
    }
    stream.end();
  });
}

(async () => {
  console.log('\n📍 Enriquecimento de endereços — clients-com-cpf-nao-emarsys\n');

  if (!BASE_URL || !APP_KEY || !APP_TOKEN) {
    console.error('❌ Credenciais VTEX não configuradas');
    process.exit(1);
  }

  const tmpDir = path.join(__dirname, '..', 'tmp');
  const inputFile = path.join(tmpDir, 'clients-com-cpf-nao-emarsys-137432.csv');

  if (!fs.existsSync(inputFile)) {
    console.error('❌ Arquivo não encontrado: ' + inputFile);
    process.exit(1);
  }

  console.log('   Lendo CSV...');
  const rows = await readCsv(inputFile);
  console.log(`   ${rows.length.toLocaleString('pt-BR')} clientes carregados`);
  console.log(`   Concorrência: ${CONCURRENCY} paralelas\n`);

  const startedAt = Date.now();
  let lastPct = -1;

  const enriched = await processInBatches(rows, CONCURRENCY, (done, total) => {
    const pct = Math.floor(done / total * 100);
    if (pct !== lastPct && pct % 5 === 0) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate    = done / elapsed;
      const remaining = Math.round((total - done) / rate);
      const eta = new Date(Date.now() + remaining * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      process.stdout.write(`\r   ${pct}% (${done.toLocaleString('pt-BR')}/${total.toLocaleString('pt-BR')}) — ${Math.round(rate)} req/s — ETA: ${eta}   `);
      lastPct = pct;
    }
  });

  const withAddr  = enriched.filter(r => r.address).length;
  const withoutAddr = enriched.length - withAddr;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile   = path.join(tmpDir, `clients-com-cpf-nao-emarsys-enriched-${timestamp}.csv`);

  console.log('\n\n   Gravando CSV...');
  await writeRows(outFile, enriched);

  const duration = ((Date.now() - startedAt) / 1000 / 60).toFixed(1);
  console.log(`\n✅ Concluído em ${duration} min`);
  console.log(`   Total:          ${enriched.length.toLocaleString('pt-BR')}`);
  console.log(`   Com endereço:   ${withAddr.toLocaleString('pt-BR')}`);
  console.log(`   Sem endereço:   ${withoutAddr.toLocaleString('pt-BR')}`);
  console.log(`   Arquivo: ${outFile}\n`);
})().catch(e => {
  console.error('\n❌ ERRO:', e.response?.data || e.message);
  process.exit(1);
});
