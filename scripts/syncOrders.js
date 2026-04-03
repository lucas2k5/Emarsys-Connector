'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const cron = require('node-cron');

const { fetchNewOrderRows, fetchNewOrderRowsResort, generateOrdersCsv } = require('../services/vtexOrderService');
const EmarsysOrdersApiService = require('../services/emarsysOrdersApiService');

const SYNC_CONTROL_FILE        = path.join(__dirname, '..', 'data', 'lastOrderSync.json');
const SYNC_CONTROL_FILE_RESORT = path.join(__dirname, '..', 'data', 'lastOrderSyncResort.json');

const emarsys       = new EmarsysOrdersApiService('hope');
const emarsysResort = new EmarsysOrdersApiService('resort');

let isRunning       = false;
let isRunningResort = false;

function getLastSyncDate(controlFile) {
  try {
    if (fs.existsSync(controlFile)) {
      const control = JSON.parse(fs.readFileSync(controlFile, 'utf-8'));
      if (control.lastSync) return control.lastSync;
    }
  } catch (err) {
    console.warn(`[orders] Arquivo de controle inválido (${path.basename(controlFile)}), usando fallback: ${err.message}`);
  }
  return new Date(Date.now() - 10 * 60 * 1000).toISOString();
}

function saveLastSyncDate(controlFile, date) {
  fs.mkdirSync(path.dirname(controlFile), { recursive: true });
  fs.writeFileSync(controlFile, JSON.stringify({
    lastSync:  date,
    updatedAt: new Date().toISOString(),
  }));
}

// Hope Lingerie
async function runSync() {
  if (isRunning) { console.log('[orders] Já em execução, pulando'); return; }
  isRunning = true;

  const startedAt = new Date();
  const now       = startedAt.toISOString();
  const lastSync  = getLastSyncDate(SYNC_CONTROL_FILE);

  console.log(`[orders] Sync: ${lastSync} → ${now}`);

  try {
    const rows = await fetchNewOrderRows(lastSync, now);

    if (rows.length === 0) {
      console.log('[orders] Nenhum pedido novo');
      saveLastSyncDate(SYNC_CONTROL_FILE, now);
      return;
    }

    console.log(`[orders] ${rows.length} linhas geradas`);

    const result = await emarsys.sendCsvToApi(generateOrdersCsv(rows));
    if (!result.success) throw new Error(result.error);

    saveLastSyncDate(SYNC_CONTROL_FILE, now);

    const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[orders] ✓ Concluído em ${duration}s`);
  } catch (err) {
    console.error('[orders] ✗ ERRO:', err.message);
  } finally {
    isRunning = false;
  }
}

// Hope Resort
async function runSyncResort() {
  if (isRunningResort) { console.log('[orders-resort] Já em execução, pulando'); return; }
  isRunningResort = true;

  const startedAt = new Date();
  const now       = startedAt.toISOString();
  const lastSync  = getLastSyncDate(SYNC_CONTROL_FILE_RESORT);

  console.log(`[orders-resort] Sync: ${lastSync} → ${now}`);

  try {
    const rows = await fetchNewOrderRowsResort(lastSync, now);

    if (rows.length === 0) {
      console.log('[orders-resort] Nenhum pedido novo');
      saveLastSyncDate(SYNC_CONTROL_FILE_RESORT, now);
      return;
    }

    console.log(`[orders-resort] ${rows.length} linhas geradas`);

    const result = await emarsysResort.sendCsvToApi(generateOrdersCsv(rows));
    if (!result.success) throw new Error(result.error);

    saveLastSyncDate(SYNC_CONTROL_FILE_RESORT, now);

    const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[orders-resort] ✓ Concluído em ${duration}s`);
  } catch (err) {
    console.error('[orders-resort] ✗ ERRO:', err.message);
  } finally {
    isRunningResort = false;
  }
}

// Cron: a cada 10 minutos — ambos os ambientes
cron.schedule('*/10 * * * *', runSync,        { timezone: 'America/Sao_Paulo' });
cron.schedule('*/10 * * * *', runSyncResort,  { timezone: 'America/Sao_Paulo' });

// Executa imediatamente ao iniciar
runSync();
runSyncResort();
