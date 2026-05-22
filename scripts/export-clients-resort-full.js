'use strict';

/**
 * Extração full — Hope Resort (lojahr) — VTEX Master Data CL + AD → CSV.
 * Duas fases separadas:
 *   Fase 1 — scroll CL rápido (sem AD) → tmp/resort-cl-raw-{ts}.json
 *   Fase 2 — enriquecimento AD por lotes → tmp/clients-resort-full-{ts}.csv
 *
 * Uso: node scripts/export-clients-resort-full.js
 */

require('dotenv').config();

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const BASE_URL  = process.env.RESORT_VTEX_BASE_URL  || '';
const APP_KEY   = process.env.RESORT_VTEX_APP_KEY   || '';
const APP_TOKEN = process.env.RESORT_VTEX_APP_TOKEN || '';

if (!BASE_URL || !APP_KEY || !APP_TOKEN) {
  console.error('❌ Credenciais Resort não configuradas');
  process.exit(1);
}

const PAGE_SIZE      = 1000;
const AD_CONCURRENCY = 20;   // alto para compensar latência do lojahr
const AD_DELAY_MS    = 100;

const VTEX_HEADERS = {
  'X-VTEX-API-AppKey':   APP_KEY,
  'X-VTEX-API-AppToken': APP_TOKEN,
  'Accept':              'application/vnd.vtex.ds.v10+json',
  'Content-Type':        'application/json',
};

const CL_FIELDS = 'id,email,firstName,lastName,document,phone,homePhone,gender,isNewsletterOptIn,createdIn';
const AD_FIELDS = 'id,userId,street,number,complement,city,state,postalCode';

const CSV_HEADERS = [
  'customer_id', 'client_type', 'email', 'cpf',
  'first_name', 'last_name', 'phone', 'mobile',
  'gender', 'address', 'city', 'state', 'country', 'postal_code', 'opt_in',
];

const tmpDir = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function cleanDoc(d) { return d ? String(d).replace(/\D/g, '') : ''; }
function normalizePhone(p) {
  if (!p) return '';
  const c = p.trim().replace(/[^\d+]/g, '');
  if (c.startsWith('+55')) return c;
  if (c.startsWith('55') && c.length >= 12) return '+' + c;
  if (c.length >= 10) return '+55' + c;
  return c;
}
function normalizeGender(g) {
  const map = { male: 'M', female: 'F', masculino: 'M', feminino: 'F', m: 'M', f: 'F' };
  return map[String(g || '').trim().toLowerCase()] || '';
}
function escapeField(v) {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function fetchWithRetry(url, options, retries = 0) {
  try {
    return await axios.get(url, { ...options, timeout: 15000 });
  } catch (err) {
    const status = err.response?.status;
    if (status === 429) { await sleep(5000); return fetchWithRetry(url, options, retries); }
    if (status === 404) return null;
    if (retries < 2)   { await sleep(1000 * (retries + 1)); return fetchWithRetry(url, options, retries + 1); }
    return null;
  }
}

// ─── FASE 1: Scroll CL rápido ────────────────────────────────────────────────
async function phase1_scrollCL() {
  const rawFile = path.join(tmpDir, `resort-cl-raw-${ts}.json`);
  console.log('\n🔄 FASE 1 — Scroll CL (sem AD)');
  console.log(`   Arquivo intermediário: ${rawFile}\n`);

  const ws = fs.createWriteStream(rawFile, { encoding: 'utf8' });
  ws.write('[');

  let token = null, page = 0, total = 0, first = true;

  while (true) {
    page++;
    const params = token
      ? { _token: token, _fields: CL_FIELDS, _size: PAGE_SIZE }
      : { _fields: CL_FIELDS, _size: PAGE_SIZE, _sort: 'id ASC' };

    let res;
    try {
      res = await axios.get(`${BASE_URL}/api/dataentities/CL/scroll`, {
        params, headers: VTEX_HEADERS, timeout: 60000,
      });
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) { await sleep(6000); continue; }
      console.error(`\n❌ Erro scroll página ${page}:`, err.response?.data || err.message);
      break;
    }

    const records  = res.data || [];
    const newToken = res.headers['x-vtex-md-token'] || res.headers['x-vtex-page-token'] || null;

    if (!records.length) break;

    for (const r of records) {
      ws.write((first ? '' : ',') + JSON.stringify(r));
      first = false;
    }

    total += records.length;
    process.stdout.write(`\r   Página ${page} — ${total.toLocaleString('pt-BR')} clientes coletados`);

    if (!newToken) break;
    token = newToken;
    await sleep(200);
  }

  ws.write(']');
  ws.end();

  console.log(`\n   ✅ Fase 1 concluída — ${total.toLocaleString('pt-BR')} clientes em ${rawFile}\n`);
  return { rawFile, total };
}

// ─── FASE 2: Enriquecimento AD ────────────────────────────────────────────────
async function fetchAddress(clientId) {
  const res = await fetchWithRetry(`${BASE_URL}/api/dataentities/AD/search`, {
    headers: { ...VTEX_HEADERS, 'Accept': 'application/json', 'REST-Range': 'resources=0-0' },
    params:  { _where: `userId=${clientId}`, _fields: AD_FIELDS },
  });
  return res?.data?.[0] || null;
}

async function phase2_enrich(rawFile, totalClients) {
  const outFile = path.join(tmpDir, `clients-resort-full-${ts}.csv`);
  console.log('🔄 FASE 2 — Enriquecimento AD');
  console.log(`   Concorrência: ${AD_CONCURRENCY} | Timeout AD: 15s`);
  console.log(`   Saída: ${outFile}\n`);

  const clients = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
  const ws = fs.createWriteStream(outFile, { encoding: 'utf8' });
  ws.write('﻿');
  ws.write(CSV_HEADERS.join(',') + '\n');

  const startedAt = Date.now();
  let written = 0, skipped = 0, batch = 0;

  for (let i = 0; i < clients.length; i += AD_CONCURRENCY) {
    batch++;
    const chunk = clients.slice(i, i + AD_CONCURRENCY);
    const addrs = await Promise.all(chunk.map(c => fetchAddress(c.id)));

    for (let j = 0; j < chunk.length; j++) {
      const c  = chunk[j];
      const ad = addrs[j];
      const cpf   = cleanDoc(c.document);
      const email = (c.email || '').toLowerCase().trim();
      const customer_id = cpf || email;
      if (!customer_id) { skipped++; continue; }

      const addrParts = ad ? [ad.street, ad.number, ad.complement].filter(Boolean) : [];
      const row = {
        customer_id, client_type: 'resort', email, cpf,
        first_name:  c.firstName || '',
        last_name:   c.lastName  || '',
        phone:       normalizePhone(c.homePhone),
        mobile:      normalizePhone(c.phone),
        gender:      normalizeGender(c.gender),
        address:     addrParts.join(', '),
        city:        ad?.city       || '',
        state:       ad?.state      || '',
        country:     24,
        postal_code: ad?.postalCode || '',
        opt_in:      c.isNewsletterOptIn === true,
      };
      ws.write(CSV_HEADERS.map(h => escapeField(row[h])).join(',') + '\n');
      written++;
    }

    if (i + AD_CONCURRENCY < clients.length) await sleep(AD_DELAY_MS);

    if (batch % 50 === 0) {
      const pct  = ((i + AD_CONCURRENCY) / totalClients * 100).toFixed(1);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      const eta = ((Date.now() - startedAt) / (i + AD_CONCURRENCY) * (totalClients - i - AD_CONCURRENCY) / 1000).toFixed(0);
      console.log(`   [${pct}%] ${written.toLocaleString('pt-BR')} escritos | ${elapsed}s decorridos | ETA ~${eta}s`);
    }
  }

  ws.end();

  const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n✅ Fase 2 concluída em ${duration}s`);
  console.log(`   Linhas escritas : ${written.toLocaleString('pt-BR')}`);
  console.log(`   Ignorados       : ${skipped.toLocaleString('pt-BR')}`);
  console.log(`   Arquivo final   : ${outFile}\n`);
}

(async () => {
  const { rawFile, total } = await phase1_scrollCL();
  if (total === 0) { console.error('❌ Nenhum cliente coletado na Fase 1'); process.exit(1); }
  await phase2_enrich(rawFile, total);
  process.exit(0);
})().catch(e => {
  console.error('\n❌ ERRO fatal:', e.response?.data || e.message);
  process.exit(1);
});
