'use strict';

/**
 * Sync delta de clientes VTEX Master Data → Webhook.
 *
 * A cada 30 minutos busca clientes atualizados desde o último sync
 * e envia para o mesmo webhook de contatos já configurado no projeto.
 *
 * Uso:
 *   node scripts/syncClients.js          # inicia cron + executa imediatamente
 *
 * Controle de estado: data/lastClientSync.json
 */

require('dotenv').config();

const cron = require('cron');
const fs   = require('fs');
const path = require('path');

const { fetchDeltaClients }    = require('../services/vtexClientService');
const contactWebhookService    = require('../services/contactWebhookService');

const SYNC_CONTROL_FILE = path.join(__dirname, '..', 'data', 'lastClientSync.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getLastSyncDate() {
  if (!fs.existsSync(SYNC_CONTROL_FILE)) {
    // Primeira execução: últimos 30 minutos
    return new Date(Date.now() - 30 * 60 * 1000).toISOString();
  }
  const control = JSON.parse(fs.readFileSync(SYNC_CONTROL_FILE, 'utf-8'));
  return control.lastSync;
}

function saveLastSyncDate(date, count) {
  fs.mkdirSync(path.dirname(SYNC_CONTROL_FILE), { recursive: true });
  fs.writeFileSync(SYNC_CONTROL_FILE, JSON.stringify({
    lastSync:  date,
    lastCount: count,
    updatedAt: new Date().toISOString(),
  }), 'utf-8');
}

async function runDeltaSync() {
  const startedAt = new Date();
  const now       = startedAt.toISOString();
  const lastSync  = getLastSyncDate();

  console.log(`[clients-sync] Delta: ${lastSync} → ${now}`);

  try {
    const payloads = await fetchDeltaClients(lastSync);

    if (payloads.length === 0) {
      console.log('[clients-sync] Nenhum cliente atualizado');
      saveLastSyncDate(now, 0);
      return;
    }

    console.log(`[clients-sync] ${payloads.length} clientes para enviar`);

    let sent   = 0;
    let errors = 0;

    for (const payload of payloads) {
      try {
        const result = await contactWebhookService.sendContact(payload);
        if (result.success) sent++;
        else {
          errors++;
          console.warn(`[clients-sync] Falha ao enviar ${payload.email}: ${result.error}`);
        }
      } catch (err) {
        errors++;
        console.warn(`[clients-sync] Erro ao enviar ${payload.email}: ${err.message}`);
      }
      await sleep(100);
    }

    saveLastSyncDate(now, sent);

    const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[clients-sync] ✓ ${sent} enviados, ${errors} erros — ${duration}s`);

  } catch (err) {
    console.error('[clients-sync] ✗ ERRO:', err.message);
    // NÃO atualiza lastSync em caso de erro geral — reprocessa na próxima execução
  }
}

module.exports = { runDeltaSync };

// ─── Cron (apenas quando executado diretamente) ──────────────────────────────
if (require.main === module) {
  const clientsSyncCron = process.env.CLIENTS_SYNC_CRON || '*/30 * * * *';
  const cronTimezone    = process.env.CRON_TIMEZONE      || 'America/Sao_Paulo';

  new cron.CronJob(clientsSyncCron, runDeltaSync, null, true, cronTimezone);
  console.log(`[clients-sync] Cron configurado: ${clientsSyncCron} (${cronTimezone})`);

  // Executa imediatamente ao iniciar
  runDeltaSync();
}
