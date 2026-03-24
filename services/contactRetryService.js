/**
 * Serviço de reprocessamento de contatos com falha.
 *
 * Busca contatos com status 'pending' ou 'failed' no SQLite e tenta
 * reenviar para o webhook externo com backoff exponencial.
 *
 * Filas separadas por client_type (hope/resort), permitindo
 * URLs de webhook diferentes por ambiente.
 *
 * Regras:
 * - Máximo de 5 tentativas por contato
 * - Backoff: attempts * 2 minutos entre tentativas
 * - Processa no máximo 50 contatos por execução (por client_type)
 * - Contatos que excedem 5 tentativas são marcados como 'dead'
 */
const axios = require('axios');
const { getDatabase } = require('../database/sqlite');
const { logger, logHelpers } = require('../utils/logger');
require('dotenv').config();

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;

/**
 * Retorna a URL do webhook de saída para o client_type dado.
 * Suporta URLs separadas por ambiente via variáveis:
 *   CONTACTS_WEBHOOK_URL_HOPE, CONTACTS_WEBHOOK_URL_RESORT
 * Fallback: CONTACTS_WEBHOOK_URL (URL única para todos)
 * @param {string} clientType
 * @returns {string|null}
 */
function getWebhookUrlForClient(clientType) {
  const envKey = `CONTACTS_WEBHOOK_URL_${(clientType || 'hope').toUpperCase()}`;
  return process.env[envKey] || process.env.CONTACTS_WEBHOOK_URL || null;
}

/**
 * Busca contatos elegíveis para reprocessamento, filtrados por client_type
 * @param {string|null} clientType - Filtrar por client_type (null = todos)
 * @returns {Array} Lista de contatos elegíveis
 */
function getEligibleContacts(clientType = null) {
  const db = getDatabase();

  if (clientType) {
    const stmt = db.db.prepare(`
      SELECT * FROM contacts
      WHERE (status = 'pending' OR status = 'failed')
        AND attempts < ?
        AND client_type = ?
      ORDER BY updated_at ASC
      LIMIT ?
    `);
    return stmt.all(MAX_ATTEMPTS, clientType, BATCH_SIZE);
  }

  const stmt = db.db.prepare(`
    SELECT * FROM contacts
    WHERE (status = 'pending' OR status = 'failed')
      AND attempts < ?
    ORDER BY updated_at ASC
    LIMIT ?
  `);
  return stmt.all(MAX_ATTEMPTS, BATCH_SIZE);
}

/**
 * Retorna os client_types distintos com contatos pendentes de retry
 * @returns {Array<string>} Lista de client_types
 */
function getActiveClientTypes() {
  const db = getDatabase();
  const rows = db.db.prepare(`
    SELECT DISTINCT client_type FROM contacts
    WHERE (status = 'pending' OR status = 'failed')
      AND attempts < ?
  `).all(MAX_ATTEMPTS);
  return rows.map(r => r.client_type || 'hope');
}

/**
 * Atualiza status de um contato
 * @param {number} id
 * @param {string} status
 * @param {string|null} errorMessage
 */
function updateStatus(id, status, errorMessage = null) {
  const db = getDatabase();
  if (status === 'failed' || status === 'dead') {
    const stmt = db.db.prepare(`
      UPDATE contacts
      SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(status, errorMessage, id);
  } else {
    const stmt = db.db.prepare(`
      UPDATE contacts
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(status, id);
  }
}

/**
 * Processa contatos com falha de um client_type específico
 * @param {string} clientType
 * @returns {Object} Resultado do processamento
 */
async function processClientTypeQueue(clientType) {
  const webhookUrl = getWebhookUrlForClient(clientType);
  const authHeader = process.env.CONTACTS_WEBHOOK_AUTH_HEADER || '';
  const timeout = parseInt(process.env.CONTACTS_WEBHOOK_TIMEOUT) || 30000;

  if (!webhookUrl) {
    logger.warn(`[ContactRetry] Webhook não configurado para client_type=${clientType}, pulando`);
    return { clientType, processed: 0, sent: 0, failed: 0, dead: 0, skipped: 0 };
  }

  const contacts = getEligibleContacts(clientType);

  if (contacts.length === 0) {
    return { clientType, processed: 0, sent: 0, failed: 0, dead: 0, skipped: 0 };
  }

  logHelpers.logClients('info', `[ContactRetry][${clientType}] Reprocessando ${contacts.length} contato(s)`, {
    clientType,
    total: contacts.length,
    webhookUrl
  });

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'ngrok-skip-browser-warning': 'true'
  };
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  let sent = 0;
  let failed = 0;
  let dead = 0;
  let skipped = 0;

  for (const contact of contacts) {
    // Backoff exponencial: só tentar se o tempo desde updated_at for maior que attempts * 2 minutos
    const minutesSinceLastAttempt = (Date.now() - new Date(contact.updated_at).getTime()) / 60000;
    const requiredWait = contact.attempts * 2; // 2min, 4min, 6min, 8min, 10min
    if (minutesSinceLastAttempt < requiredWait) {
      skipped++;
      continue;
    }

    let payload;
    try {
      payload = JSON.parse(contact.payload);
    } catch (parseError) {
      logger.error(`[ContactRetry][${clientType}] Payload inválido para contato id=${contact.id}`, { error: parseError.message });
      updateStatus(contact.id, 'dead', 'Payload JSON inválido');
      dead++;
      continue;
    }

    try {
      const response = await axios.post(webhookUrl, payload, { headers, timeout });
      updateStatus(contact.id, 'sent');
      sent++;
      logHelpers.logClients('info', `[ContactRetry][${clientType}] Contato id=${contact.id} reenviado com sucesso (status: ${response.status})`);
    } catch (error) {
      const nextAttempts = contact.attempts + 1;

      if (nextAttempts >= MAX_ATTEMPTS) {
        updateStatus(contact.id, 'dead', error.message);
        dead++;
        logHelpers.logClients('error', `[ContactRetry][${clientType}] Contato id=${contact.id} marcado como DEAD após ${nextAttempts} tentativas`, {
          contactId: contact.id,
          email: contact.email,
          clientType,
          lastError: error.message
        });
        logger.error(`[ContactRetry][${clientType}] ALERTA CRITICO: Contato id=${contact.id} excedeu limite de tentativas`, {
          contactId: contact.id,
          clientType,
          attempts: nextAttempts,
          lastError: error.message
        });
      } else {
        updateStatus(contact.id, 'failed', error.message);
        failed++;
        logHelpers.logClients('warn', `[ContactRetry][${clientType}] Contato id=${contact.id} falhou novamente (tentativa ${nextAttempts}/${MAX_ATTEMPTS})`, {
          contactId: contact.id,
          clientType,
          error: error.message
        });
      }
    }
  }

  const result = { clientType, processed: contacts.length, sent, failed, dead, skipped };
  logHelpers.logClients('info', `[ContactRetry][${clientType}] Concluído`, result);

  return result;
}

/**
 * Processa contatos com falha — chamado pelo cron a cada 5 minutos.
 * Processa cada client_type em fila separada.
 */
async function processFailedContacts() {
  const clientTypes = getActiveClientTypes();

  if (clientTypes.length === 0) {
    return { processed: 0, sent: 0, failed: 0, dead: 0, queues: [] };
  }

  const results = [];
  let totalProcessed = 0;
  let totalSent = 0;
  let totalFailed = 0;
  let totalDead = 0;

  for (const clientType of clientTypes) {
    const result = await processClientTypeQueue(clientType);
    results.push(result);
    totalProcessed += result.processed;
    totalSent += result.sent;
    totalFailed += result.failed;
    totalDead += result.dead;
  }

  return {
    processed: totalProcessed,
    sent: totalSent,
    failed: totalFailed,
    dead: totalDead,
    queues: results
  };
}

/**
 * Retorna estatísticas da tabela de contatos
 * @param {string|null} clientType - Filtrar por client_type (null = todos)
 * @returns {Object} Contagens por status
 */
function getContactsStats(clientType = null) {
  const db = getDatabase();

  if (clientType) {
    const pending = db.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'pending' AND client_type = ?").get(clientType);
    const sent = db.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'sent' AND client_type = ?").get(clientType);
    const failed = db.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'failed' AND client_type = ?").get(clientType);
    const dead = db.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'dead' AND client_type = ?").get(clientType);
    const total = db.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE client_type = ?").get(clientType);

    return {
      client_type: clientType,
      pending: pending.count,
      sent: sent.count,
      failed: failed.count,
      dead: dead.count,
      total: total.count
    };
  }

  // Totais gerais + breakdown por client_type
  const pending = db.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'pending'").get();
  const sent = db.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'sent'").get();
  const failed = db.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'failed'").get();
  const dead = db.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'dead'").get();
  const total = db.db.prepare("SELECT COUNT(*) as count FROM contacts").get();

  // Breakdown por client_type
  const byClientType = db.db.prepare(`
    SELECT client_type,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) as dead,
      COUNT(*) as total
    FROM contacts
    GROUP BY client_type
  `).all();

  return {
    pending: pending.count,
    sent: sent.count,
    failed: failed.count,
    dead: dead.count,
    total: total.count,
    by_client_type: byClientType
  };
}

module.exports = {
  processFailedContacts,
  getContactsStats
};
