'use strict';

/**
 * Extração full de clientes VTEX Master Data CL → CSV.
 * USO ÚNICO / ANÁLISE INTERNA — não envia nada para o webhook.
 *
 * Divide a extração em fatias semestrais (createdIn) para contornar
 * o limite de sessão da API de scroll da VTEX (~400k registros por sessão).
 * Endereços (AD) omitidos — inviável para 700k+ clientes.
 *
 * Uso: node scripts/export-clients-full.js
 * Saída: tmp/clients-full-{timestamp}.csv
 */

require('dotenv').config();

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

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

// 3 fatias grandes — cada uma roda uma sessão de scroll sequencial
// Aguarda 3 minutos entre fatias para a sessão anterior expirar na VTEX
const DATE_SLICES = [
  { from: '2015-01-01T00:00:00.000Z', to: '2022-12-31T23:59:59.999Z' },
  { from: '2023-01-01T00:00:00.000Z', to: '2024-06-30T23:59:59.999Z' },
  { from: '2024-07-01T00:00:00.000Z', to: '2026-12-31T23:59:59.999Z' },
];
const DELAY_BETWEEN_SLICES_MS = 3 * 60 * 1000; // 3 minutos

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanDocument(doc) {
  if (!doc && doc !== 0) return '';
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
    customer_id,
    client_type:  'hope',
    email:        email || '',
    cpf:          cpf   || '',
    first_name:   client.firstName || '',
    last_name:    client.lastName  || '',
    phone:        normalizePhone(client.homePhone),
    mobile:       normalizePhone(client.phone),
    gender:       normalizeGender(client.gender),
    address:      '',
    city:         '',
    state:        '',
    country:      24,
    postal_code:  '',
    opt_in:       client.isNewsletterOptIn === true,
  };
}

async function fetchScrollPage(token, fromDate, toDate) {
  const params = {
    _size:   PAGE_SIZE,
    _fields: CL_FIELDS,
    _sort:   'createdIn ASC',
    _where:  `(createdIn between ${fromDate} AND ${toDate})`,
  };
  if (token) params._token = token;

  const res = await axios.get(`${BASE_URL}/api/dataentities/CL/scroll`, {
    params,
    headers: VTEX_HEADERS,
    timeout: 120000,
  });

  return {
    records:   res.data || [],
    nextToken: res.headers['x-vtex-md-token'] || res.headers['x-vtex-page-token'] || null,
  };
}

async function processSlice(slice, writeStream, sliceIndex) {
  const label = `[${slice.from.slice(0, 10)} → ${slice.to.slice(0, 10)}]`;
  process.stdout.write(`\n   Fatia ${sliceIndex + 1}/${DATE_SLICES.length} ${label} `);

  let token   = null;
  let fetched = 0;
  let written = 0;
  let skipped = 0;
  let page    = 0;

  while (true) {
    page++;

    let result;
    try {
      result = await fetchScrollPage(token, slice.from, slice.to);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        process.stdout.write('(rate limit, aguardando 6s...)');
        await sleep(6000);
        continue;
      }
      // Internal error da VTEX no meio do scroll — encerra a fatia com o que foi coletado
      const errMsg = err.response?.data?.Message || err.message;
      process.stdout.write(`\n     ⚠️  Erro na pág ${page}: ${errMsg} — encerrando fatia com ${fetched} registros`);
      break;
    }

    const { records, nextToken } = result;
    if (!records || records.length === 0) break;

    for (const client of records) {
      fetched++;
      const row = mapToRow(client);
      if (!row) { skipped++; continue; }
      writeStream.write(CSV_HEADERS.map(c => escapeField(row[c])).join(',') + '\n');
      written++;
    }

    process.stdout.write('.');

    if (!nextToken) break;
    token = nextToken;
    await sleep(300);
  }

  process.stdout.write(` ${fetched.toLocaleString('pt-BR')} clientes`);
  return { fetched, written, skipped };
}

(async () => {
  console.log('\n📦 Extração full — VTEX Master Data CL — Hope Lingerie');
  console.log('   Endereços (AD) omitidos. Scroll por fatias semestrais.\n');

  if (!BASE_URL || !APP_KEY || !APP_TOKEN) {
    console.error('❌ Credenciais VTEX não configuradas no .env');
    process.exit(1);
  }

  const tmpDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile   = path.join(tmpDir, `clients-full-${timestamp}.csv`);

  const writeStream = fs.createWriteStream(outFile, { encoding: 'utf8' });
  writeStream.write('\uFEFF'); // BOM UTF-8
  writeStream.write(CSV_HEADERS.join(',') + '\n');

  const startedAt = Date.now();
  let totalFetched = 0;
  let totalWritten = 0;
  let totalSkipped = 0;

  for (let i = 0; i < DATE_SLICES.length; i++) {
    const { fetched, written, skipped } = await processSlice(DATE_SLICES[i], writeStream, i);
    totalFetched += fetched;
    totalWritten += written;
    totalSkipped += skipped;
    if (i < DATE_SLICES.length - 1) {
      process.stdout.write(`\n   ⏳ Aguardando ${DELAY_BETWEEN_SLICES_MS / 60000} min para sessão de scroll expirar na VTEX...`);
      await sleep(DELAY_BETWEEN_SLICES_MS);
    }
  }

  writeStream.end();

  const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n\n✅ Concluído em ${duration}s`);
  console.log(`   Clientes buscados:  ${totalFetched.toLocaleString('pt-BR')}`);
  console.log(`   Linhas no CSV:      ${totalWritten.toLocaleString('pt-BR')}`);
  console.log(`   Ignorados (s/id):   ${totalSkipped.toLocaleString('pt-BR')}`);
  console.log(`   Arquivo: ${outFile}\n`);

  process.exit(0);
})().catch(e => {
  console.error('\n❌ ERRO fatal:', e.response?.data || e.message);
  process.exit(1);
});
