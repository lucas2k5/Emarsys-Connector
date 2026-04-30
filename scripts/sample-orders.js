'use strict';

/**
 * Script de amostragem — USO ÚNICO / CONFERÊNCIA
 * Busca os 50 pedidos mais recentes da Hope Lingerie e salva em tmp/sample-orders.csv
 * Não altera nenhum estado, não envia nada para o Emarsys.
 *
 * Uso: node scripts/sample-orders.js
 */

require('dotenv').config();

const fs     = require('fs');
const path   = require('path');
const axios  = require('axios');
const crypto = require('crypto');

const BASE_URL  = process.env.VTEX_BASE_URL_HOPE  || process.env.VTEX_BASE_URL;
const APP_KEY   = process.env.VTEX_APP_KEY_HOPE   || process.env.VTEX_APP_KEY;
const APP_TOKEN = process.env.VTEX_APP_TOKEN_HOPE || process.env.VTEX_APP_TOKEN;

const SAMPLE_SIZE = 50;
const DELAY_MS    = 300;

const HEADERS = {
  'X-VTEX-API-AppKey':   APP_KEY,
  'X-VTEX-API-AppToken': APP_TOKEN,
  'Content-Type': 'application/json',
  'Accept':       'application/json',
};

const CSV_COLS = [
  'item', 'price', 'order', 'timestamp', 'customer', 'quantity',
  's_sales_channel', 's_store_id', 's_canal', 's_loja',
  's_tipo_pagamento', 's_cupom', 'f_valor_desconto',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function maskCpf(cpf) {
  if (!cpf) return '';
  return cpf.replace(/(\d{3})\d{3}(\d{3})(\d{2})/, '$1.***.***-$2');
}

(async () => {
  console.log('[sample] Buscando lista de pedidos recentes...');

  const now   = new Date().toISOString();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // últimos 30 dias

  const listRes = await axios.get(`${BASE_URL}/api/oms/pvt/orders`, {
    headers: HEADERS,
    params: {
      orderBy:        'creationDate,desc',
      page:           1,
      per_page:       SAMPLE_SIZE,
      f_creationDate: `creationDate:[${since} TO ${now}]`,
    },
    timeout: 15000,
  });

  const orderIds = (listRes.data.list || []).map(o => o.orderId).filter(Boolean);
  console.log(`[sample] ${orderIds.length} pedidos encontrados — buscando detalhes...`);

  const rows = [];

  for (let i = 0; i < orderIds.length; i++) {
    process.stdout.write(`\r[sample] ${i + 1}/${orderIds.length}`);

    let detail;
    try {
      const res = await axios.get(`${BASE_URL}/api/oms/pvt/orders/${orderIds[i]}`, {
        headers: HEADERS,
        timeout: 15000,
      });
      detail = res.data;
    } catch (e) {
      console.warn(`\n[sample] Erro no pedido ${orderIds[i]}: ${e.message}`);
      if (i + 1 < orderIds.length) await sleep(DELAY_MS);
      continue;
    }

    const cpf           = detail.clientProfileData?.document || '';
    const customer      = cpf ? crypto.createHash('sha256').update(cpf).digest('hex') : '';
    const timestamp     = new Date(detail.creationDate).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const pagamento     = detail.paymentData?.transactions?.[0]?.payments?.[0]?.paymentSystemName || '';
    const discountTotal = detail.totals?.find(t => t.id === 'Discounts')?.value || 0;
    const cupom         = detail.marketingData?.coupon || '';
    const valorDesconto = discountTotal < 0 ? (Math.abs(discountTotal) / 100).toFixed(2) : '';

    for (const item of (detail.items || [])) {
      rows.push({
        item:             item.refId || String(item.id),
        price:            (item.price / 100).toFixed(2),
        order:            detail.orderId,
        timestamp:        timestamp,
        customer:         customer,
        quantity:         item.quantity,
        s_sales_channel:  String(detail.salesChannel || ''),
        s_store_id:       detail.hostname || '',
        s_canal:          detail.origin   || '',
        s_loja:           detail.hostname || '',
        s_tipo_pagamento: pagamento,
        s_cupom:          cupom,
        f_valor_desconto: valorDesconto,
      });
    }

    if (i + 1 < orderIds.length) await sleep(DELAY_MS);
  }

  console.log(`\n[sample] ${rows.length} linhas geradas`);

  const tmpDir  = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const outFile = path.join(tmpDir, 'sample-orders.csv');
  const header  = CSV_COLS.join(',');
  const lines   = rows.map(r => CSV_COLS.map(c => escape(r[c])).join(','));
  fs.writeFileSync(outFile, '\uFEFF' + [header, ...lines].join('\n') + '\n', 'utf8');

  console.log(`[sample] ✅ CSV salvo em: ${outFile}`);
  console.log(`[sample] Abra o arquivo ou copie o caminho para baixar.`);
})().catch(e => {
  console.error('\n[sample] ERRO:', e.message);
  process.exit(1);
});
