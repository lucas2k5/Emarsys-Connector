'use strict';

/**
 * Sync delta de clientes VTEX Master Data → Webhook.
 *
 * Suporta Hope Lingerie e Hope Resort de forma independente.
 * A cada 30 minutos busca clientes atualizados desde o último sync
 * e envia para o webhook de contatos.
 *
 * Uso:
 *   node scripts/syncClients.js          # inicia cron + executa imediatamente (ambas as lojas)
 *
 * Controle de estado:
 *   data/lastClientSync.json        → Hope Lingerie
 *   data/lastClientSyncResort.json  → Hope Resort
 */

require('dotenv').config();

const cron = require('cron');
const fs   = require('fs');
const path = require('path');

const { fetchDeltaClients, fetchDeltaClientsResort } = require('../services/vtexClientService');
const contactWebhookService = require('../services/contactWebhookService');
const { logHelpers } = require('../utils/logger');

const SYNC_CONTROL_FILE        = path.join(__dirname, '..', 'data', 'lastClientSync.json');
const SYNC_CONTROL_FILE_RESORT = path.join(__dirname, '..', 'data', 'lastClientSyncResort.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getLastSyncDate(file) {
  if (!fs.existsSync(file)) {
    return new Date(Date.now() - 30 * 60 * 1000).toISOString();
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8')).lastSync;
}

function saveLastSyncDate(file, date, count) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    lastSync:  date,
    lastCount: count,
    updatedAt: new Date().toISOString(),
  }), 'utf-8');
}

// Overlap para compensar lag de indexação do VTEX Master Data.
// Registros recém-criados podem levar até 60min para aparecer no índice de busca.
// O overlap reprocessa o período anterior com margem, e o webhook do lado do Emarsys
// é idempotente (upsert por customer_id), então reenvios são seguros.
const INDEXING_LAG_OVERLAP_MS = 60 * 60 * 1000; // 60 minutos

async function runSync(tag, controlFile, fetchFn) {
  // Deriva o store do tag: 'clients-sync:hope' → 'hope', 'clients-sync:resort' → 'resort'
  const store = tag.includes('resort') ? 'resort' : 'hope';

  const startedAt = new Date();
  const now       = startedAt.toISOString();
  const lastSync  = getLastSyncDate(controlFile);

  // Aplica overlap: subtrai 60min do lastSync para compensar lag de indexação
  const lastSyncWithOverlap = new Date(new Date(lastSync).getTime() - INDEXING_LAG_OVERLAP_MS).toISOString();

  logHelpers.logStoreClients(store, 'info', `[${tag}] Delta: ${lastSyncWithOverlap} → ${now} (overlap: 60min sobre ${lastSync})`);

  try {
    const payloads = await fetchFn(lastSyncWithOverlap);

    if (payloads.length === 0) {
      logHelpers.logStoreClients(store, 'info', `[${tag}] Nenhum cliente atualizado`);
      saveLastSyncDate(controlFile, now, 0);
      return;
    }

    logHelpers.logStoreClients(store, 'info', `[${tag}] ${payloads.length} clientes para enviar`);

    let sent   = 0;
    let errors = 0;

    for (const payload of payloads) {
      try {
        const result = await contactWebhookService.sendContact(payload);
        if (result.success) sent++;
        else {
          errors++;
          logHelpers.logStoreClients(store, 'warn', `[${tag}] Falha ao enviar ${payload.email}: ${result.error}`);
        }
      } catch (err) {
        errors++;
        logHelpers.logStoreClients(store, 'warn', `[${tag}] Erro ao enviar ${payload.email}: ${err.message}`);
      }
      await sleep(100);
    }

    saveLastSyncDate(controlFile, now, sent);

    const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
    logHelpers.logStoreClients(store, 'info', `[${tag}] Concluido: ${sent} enviados, ${errors} erros — ${duration}s`);

  } catch (err) {
    logHelpers.logStoreClientsError(store, err, { tag, controlFile });
    // NÃO atualiza o arquivo de controle em erro geral — reprocessa na próxima execução
  }
}

async function runDeltaSync() {
  return runSync('clients-sync:hope', SYNC_CONTROL_FILE, fetchDeltaClients);
}

async function runDeltaSyncResort() {
  return runSync('clients-sync:resort', SYNC_CONTROL_FILE_RESORT, fetchDeltaClientsResort);
}

module.exports = { runDeltaSync, runDeltaSyncResort };

// ─── Cron (apenas quando executado diretamente) ──────────────────────────────
if (require.main === module) {
  const clientsSyncCron = process.env.CLIENTS_SYNC_CRON || '*/30 * * * *';
  const cronTimezone    = process.env.CRON_TIMEZONE      || 'America/Sao_Paulo';

  new cron.CronJob(clientsSyncCron, runDeltaSync, null, true, cronTimezone);
  console.log(`[clients-sync:hope] Cron configurado: ${clientsSyncCron} (${cronTimezone})`);

  if (process.env.CLIENTS_SYNC_ENABLED_RESORT === 'true' || process.env.CLIENTS_SYNC_ENABLED_RESORT === '1') {
    const resortCron = process.env.CLIENTS_SYNC_CRON_RESORT || clientsSyncCron;
    new cron.CronJob(resortCron, runDeltaSyncResort, null, true, cronTimezone);
    console.log(`[clients-sync:resort] Cron configurado: ${resortCron} (${cronTimezone})`);
  }

  runDeltaSync();

  if (process.env.CLIENTS_SYNC_ENABLED_RESORT === 'true' || process.env.CLIENTS_SYNC_ENABLED_RESORT === '1') {
    runDeltaSyncResort();
  }
}
