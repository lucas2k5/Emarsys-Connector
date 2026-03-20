/**
 * Serviço de reprocessamento de contatos com falha.
 *
 * Busca contatos com status 'pending' ou 'failed' no SQLite e tenta
 * reenviar para o webhook externo com backoff exponencial.
 *
 * Regras:
 * - Máximo de 5 tentativas por contato
 * - Backoff: attempts * 2 minutos entre tentativas
 * - Processa no máximo 50 contatos por execução
 * - Contatos que excedem 5 tentativas são marcados como 'dead'
 */
const axios = require('axios');
const { getDatabase } = require('../database/sqlite');
const { logger, logHelpers } = require('../utils/logger');
require('dotenv').config();

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;

/**
 * Busca contatos elegíveis para reprocessamento
 * @returns {Array} Lista de contatos elegíveis
 */
function getEligibleContacts() {
  const db = getDatabase();
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
 * Processa contatos com falha — chamado pelo cron a cada 5 minutos
 */
async function processFailedContacts() {
  const webhookUrl = process.env.CONTACTS_WEBHOOK_URL;
  const authHeader = process.env.CONTACTS_WEBHOOK_AUTH_HEADER || '';
  const timeout = parseInt(process.env.CONTACTS_WEBHOOK_TIMEOUT) || 30000;

  if (!webhookUrl) {
    logger.warn('[ContactRetry] CONTACTS_WEBHOOK_URL não configurado, pulando reprocessamento');
    return { processed: 0, sent: 0, failed: 0, dead: 0 };
  }

  const contacts = getEligibleContacts();

  if (contacts.length === 0) {
    return { processed: 0, sent: 0, failed: 0, dead: 0 };
  }

  logHelpers.logClients('info', `[ContactRetry] Iniciando reprocessamento de ${contacts.length} contato(s)`, { total: contacts.length });

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
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
      logger.error(`[ContactRetry] Payload inválido para contato id=${contact.id}`, { error: parseError.message });
      updateStatus(contact.id, 'dead', 'Payload JSON inválido');
      dead++;
      continue;
    }

    try {
      const response = await axios.post(webhookUrl, payload, { headers, timeout });
      updateStatus(contact.id, 'sent');
      sent++;
      logHelpers.logClients('info', `[ContactRetry] Contato id=${contact.id} reenviado com sucesso (status: ${response.status})`);
    } catch (error) {
      const nextAttempts = contact.attempts + 1;

      if (nextAttempts >= MAX_ATTEMPTS) {
        updateStatus(contact.id, 'dead', error.message);
        dead++;
        logHelpers.logClients('error', `[ContactRetry] Contato id=${contact.id} marcado como DEAD após ${nextAttempts} tentativas`, {
          contactId: contact.id,
          email: contact.email,
          lastError: error.message
        });
        logger.error(`[ContactRetry] ALERTA CRITICO: Contato id=${contact.id} excedeu limite de tentativas`, {
          contactId: contact.id,
          attempts: nextAttempts,
          lastError: error.message
        });
      } else {
        updateStatus(contact.id, 'failed', error.message);
        failed++;
        logHelpers.logClients('warn', `[ContactRetry] Contato id=${contact.id} falhou novamente (tentativa ${nextAttempts}/${MAX_ATTEMPTS})`, {
          contactId: contact.id,
          error: error.message
        });
      }
    }
  }

  const result = { processed: contacts.length, sent, failed, dead, skipped };
  logHelpers.logClients('info', `[ContactRetry] Reprocessamento concluído`, result);

  return result;
}

/**
 * Retorna estatísticas da tabela de contatos
 * @returns {Object} Contagens por status
 */
function getContactsStats() {
  const db = getDatabase();
  const pending = db.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'pending'").get();
  const sent = db.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'sent'").get();
  const failed = db.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'failed'").get();
  const dead = db.db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'dead'").get();
  const total = db.db.prepare("SELECT COUNT(*) as count FROM contacts").get();

  return {
    pending: pending.count,
    sent: sent.count,
    failed: failed.count,
    dead: dead.count,
    total: total.count
  };
}

module.exports = {
  processFailedContacts,
  getContactsStats
};
