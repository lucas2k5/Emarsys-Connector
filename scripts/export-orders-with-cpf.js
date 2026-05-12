'use strict';

/**
 * Exporta pedidos de um mês com CPF em texto plano no campo customer.
 * USO INTERNO — apenas para análise/identificação de clientes.
 *
 * Uso: node scripts/export-orders-with-cpf.js --from 2024-04 --to 2024-04
 */

require('dotenv').config();

const axios  = require('axios');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const BASE_URL  = process.env.VTEX_BASE_URL_HOPE  || process.env.VTEX_BASE_URL  || '';
const APP_KEY   = process.env.VTEX_APP_KEY_HOPE   || process.env.VTEX_APP_KEY   || '';
const APP_TOKEN = process.env.VTEX_APP_TOKEN_HOPE || process.env.VTEX_APP_TOKEN || '';

const VTEX_HEADERS = {
  'X-VTEX-API-AppKey':   APP_KEY,
  'X-VTEX-API-AppToken': APP_TOKEN,
  'Content-Type': 'application/json',
  'Accept':       'application/json',
};

const ORDERS_PER_PAGE  = 100;
const DELAY_PAGES      = 150;
const MAX_RETRIES      = 3;
const RETRY_DELAY      = 3000;
const RATE_LIMIT_DELAY = 6000;
const CONCURRENCY      = 10;

const CSV_HEADERS = [
  'item', 'price', 'order', 'timestamp', 'customer', 'quantity',
  's_sales_channel', 's_store_id', 's_canal', 's_loja',
  's_tipo_pagamento', 's_cupom', 'f_valor_desconto', 'cpf_raw',
];

const args    = process.argv.slice(2);
const fromArg = args[args.indexOf('--from') + 1] || '2024-04';
const toArg   = args[args.indexOf('--to')   + 1] || fromArg;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function weekSlicesForMonth(yyyyMM) {
  const [year, month] = yyyyMM.split('-').map(Number);
  const slices = [];
  let cursor = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  while (cursor < monthEnd) {
    const sliceEnd = new Date(Math.min(cursor.getTime() + 7 * 24 * 60 * 60 * 1000, monthEnd.getTime()));
    slices.push({ since: cursor.toISOString(), until: sliceEnd.toISOString() });
    cursor = sliceEnd;
  }
  return slices;
}

function monthsBetween(from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const months = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return months;
}

async function fetchWithRetry(url, options, retries = 0) {
  try {
    const res = await axios.get(url, { ...options, timeout: 30000 });
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    if (status === 429) { await sleep(RATE_LIMIT_DELAY); return fetchWithRetry(url, options, retries); }
    if (status === 404) return null;
    if (retries < MAX_RETRIES) { await sleep(RETRY_DELAY); return fetchWithRetry(url, options, retries + 1); }
    return null;
  }
}

async function fetchListForSlice(since, until) {
  const orders = [];
  let page = 1, totalPages = null;
  while (true) {
    const data = await fetchWithRetry(`${BASE_URL}/api/oms/pvt/orders`, {
      headers: VTEX_HEADERS,
      params: { orderBy: 'creationDate,asc', page, per_page: ORDERS_PER_PAGE, f_creationDate: `creationDate:[${since} TO ${until}]` },
    });
    if (!data || !Array.isArray(data.list)) break;
    if (totalPages === null) totalPages = data.paging?.pages || 1;
    orders.push(...data.list.filter(o => o.orderId));
    if (page >= totalPages) break;
    page++;
    await sleep(DELAY_PAGES);
  }
  return orders;
}

async function fetchListForMonth(yyyyMM) {
  const map = new Map();
  for (const slice of weekSlicesForMonth(yyyyMM)) {
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
  if (!detail || !detail.items?.length) return [];

  const cpf      = detail.clientProfileData?.document || '';
  const customer = cpf ? crypto.createHash('sha256').update(cpf).digest('hex') : '';
  const timestamp = new Date(detail.creationDate).toISOString().replace(/\.\d{3}Z$/, 'Z');

  const pagamento     = listItem.paymentNames || detail.paymentData?.transactions?.[0]?.payments?.[0]?.paymentSystemName || '';
  const discountTotal = detail.totals?.find(t => t.id === 'Discounts')?.value || 0;
  const cupom         = detail.marketingData?.coupon || '';
  const valorDesconto = discountTotal < 0 ? (Math.abs(discountTotal) / 100).toFixed(2) : '';
  const SALES_CHANNEL_MAP = { '1': 'Conta Principal', '4': 'TikTok', '5': 'APP', '8': 'Mercado Livre' };
  const rawChannel    = String(listItem.salesChannel || detail.salesChannel || '');
  const salesChannel  = SALES_CHANNEL_MAP[rawChannel] || rawChannel;
  const hostname      = listItem.hostname || detail.hostname || '';
  const canal         = 'Online';

  return (detail.items || []).map(item => ({
    item:              item.refId || String(item.id),
    price:             (item.price / 100).toFixed(2),
    order:             detail.orderId,
    timestamp,
    customer,
    quantity:          item.quantity,
    s_sales_channel: salesChannel,
    s_store_id:        hostname,
    s_canal:           canal,
    s_loja:            hostname,
    s_tipo_pagamento:  pagamento,
    s_cupom:           cupom,
    f_valor_desconto:  valorDesconto,
    cpf_raw:           cpf,
  }));
}

async function pooledMap(items, concurrency, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

(async () => {
  const months = monthsBetween(fromArg, toArg);
  console.log(`\nExportando pedidos com CPF — ${fromArg} → ${toArg}\n`);

  const tmpDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  for (const month of months) {
    process.stdout.write(`[${month}] Buscando lista...`);
    const listOrders = await fetchListForMonth(month);
    process.stdout.write(` ${listOrders.length} pedidos | detalhes...`);

    const nested = await pooledMap(listOrders, CONCURRENCY, fetchDetailAndMap);
    const rows   = nested.flat();
    process.stdout.write(` ${rows.length} linhas\n`);

    const outFile = path.join(tmpDir, `orders-cpf-raw-${month}.csv`);
    const lines   = [CSV_HEADERS.join(','), ...rows.map(r => CSV_HEADERS.map(c => escapeField(r[c])).join(','))];
    fs.writeFileSync(outFile, '\uFEFF' + lines.join('\n') + '\n', 'utf8');
    console.log(`✅ Salvo em: ${outFile}`);
  }

  console.log('\nConcluído.');
  process.exit(0);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
