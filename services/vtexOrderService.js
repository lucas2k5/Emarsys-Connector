'use strict';

require('dotenv').config();
const axios  = require('axios');
const crypto = require('crypto');

const BASE_URL  = process.env.VTEX_BASE_URL_HOPE || process.env.VTEX_BASE_URL || '';
const APP_KEY   = process.env.VTEX_APP_KEY_HOPE  || process.env.VTEX_APP_KEY   || '';
const APP_TOKEN = process.env.VTEX_APP_TOKEN_HOPE || process.env.VTEX_APP_TOKEN || '';

const CONFIG = {
  ORDERS_PER_PAGE:      100,
  DELAY_BETWEEN_ORDERS: 300,   // ms entre chamadas de detalhe
  DELAY_BETWEEN_PAGES:  200,   // ms entre páginas da listagem
  MAX_RETRIES:            3,
  RETRY_DELAY:         2000,
  RATE_LIMIT_DELAY:    5000,
};

const VTEX_HEADERS = {
  'X-VTEX-API-AppKey':   APP_KEY,
  'X-VTEX-API-AppToken': APP_TOKEN,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

const CSV_HEADERS = [
  'item', 'price', 'order', 'timestamp', 'customer', 'quantity',
  's_sales_channel', 's_store_id', 's_canal', 's_loja',
  's_tipo_pagamento', 's_cupom',
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, options = {}, retries = 0) {
  try {
    const response = await axios.get(url, { ...options, timeout: 30000 });
    return response.data;
  } catch (err) {
    const status = err.response?.status;

    if (status === 429) {
      console.log(`[orders] 429 rate limit — aguardando ${CONFIG.RATE_LIMIT_DELAY}ms`);
      await sleep(CONFIG.RATE_LIMIT_DELAY);
      return fetchWithRetry(url, options, retries);
    }

    if (status === 404) return null;

    if (retries < CONFIG.MAX_RETRIES) {
      console.log(`[orders] Erro ${status || err.code} — retry ${retries + 1}/${CONFIG.MAX_RETRIES}`);
      await sleep(CONFIG.RETRY_DELAY);
      return fetchWithRetry(url, options, retries + 1);
    }

    console.warn(`[orders] Falha após ${CONFIG.MAX_RETRIES} tentativas: ${url}`);
    return null;
  }
}

// PASSO 2 — Listar orderIds no período
async function fetchOrderIds(sinceDate, untilDate) {
  const orderIds  = [];
  let currentPage = 1;
  let totalPages  = null;

  while (true) {
    const data = await fetchWithRetry(
      `${BASE_URL}/api/oms/pvt/orders`,
      {
        headers: VTEX_HEADERS,
        params: {
          orderBy:        'creationDate,asc',
          page:           currentPage,
          per_page:       CONFIG.ORDERS_PER_PAGE,
          f_creationDate: `creationDate:[${sinceDate} TO ${untilDate}]`,
        },
      }
    );

    if (!data || !Array.isArray(data.list)) break;

    const paging = data.paging || {};
    if (totalPages === null) {
      totalPages = paging.pages || 1;
      console.log(`[orders] ${paging.total || 0} pedidos encontrados`);
    }

    for (const order of data.list) {
      if (order.orderId) orderIds.push(order.orderId);
    }

    if (currentPage >= totalPages) break;
    currentPage++;
    await sleep(CONFIG.DELAY_BETWEEN_PAGES);
  }

  return orderIds;
}

// PASSO 3 — Mapear pedido para linhas CSV
function mapOrderToRows(order) {
  const cpf = order.clientProfileData?.document || '';
  if (!cpf) {
    console.warn(`[orders] Pedido ${order.orderId} sem CPF — ignorando`);
    return [];
  }

  const customer  = crypto.createHash('sha256').update(cpf).digest('hex');
  const orderId   = order.orderId;
  const timestamp = Math.floor(new Date(order.creationDate).getTime() / 1000);

  const salesChannel = String(order.salesChannel || '');
  const storeId      = order.hostname || '';
  const canal        = order.origin   || '';
  const loja         = order.hostname || '';

  const pagamento = order.paymentData
    ?.transactions?.[0]
    ?.payments?.[0]
    ?.paymentSystemName || '';

  const discountTotal = order.totals?.find((t) => t.id === 'Discounts')?.value || 0;
  const cupom = discountTotal < 0
    ? (order.marketingData?.coupon || String(Math.abs(discountTotal / 100)))
    : '';

  const rows = [];
  for (const item of order.items || []) {
    rows.push({
      item:             item.id,
      price:            (item.price / 100).toFixed(2),
      order:            orderId,
      timestamp:        timestamp,
      customer:         customer,
      quantity:         item.quantity,
      s_sales_channel:  salesChannel,
      s_store_id:       storeId,
      s_canal:          canal,
      s_loja:           loja,
      s_tipo_pagamento: pagamento,
      s_cupom:          cupom,
    });
  }

  return rows;
}

// PASSO 4 — Gerar CSV como string (EmarsysOrdersApiService converte para binary)
function generateOrdersCsv(rows) {
  function escapeField(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  const header = CSV_HEADERS.join(',');
  const lines  = rows.map((row) =>
    CSV_HEADERS.map((col) => escapeField(row[col])).join(',')
  );
  return [header, ...lines].join('\n') + '\n';
}

// Função principal exportada
// untilDate deve ser passado pelo caller (capturado antes do sync iniciar)
async function fetchNewOrderRows(sinceDate, untilDate) {
  // Passo 1: listar orderIds
  const orderIds = await fetchOrderIds(sinceDate, untilDate);

  if (orderIds.length === 0) return [];

  // Passo 2: buscar detalhes 1 a 1
  const allRows  = [];
  let sem_cpf    = 0;
  let sem_itens  = 0;

  for (let i = 0; i < orderIds.length; i++) {
    const order = await fetchWithRetry(
      `${BASE_URL}/api/oms/pvt/orders/${orderIds[i]}`,
      { headers: VTEX_HEADERS }
    );

    if (order) {
      if (!order.items || order.items.length === 0) {
        sem_itens++;
      } else {
        const rows = mapOrderToRows(order);
        if (rows.length === 0) sem_cpf++;
        allRows.push(...rows);
      }
    }

    if (i + 1 < orderIds.length) await sleep(CONFIG.DELAY_BETWEEN_ORDERS);
  }

  if (sem_cpf   > 0) console.log(`[orders] ${sem_cpf} pedidos ignorados (sem CPF)`);
  if (sem_itens > 0) console.log(`[orders] ${sem_itens} pedidos ignorados (sem itens)`);

  return allRows;
}

module.exports = { fetchNewOrderRows, generateOrdersCsv, mapOrderToRows };
