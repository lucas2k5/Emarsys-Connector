'use strict';

/**
 * Carga histórica de pedidos — Hope Resort (lojahr)
 *
 * Envia pedidos mês a mês para a Emarsys Orders API (Scarab HAPI - merchant Resort).
 * Cada mês é dividido em fatias semanais (contorna limite VTEX de 3k/query).
 * Detalhes de pedidos são buscados em paralelo (CONCURRENCY = 10).
 *
 * Uso:
 *   node scripts/historical-orders-load-resort.js              # dry-run (não envia)
 *   node scripts/historical-orders-load-resort.js --send       # envia para Emarsys
 *   node scripts/historical-orders-load-resort.js --send --from 2024-05 --to 2026-05
 *
 * Flags:
 *   --send              Envia os CSVs para a API (sem flag = apenas gera e loga)
 *   --from YYYY-MM      Mês inicial (padrão: 2024-05)
 *   --to   YYYY-MM      Mês final   (padrão: 2026-05)
 *   --delay-months N    Segundos de pausa entre meses (padrão: 5)
 *   --concurrency N     Requisições paralelas para detalhes (padrão: 10)
 *
 * Variáveis de ambiente necessárias:
 *   VTEX_BASE_URL_RESORT_ORDERS   — https://lojahr.vtexcommercestable.com.br
 *   VTEX_APP_KEY_RESORT_ORDERS    — vtexappkey-lojahr-QUCIZP
 *   VTEX_APP_TOKEN_RESORT_ORDERS  — token VTEX Resort
 *   EMARSYS_ORDERS_API_URL_RESORT — endpoint Scarab HAPI Resort
 *   EMARSYS_SALES_TOKEN_RESORT    — token estático Resort
 */

require('dotenv').config();

const axios  = require('axios');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// ─── Credenciais VTEX Resort ─────────────────────────────────────────────────
const BASE_URL  = process.env.VTEX_BASE_URL_RESORT_ORDERS  || '';
const APP_KEY   = process.env.VTEX_APP_KEY_RESORT_ORDERS   || '';
const APP_TOKEN = process.env.VTEX_APP_TOKEN_RESORT_ORDERS || '';

if (!BASE_URL || !APP_KEY || !APP_TOKEN) {
  console.error('❌ Credenciais VTEX Resort não configuradas.');
  console.error('   Defina: VTEX_BASE_URL_RESORT_ORDERS, VTEX_APP_KEY_RESORT_ORDERS, VTEX_APP_TOKEN_RESORT_ORDERS');
  process.exit(1);
}

const VTEX_HEADERS = {
  'X-VTEX-API-AppKey':   APP_KEY,
  'X-VTEX-API-AppToken': APP_TOKEN,
  'Content-Type': 'application/json',
  'Accept':       'application/json',
};

// ─── Config ──────────────────────────────────────────────────────────────────
const ORDERS_PER_PAGE  = 100;
const DELAY_PAGES      = 150;
const MAX_RETRIES      = 3;
const RETRY_DELAY      = 3000;
const RATE_LIMIT_DELAY = 6000;

const CSV_HEADERS = [
  'item', 'price', 'order', 'timestamp', 'customer', 'quantity',
  's_sales_channel', 's_store_id', 's_canal', 's_loja',
  's_tipo_pagamento', 's_cupom', 'f_valor_desconto',
];

// ─── Args ────────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const SEND        = args.includes('--send');
const fromArg     = args[args.indexOf('--from')         + 1] || '2024-05';
const toArg       = args[args.indexOf('--to')           + 1] || '2026-05';
const delayArg    = parseInt(args[args.indexOf('--delay-months') + 1]) || 5;
const CONCURRENCY = parseInt(args[args.indexOf('--concurrency')  + 1]) || 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function pooledMap(items, concurrency, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

function weekSlicesForMonth(yyyyMM) {
  const [year, month] = yyyyMM.split('-').map(Number);
  const slices = [];
  let cursor = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  while (cursor < monthEnd) {
    const sliceStart = new Date(cursor);
    const sliceEnd   = new Date(Math.min(cursor.getTime() + 7 * 24 * 60 * 60 * 1000, monthEnd.getTime()));
    slices.push({ since: sliceStart.toISOString(), until: sliceEnd.toISOString() });
    cursor = sliceEnd;
  }
  return slices;
}

function monthsBetween(fromYYYYMM, toYYYYMM) {
  const [fy, fm] = fromYYYYMM.split('-').map(Number);
  const [ty, tm] = toYYYYMM.split('-').map(Number);
  const months = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

// ─── VTEX ────────────────────────────────────────────────────────────────────
async function fetchWithRetry(url, options, retries = 0) {
  try {
    const res = await axios.get(url, { ...options, timeout: 30000 });
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    if (status === 429) {
      await sleep(RATE_LIMIT_DELAY);
      return fetchWithRetry(url, options, retries);
    }
    if (status === 404) return null;
    if (retries < MAX_RETRIES) {
      await sleep(RETRY_DELAY);
      return fetchWithRetry(url, options, retries + 1);
    }
    return null;
  }
}

async function fetchListForSlice(since, until) {
  const orders = [];
  let page = 1, totalPages = null, total = null;

  while (true) {
    const data = await fetchWithRetry(`${BASE_URL}/api/oms/pvt/orders`, {
      headers: VTEX_HEADERS,
      params: {
        orderBy:        'creationDate,asc',
        page,
        per_page:       ORDERS_PER_PAGE,
        f_creationDate: `creationDate:[${since} TO ${until}]`,
        f_status:       'invoiced',
      },
    });

    if (!data || !Array.isArray(data.list)) break;

    const paging = data.paging || {};
    if (totalPages === null) {
      totalPages = paging.pages || 1;
      total      = paging.total || 0;
    }

    orders.push(...data.list.filter(o => o.orderId));

    if (page >= totalPages) {
      if (total > orders.length) {
        process.stdout.write(` ⚠️ VTEX cap: ${orders.length}/${total}`);
      }
      break;
    }
    page++;
    await sleep(DELAY_PAGES);
  }

  return orders;
}

async function fetchListForMonth(yyyyMM) {
  const slices = weekSlicesForMonth(yyyyMM);
  const map    = new Map();

  for (const slice of slices) {
    const orders = await fetchListForSlice(slice.since, slice.until);
    for (const o of orders) map.set(o.orderId, o);
  }

  return Array.from(map.values());
}

async function fetchDetailAndMap(listItem) {
  const detail = await fetchWithRetry(
    `${BASE_URL}/api/oms/pvt/orders/${listItem.orderId}`,
    { headers: VTEX_HEADERS }
  );

  if (!detail) return [];

  const cpf = detail.clientProfileData?.document || '';
  if (!cpf) return [];

  const customer  = crypto.createHash('sha256').update(cpf).digest('hex');
  const timestamp = new Date(detail.creationDate).toISOString().slice(0, 10);

  const pagamento = listItem.paymentNames
    || detail.paymentData?.transactions?.[0]?.payments?.[0]?.paymentSystemName
    || '';

  const discountTotal = detail.totals?.find(t => t.id === 'Discounts')?.value || 0;
  const cupom         = detail.marketingData?.coupon || '';
  const valorDesconto = discountTotal < 0 ? (Math.abs(discountTotal) / 100).toFixed(2) : '';

  // Resort opera em único canal (loja física + e-commerce unificado sob "lojahr")
  const SALES_CHANNEL_MAP = { '1': 'Conta Principal', '4': 'TikTok', '5': 'APP', '8': 'Mercado Livre' };
  const rawChannel  = String(listItem.salesChannel || detail.salesChannel || '');
  const salesChannel = SALES_CHANNEL_MAP[rawChannel] || rawChannel;
  const hostname    = listItem.hostname || detail.hostname || '';
  const canal       = 'Online';

  return (detail.items || []).map(item => ({
    item:             item.refId || String(item.id),
    price:            (item.price / 100).toFixed(2),
    order:            detail.orderId,
    timestamp,
    customer,
    quantity:         item.quantity,
    s_sales_channel: salesChannel,
    s_store_id:       hostname,
    s_canal:          canal,
    s_loja:           hostname,
    s_tipo_pagamento: pagamento,
    s_cupom:          cupom,
    f_valor_desconto: valorDesconto,
  }));
}

function deduplicateRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.order}__${row.item}`;
    if (map.has(key)) {
      map.get(key).quantity += Number(row.quantity);
    } else {
      map.set(key, { ...row, quantity: Number(row.quantity) });
    }
  }
  return Array.from(map.values());
}

function buildCsv(rows) {
  const deduped = deduplicateRows(rows);
  return CSV_HEADERS.join(',') + '\n'
    + deduped.map(r => CSV_HEADERS.map(c => escapeField(r[c])).join(',')).join('\n') + '\n';
}

// ─── Emarsys ─────────────────────────────────────────────────────────────────
async function sendToEmarsys(csvContent) {
  const EmarsysOrdersApiService = require('../services/emarsysOrdersApiService');
  const service = new EmarsysOrdersApiService('resort');
  if (!service.isConfigured()) {
    throw new Error('Emarsys Orders API Resort não configurada — verifique EMARSYS_ORDERS_API_URL_RESORT e EMARSYS_SALES_TOKEN_RESORT');
  }
  return service.sendCsvToApi(csvContent);
}

// ─── Log de progresso ─────────────────────────────────────────────────────────
const LOG_FILE = path.join(__dirname, '..', 'tmp', 'historical-load-resort.log');

function appendLog(entry) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
}

function loadLog() {
  if (!fs.existsSync(LOG_FILE)) return {};
  const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
  const map = {};
  for (const line of lines) {
    try { const e = JSON.parse(line); map[e.month] = e; } catch {}
  }
  return map;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const months  = monthsBetween(fromArg, toArg);
  const doneMap = loadLog();

  // ~82.461 pedidos / 25 meses ≈ 3.298/mês
  const avgOrdersPerMonth = 3300;
  const estSecsPerMonth   = Math.ceil((avgOrdersPerMonth / CONCURRENCY) * 0.35);
  const estTotalMin       = Math.ceil((months.length * estSecsPerMonth) / 60);

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  Carga Histórica — Hope Resort                       ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  VTEX            : ${BASE_URL}`);
  console.log(`  Emarsys Merchant: Resort (15232C841F7635A9)`);
  console.log(`  Período         : ${fromArg} → ${toArg}`);
  console.log(`  Meses           : ${months.length}`);
  console.log(`  Concorrência    : ${CONCURRENCY} requisições paralelas`);
  console.log(`  Modo            : ${SEND ? '🚀 ENVIO REAL' : '🔍 DRY-RUN (sem envio)'}`);
  console.log(`  Tempo est.      : ~${estTotalMin} min`);
  console.log(`  Log             : ${LOG_FILE}\n`);

  if (!SEND) {
    console.log('  ℹ️  Para enviar de verdade, adicione --send\n');
  }

  const summary = { sent: 0, skipped: 0, errors: 0, totalOrders: 0, totalLines: 0 };

  for (let i = 0; i < months.length; i++) {
    const month  = months[i];
    const prefix = `[${String(i+1).padStart(2,'0')}/${months.length}] ${month}`;

    if (doneMap[month]?.status === 'success') {
      console.log(`${prefix} — ✅ já enviado (${doneMap[month].orders} pedidos, ${doneMap[month].lines} linhas)`);
      summary.skipped++;
      continue;
    }

    // 1. Lista paginada (fatias semanais)
    process.stdout.write(`${prefix} — lista...`);
    const listOrders = await fetchListForMonth(month);
    process.stdout.write(` ${listOrders.length} pedidos`);

    if (listOrders.length === 0) {
      console.log(' — sem pedidos');
      appendLog({ month, status: 'empty', orders: 0, lines: 0, at: new Date().toISOString() });
      summary.skipped++;
      continue;
    }

    // 2. Detalhes em paralelo
    process.stdout.write(` | detalhes (${CONCURRENCY}x)...`);
    const startDetail = Date.now();

    const rowsNested = await pooledMap(listOrders, CONCURRENCY, fetchDetailAndMap);
    const rows       = rowsNested.flat();

    const elapsedSec = ((Date.now() - startDetail) / 1000).toFixed(1);
    const semCpf     = listOrders.length - new Set(rows.map(r => r.order)).size;

    process.stdout.write(` ${rows.length} linhas (${elapsedSec}s)`);
    if (semCpf > 0) process.stdout.write(` | ${semCpf} sem CPF`);

    // 3. CSV local
    const csvContent = buildCsv(rows);
    const csvPath    = path.join(__dirname, '..', 'tmp', `orders-resort-${month}.csv`);
    fs.writeFileSync(csvPath, '﻿' + csvContent, 'utf8');

    if (!SEND) {
      console.log(` — dry-run ✓`);
      appendLog({ month, status: 'dry-run', orders: listOrders.length, lines: rows.length, at: new Date().toISOString() });
      summary.sent++;
      summary.totalOrders += listOrders.length;
      summary.totalLines  += rows.length;
      continue;
    }

    // 4. Envio Emarsys
    process.stdout.write(' | enviando...');
    try {
      const result = await sendToEmarsys(csvContent);
      if (result.success) {
        console.log(' ✅');
        appendLog({ month, status: 'success', orders: listOrders.length, lines: rows.length, at: new Date().toISOString() });
        summary.sent++;
        summary.totalOrders += listOrders.length;
        summary.totalLines  += rows.length;
      } else {
        console.log(` ❌ ${result.error}`);
        appendLog({ month, status: 'error', error: result.error, orders: listOrders.length, lines: rows.length, at: new Date().toISOString() });
        summary.errors++;
      }
    } catch (e) {
      console.log(` ❌ ${e.message}`);
      appendLog({ month, status: 'error', error: e.message, orders: listOrders.length, lines: rows.length, at: new Date().toISOString() });
      summary.errors++;
    }

    if (i + 1 < months.length) {
      process.stdout.write(`   ⏳ ${delayArg}s...`);
      await sleep(delayArg * 1000);
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  Resultado Final                                     ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Meses processados : ${summary.sent}`);
  console.log(`  Meses pulados     : ${summary.skipped}`);
  console.log(`  Erros             : ${summary.errors}`);
  console.log(`  Total de pedidos  : ${summary.totalOrders.toLocaleString('pt-BR')}`);
  console.log(`  Total de linhas   : ${summary.totalLines.toLocaleString('pt-BR')}`);
  console.log(`  Log completo      : ${LOG_FILE}\n`);
})().catch(e => {
  console.error('\nERRO FATAL:', e.message);
  process.exit(1);
});
