'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const cron = require('node-cron');

const { fetchNewOrderRows, generateOrdersCsv } = require('../services/vtexOrderService');
const EmarsysOrdersApiService = require('../services/emarsysOrdersApiService');

const SYNC_CONTROL_FILE = path.join(__dirname, '..', 'data', 'lastOrderSync.json');

const emarsys = new EmarsysOrdersApiService('hope');

let isRunning = false;

function getLastSyncDate() {
  try {
    if (fs.existsSync(SYNC_CONTROL_FILE)) {
      const control = JSON.parse(fs.readFileSync(SYNC_CONTROL_FILE, 'utf-8'));
      if (control.lastSync) return control.lastSync;
    }
  } catch (err) {
    console.warn(`[orders] Arquivo de controle inválido, usando fallback: ${err.message}`);
  }
  // Primeira execução ou arquivo corrompido: últimos 10 minutos
  return new Date(Date.now() - 10 * 60 * 1000).toISOString();
}

function saveLastSyncDate(date) {
  fs.mkdirSync(path.dirname(SYNC_CONTROL_FILE), { recursive: true });
  fs.writeFileSync(SYNC_CONTROL_FILE, JSON.stringify({
    lastSync:  date,
    updatedAt: new Date().toISOString(),
  }));
}

async function runSync() {
  if (isRunning) {
    console.log('[orders] Já em execução, pulando');
    return;
  }
  isRunning = true;

  const startedAt = new Date();
  // now capturado aqui — antes de qualquer chamada à API
  // garante que pedidos criados DURANTE o sync entram no próximo ciclo
  const now      = startedAt.toISOString();
  const lastSync = getLastSyncDate();

  console.log(`[orders] Sync: ${lastSync} → ${now}`);

  try {
    const rows = await fetchNewOrderRows(lastSync, now);

    if (rows.length === 0) {
      console.log('[orders] Nenhum pedido novo');
      saveLastSyncDate(now);
      return;
    }

    console.log(`[orders] ${rows.length} linhas geradas`);

    const csv    = generateOrdersCsv(rows);
    const result = await emarsys.sendCsvToApi(csv);

    if (!result.success) {
      throw new Error(result.error);
    }

    saveLastSyncDate(now);

    const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[orders] ✓ Concluído em ${duration}s`);
  } catch (err) {
    console.error('[orders] ✗ ERRO:', err.message);
    // lastSync NÃO atualizado — próxima execução reprocessa desde o mesmo ponto
  } finally {
    isRunning = false;
  }
}

// Cron: a cada 10 minutos
cron.schedule('*/10 * * * *', runSync, { timezone: 'America/Sao_Paulo' });

// Executa imediatamente ao iniciar
runSync();
