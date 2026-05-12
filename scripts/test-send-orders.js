'use strict';

/**
 * Script de teste — envia 10 pedidos recentes da VTEX para a API do Emarsys.
 * Não altera estado do banco. Apenas para validação.
 *
 * Uso: node scripts/test-send-orders.js
 */

require('dotenv').config();

const axios  = require('axios');
const crypto = require('crypto');

const BASE_URL  = process.env.VTEX_BASE_URL_HOPE  || process.env.VTEX_BASE_URL;
const APP_KEY   = process.env.VTEX_APP_KEY_HOPE   || process.env.VTEX_APP_KEY;
const APP_TOKEN = process.env.VTEX_APP_TOKEN_HOPE || process.env.VTEX_APP_TOKEN;

const VTEX_HEADERS = {
  'X-VTEX-API-AppKey':   APP_KEY,
  'X-VTEX-API-AppToken': APP_TOKEN,
  'Content-Type': 'application/json',
  'Accept':       'application/json',
};

const CSV_HEADERS = [
  'item', 'price', 'order', 'timestamp', 'customer', 'quantity',
  's_sales_channel', 's_store_id', 's_canal', 's_loja',
  's_tipo_pagamento', 's_cupom', 'f_valor_desconto',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

(async () => {
  console.log('\n==============================');
  console.log('TESTE — 10 pedidos → Emarsys');
  console.log('==============================\n');

  // 1. Busca os 10 pedidos mais recentes
  console.log('[1/3] Buscando 10 pedidos recentes na VTEX...');
  const now   = new Date().toISOString();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const listRes = await axios.get(`${BASE_URL}/api/oms/pvt/orders`, {
    headers: VTEX_HEADERS,
    params: {
      orderBy:        'creationDate,desc',
      page:           1,
      per_page:       10,
      f_creationDate: `creationDate:[${since} TO ${now}]`,
    },
    timeout: 15000,
  });

  const orderIds = (listRes.data.list || []).map(o => o.orderId).filter(Boolean);
  console.log(`   ${orderIds.length} pedidos encontrados\n`);

  // 2. Busca detalhes e monta linhas CSV
  console.log('[2/3] Buscando detalhes e montando CSV...');
  const rows = [];

  for (let i = 0; i < orderIds.length; i++) {
    process.stdout.write(`\r   ${i + 1}/${orderIds.length}`);
    try {
      const res = await axios.get(`${BASE_URL}/api/oms/pvt/orders/${orderIds[i]}`, {
        headers: VTEX_HEADERS,
        timeout: 15000,
      });
      const order = res.data;
      const cpf   = order.clientProfileData?.document || '';
      if (!cpf) { continue; }

      const customer      = crypto.createHash('sha256').update(cpf).digest('hex');
      const timestamp     = new Date(order.creationDate).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const pagamento     = order.paymentData?.transactions?.[0]?.payments?.[0]?.paymentSystemName || '';
      const discountTotal = order.totals?.find(t => t.id === 'Discounts')?.value || 0;
      const cupom         = order.marketingData?.coupon || '';
      const fValorDesconto = discountTotal < 0 ? (Math.abs(discountTotal) / 100).toFixed(2) : '';

      for (const item of (order.items || [])) {
        rows.push({
          item:             item.refId || String(item.id),
          price:            (item.price / 100).toFixed(2),
          order:            order.orderId,
          timestamp,
          customer,
          quantity:         item.quantity,
          s_sales_channel: ({ '1': 'Conta Principal', '4': 'TikTok', '5': 'APP', '8': 'Mercado Livre' })[String(order.salesChannel)] || String(order.salesChannel || ''),
          s_store_id:       order.hostname || '',
          s_canal:          'Online',
          s_loja:           order.hostname || '',
          s_tipo_pagamento: pagamento,
          s_cupom:          cupom,
          f_valor_desconto: fValorDesconto,
        });
      }
    } catch (e) {
      console.warn(`\n   Erro no pedido ${orderIds[i]}: ${e.message}`);
    }
    if (i + 1 < orderIds.length) await sleep(300);
  }

  console.log(`\n   ${rows.length} linhas CSV montadas\n`);

  if (rows.length === 0) {
    console.error('Nenhuma linha gerada (pedidos sem CPF?). Abortando.');
    process.exit(1);
  }

  // 3. Monta CSV e envia para Emarsys
  console.log('[3/3] Enviando para Emarsys Orders API...');
  const csvContent = CSV_HEADERS.join(',') + '\n'
    + rows.map(r => CSV_HEADERS.map(c => escapeField(r[c])).join(',')).join('\n') + '\n';

  console.log('\nPreview CSV (primeiras 3 linhas):');
  csvContent.split('\n').slice(0, 4).forEach(l => console.log(' ', l));
  console.log();

  const EmarsysOrdersApiService = require('../services/emarsysOrdersApiService');
  const service = new EmarsysOrdersApiService('hope');

  if (!service.isConfigured()) {
    console.error('Emarsys Orders API não configurada. Verifique .env');
    process.exit(1);
  }

  const result = await service.sendCsvToApi(csvContent);

  if (result.success) {
    console.log('✅ Sucesso!');
    console.log('   Resposta:', JSON.stringify(result.data || result, null, 2));
  } else {
    console.error('❌ Falha:', result.error);
    console.error('   Detalhes:', JSON.stringify(result, null, 2));
  }

  console.log('\n==============================\n');
})().catch(e => {
  console.error('ERRO FATAL:', e.message);
  process.exit(1);
});
