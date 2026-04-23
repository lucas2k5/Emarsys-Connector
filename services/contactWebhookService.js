/**
 * Serviço de envio de contatos via Webhook.
 *
 * Substitui o envio via API Emarsys (WSSE/OAuth2).
 * Transforma os dados do contato no payload esperado pelo webhook externo.
 *
 * Payload enviado:
 * {
 *   "customer_id": "NDI1NzAzOTk4MTc=",
 *   "client_type": "hope",
 *   "email": "...",
 *   "cpf": "42570399817",
 *   "first_name": "...",
 *   "last_name": "...",
 *   "phone": "+551133334444",
 *   "mobile": "+5511999998888",
 *   "gender": "M|F",
 *   "address": "...",
 *   "city": "...",
 *   "state": "...",
 *   "country": 31,
 *   "postal_code": "01310-100",
 *   "opt_in": true|false
 * }
 *
 * TODO: Definir CONTACTS_WEBHOOK_URL no .env quando o endpoint for fornecido.
 */
const axios = require('axios');
const crypto = require('crypto');
const { getDatabase } = require('../database/sqlite');
const { logger, logHelpers } = require('../utils/logger');
require('dotenv').config();

class ContactWebhookService {
  constructor() {
    this.webhookUrl = process.env.CONTACTS_WEBHOOK_URL;
    this.clientType = process.env.CONTACTS_WEBHOOK_CLIENT_TYPE || 'hope';
    this.authHeader = process.env.CONTACTS_WEBHOOK_AUTH_HEADER || '';
    this.timeout = parseInt(process.env.CONTACTS_WEBHOOK_TIMEOUT) || 30000;

    if (!this.webhookUrl) {
      console.warn('⚠️ [ContactWebhook] CONTACTS_WEBHOOK_URL não configurado. Envio de contatos via webhook desabilitado.');
    } else {
      console.log('✅ [ContactWebhook] Configurado para:', this.webhookUrl);
      console.log(`   📋 client_type: ${this.clientType}`);
      console.log(`   🔐 Auth: ${this.authHeader ? 'Configurado' : 'Sem autenticação'}`);
    }
  }

  /**
   * Salva o contato no SQLite com status pending
   * @param {Object} payload - Payload já formatado do webhook
   * @returns {number} ID do registro criado
   */
  saveContact(payload) {
    const db = getDatabase();
    const stmt = db.db.prepare(`
      INSERT INTO contacts (customer_id, email, cpf, payload, status, attempts, client_type)
      VALUES (?, ?, ?, ?, 'pending', 0, ?)
    `);
    const result = stmt.run(
      payload.customer_id || '',
      payload.email || null,
      payload.cpf || null,
      JSON.stringify(payload),
      payload.client_type || 'hope'
    );
    return result.lastInsertRowid;
  }

  /**
   * Atualiza status de um contato no SQLite
   * @param {number} id - ID do registro
   * @param {string} status - Novo status (pending, sent, failed, dead)
   * @param {string|null} errorMessage - Mensagem de erro (se houver)
   */
  updateContactStatus(id, status, errorMessage = null) {
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
   * Verifica se o webhook está configurado
   * @returns {boolean}
   */
  isConfigured() {
    return !!this.webhookUrl;
  }

  /**
   * Gera o customer_id: base64(md5(cpf ou email))
   * Prioriza CPF se disponível, senão usa email.
   * @param {string} cpf - CPF do cliente (somente dígitos)
   * @param {string} email - Email do cliente
   * @returns {string} customer_id em base64
   */
  generateCustomerId(cpf, email) {
    const source = cpf && cpf.trim() ? cpf.trim() : (email || '').trim().toLowerCase();
    if (!source) return '';

    const md5Hash = crypto.createHash('md5').update(source).digest('hex');
    return Buffer.from(md5Hash).toString('base64');
  }

  /**
   * Normaliza o gênero para o formato esperado pelo webhook.
   * Aceita: m, f, masculino, feminino, male, female, 1, 2, 3, outro, other
   * Retorna: "masculino", "feminino" ou "outro"
   * @param {string|number} gender
   * @returns {string}
   */
  normalizeGender(gender) {
    if (!gender && gender !== 0) return '';

    const normalized = String(gender).trim().toLowerCase();
    const map = {
      'm': 'masculino',
      'male': 'masculino',
      'masculino': 'masculino',
      '1': 'masculino',
      'f': 'feminino',
      'female': 'feminino',
      'feminino': 'feminino',
      '2': 'feminino',
      'outro': 'outro',
      'other': 'outro',
      '3': 'outro'
    };

    return map[normalized] || normalized;
  }

  /**
   * Normaliza gênero para formato curto: "M" ou "F"
   * @param {string|number} gender
   * @returns {string}
   */
  normalizeGenderShort(gender) {
    if (!gender && gender !== 0) return '';

    const normalized = String(gender).trim().toUpperCase();
    const map = {
      'M': 'M',
      'MALE': 'M',
      'MASCULINO': 'M',
      '1': 'M',
      'F': 'F',
      'FEMALE': 'F',
      'FEMININO': 'F',
      '2': 'F'
    };

    return map[normalized] || normalized;
  }

  /**
   * Normaliza country para código numérico (31 = Brasil)
   * @param {string|number} country
   * @returns {number}
   */
  normalizeCountry(country) {
    if (typeof country === 'number') return country;
    if (!country) return 31; // Brasil padrão

    const normalized = String(country).trim().toLowerCase();
    if (normalized === 'brasil' || normalized === 'brazil' || normalized === 'br') return 31;
    const parsed = parseInt(normalized, 10);
    if (!isNaN(parsed)) return parsed;
    return 31;
  }

  /**
   * Normaliza opt-in para boolean
   * @param {*} optin
   * @returns {boolean}
   */
  normalizeOptIn(optin) {
    if (typeof optin === 'boolean') return optin;
    if (optin === 1 || optin === '1' || optin === 'true' || optin === 'True') return true;
    if (optin === 2 || optin === '2' || optin === 'false' || optin === 'False' || optin === 0 || optin === '0') return false;
    // Padrão: true (opt-in)
    return true;
  }

  /**
   * Normaliza telefone brasileiro adicionando +55 se necessário
   * @param {string} phone
   * @returns {string}
   */
  normalizePhone(phone) {
    if (!phone) return '';
    const clean = phone.trim().replace(/[^\d+]/g, '');
    if (clean.startsWith('+55')) return clean;
    if (clean.startsWith('55') && clean.length >= 12) return '+' + clean;
    if (clean.length >= 10) return '+55' + clean;
    return clean;
  }

  /**
   * Remove formatação de documentos (CPF/CNPJ) - somente dígitos
   * @param {string} doc
   * @returns {string}
   */
  cleanDocument(doc) {
    if (!doc && doc !== 0) return '';
    return String(doc).replace(/[^\d]/g, '');
  }

  /**
   * Normaliza data para formato YYYY-MM-DD
   * @param {string} dateInput
   * @returns {string}
   */
  normalizeDate(dateInput) {
    if (!dateInput) return '';
    const raw = String(dateInput).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return '';
  }

  /**
   * Transforma dados do contato (formato interno/Emarsys) para o payload do webhook.
   *
   * Aceita tanto o formato de campos nomeados (first_name, email, etc.)
   * quanto o formato de IDs numéricos da Emarsys (campo '3' = email, etc.)
   *
   * @param {Object} contactData - Dados do contato
   * @returns {Object} Payload formatado para o webhook
   */
  buildWebhookPayload(contactData) {
    // Se o payload já vem no formato padronizado (com customer_id e client_type),
    // usa direto sem transformações — a VTEX envia já formatado.
    if (contactData.customer_id && contactData.client_type) {
      return {
        customer_id: String(contactData.customer_id),
        client_type: contactData.client_type,
        email: (contactData.email || '').trim().toLowerCase(),
        cpf: contactData.cpf != null ? String(contactData.cpf).replace(/[^\d]/g, '') || null : null,
        first_name: contactData.first_name || null,
        last_name: contactData.last_name || null,
        phone: contactData.phone || null,
        mobile: contactData.mobile || null,
        gender: this.normalizeGenderShort(contactData.gender || '') || null,
        address: contactData.address || null,
        city: contactData.city || null,
        state: contactData.state || null,
        country: this.normalizeCountry(contactData.country),
        postal_code: contactData.postal_code || null,
        opt_in: contactData.opt_in !== undefined ? contactData.opt_in : true
      };
    }

    // Fallback: formato legado — transforma campos antigos para o padrão
    const email = (contactData.email || contactData['3'] || '').trim().toLowerCase();
    const cpfRaw = this.cleanDocument(contactData.cpf || contactData.document || contactData['43'] || '');
    const cpf = cpfRaw || null;
    const firstNameRaw = (contactData.first_name || contactData.firstName || contactData['1'] || '').trim();
    const firstName = firstNameRaw || null;
    const lastNameRaw = (contactData.last_name || contactData.lastName || contactData['2'] || '').trim();
    const lastName = lastNameRaw || null;
    const phoneRaw = this.normalizePhone(contactData.phone || contactData['15'] || '');
    const phone = phoneRaw || null;
    const mobileRaw = this.normalizePhone(contactData.mobile || contactData['37'] || '');
    const mobile = mobileRaw || null;
    const genderRaw = this.normalizeGenderShort(contactData.gender || contactData['5'] || '');
    const gender = genderRaw || null;
    const optIn = this.normalizeOptIn(contactData.opt_in ?? contactData.optin ?? contactData['31']);
    const addressRaw = (contactData.address || '').trim();
    const address = addressRaw || null;
    const cityRaw = (contactData.city || contactData['11'] || '').trim();
    const city = cityRaw || null;
    const stateRaw = (contactData.state || contactData['12'] || '').trim();
    const state = stateRaw || null;
    const country = this.normalizeCountry(contactData.country || contactData['14']);
    const postalCodeRaw = (contactData.postal_code || contactData.zip_code || contactData['13'] || '').trim();
    const postalCode = postalCodeRaw || null;

    const payload = {
      customer_id: this.generateCustomerId(cpfRaw, email),
      client_type: contactData.client_type || this.clientType,
      email,
      cpf,
      first_name: firstName,
      last_name: lastName,
      phone,
      mobile,
      gender,
      address,
      city,
      state,
      country,
      postal_code: postalCode,
      opt_in: optIn
    };

    return payload;
  }

  /**
   * Envia um contato para o webhook.
   * Equivalente ao antigo emarsysContactImportService.createContact()
   *
   * @param {Object} contactData - Dados do contato (formato nomeado ou IDs Emarsys)
   * @param {Object} options - Opções de retry
   * @returns {Promise<Object>} Resultado do envio
   */
  async sendContact(contactData, options = {}) {
    const { maxRetries = 3, retryDelay = 1000 } = options;

    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'CONTACTS_WEBHOOK_URL não configurado. Defina a URL do webhook no .env',
        errorType: 'CONFIG_ERROR'
      };
    }

    const payload = this.buildWebhookPayload(contactData);

    if (!payload.email) {
      return {
        success: false,
        error: 'Campo email é obrigatório',
        errorType: 'VALIDATION_ERROR'
      };
    }

    // Persistir contato no SQLite ANTES de tentar enviar
    let contactId = null;
    try {
      contactId = this.saveContact(payload);
      logHelpers.logClients('info', `[ContactWebhook] Contato persistido no SQLite (id=${contactId})`, { contactId, email: payload.email });
    } catch (dbError) {
      logger.error('[ContactWebhook] Falha ao persistir contato no SQLite, prosseguindo com envio', { error: dbError.message });
    }

    // Monta headers
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    };

    // Adiciona autenticação se configurada
    if (this.authHeader) {
      headers['Authorization'] = this.authHeader;
    }

    // Mascara dados sensíveis para log
    const maskedPayload = { ...payload };
    if (maskedPayload.email) {
      const [user, domain] = maskedPayload.email.split('@');
      maskedPayload.email = user && domain ? `${user.slice(0, 2)}***@${domain}` : '***';
    }
    if (maskedPayload.cpf) {
      const cpfStr = String(maskedPayload.cpf);
      maskedPayload.cpf = cpfStr.slice(0, 3) + '***' + cpfStr.slice(-2);
    }
    if (maskedPayload.phone) maskedPayload.phone = maskedPayload.phone.replace(/\d(?=\d{2})/g, '*');
    if (maskedPayload.mobile) maskedPayload.mobile = maskedPayload.mobile.replace(/\d(?=\d{2})/g, '*');

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📨 [ContactWebhook] Enviando contato (tentativa ${attempt}/${maxRetries})...`);
        console.log(`   📋 Payload (masked):`, JSON.stringify(maskedPayload));

        const response = await axios.post(this.webhookUrl, payload, {
          headers,
          timeout: this.timeout
        });

        console.log(`✅ [ContactWebhook] Contato enviado com sucesso (status: ${response.status})`);

        // Marcar como enviado no SQLite
        if (contactId) {
          try {
            this.updateContactStatus(contactId, 'sent');
          } catch (dbError) {
            logger.error('[ContactWebhook] Falha ao atualizar status para sent', { contactId, error: dbError.message });
          }
        }

        return {
          success: true,
          action: 'sent_to_webhook',
          data: response.data,
          status: response.status,
          attempts: attempt,
          contactId
        };
      } catch (error) {
        lastError = error;
        const status = error.response?.status;
        const data = error.response?.data;
        const isRetryable = !status || status >= 500 || status === 429 ||
          error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';

        console.error(`❌ [ContactWebhook] Tentativa ${attempt}/${maxRetries} falhou:`, {
          status,
          message: error.message,
          code: error.code,
          responseBody: data,
          retryable: isRetryable
        });

        if (!isRetryable) {
          // Erro não-retryável (400, 401, 403, etc.) - falha imediata
          if (contactId) {
            try {
              this.updateContactStatus(contactId, 'failed', error.message);
            } catch (dbError) {
              logger.error('[ContactWebhook] Falha ao atualizar status para failed', { contactId, error: dbError.message });
            }
          }

          return {
            success: false,
            error: error.message,
            errorType: status === 401 || status === 403 ? 'AUTH_ERROR' : 'VALIDATION_ERROR',
            status,
            data,
            retryable: false,
            attempts: attempt,
            contactId
          };
        }

        if (attempt < maxRetries) {
          const delay = retryDelay * Math.pow(2, attempt - 1);
          console.log(`⏳ [ContactWebhook] Aguardando ${delay}ms antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Todas as tentativas falharam — marcar como failed no SQLite para retry posterior
    if (contactId) {
      try {
        this.updateContactStatus(contactId, 'failed', lastError.message);
      } catch (dbError) {
        logger.error('[ContactWebhook] Falha ao atualizar status para failed após todas tentativas', { contactId, error: dbError.message });
      }
    }

    return {
      success: false,
      error: `Falha após ${maxRetries} tentativas: ${lastError.message}`,
      errorType: 'NETWORK_ERROR',
      retryable: true,
      attempts: maxRetries,
      contactId
    };
  }

  /**
   * Envia múltiplos contatos para o webhook (batch).
   * Processa sequencialmente com delay entre requisições para evitar rate limit.
   *
   * @param {Array<Object>} contacts - Array de dados de contatos
   * @param {Object} options - Opções
   * @param {number} options.delayBetween - Delay entre requisições em ms (padrão: 200)
   * @returns {Promise<Object>} Resultado do envio em lote
   */
  async sendContactsBatch(contacts, options = {}) {
    const { delayBetween = 200, maxRetries = 3 } = options;

    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'CONTACTS_WEBHOOK_URL não configurado',
        errorType: 'CONFIG_ERROR'
      };
    }

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return {
        success: false,
        error: 'Nenhum contato fornecido',
        errorType: 'VALIDATION_ERROR'
      };
    }

    console.log(`📨 [ContactWebhook] Iniciando envio batch de ${contacts.length} contatos...`);

    const results = {
      total: contacts.length,
      sent: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const result = await this.sendContact(contact, { maxRetries });

      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push({
          index: i,
          email: (contact.email || contact['3'] || '').slice(0, 5) + '***',
          error: result.error,
          errorType: result.errorType
        });
      }

      // Log de progresso a cada 100 contatos
      if ((i + 1) % 100 === 0 || i === contacts.length - 1) {
        console.log(`   📊 [ContactWebhook] Progresso: ${i + 1}/${contacts.length} (${results.sent} OK, ${results.failed} erros)`);
      }

      // Delay entre requisições (exceto na última)
      if (i < contacts.length - 1 && delayBetween > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetween));
      }
    }

    console.log(`✅ [ContactWebhook] Batch concluído: ${results.sent}/${results.total} enviados, ${results.failed} erros`);

    return {
      success: results.failed === 0,
      ...results
    };
  }

  /**
   * Testa a conectividade com o webhook
   * @returns {Promise<Object>}
   */
  async testConnection() {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'CONTACTS_WEBHOOK_URL não configurado',
        configured: false
      };
    }

    try {
      // Faz um request OPTIONS ou HEAD para verificar se o endpoint existe
      const headers = { 'Content-Type': 'application/json' };
      if (this.authHeader) headers['Authorization'] = this.authHeader;

      const response = await axios.head(this.webhookUrl, {
        headers,
        timeout: 10000,
        validateStatus: (status) => status < 500 // Aceita qualquer resposta < 500
      });

      return {
        success: true,
        status: response.status,
        url: this.webhookUrl,
        configured: true
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        url: this.webhookUrl,
        configured: true
      };
    }
  }
}

module.exports = new ContactWebhookService();
