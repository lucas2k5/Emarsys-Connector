/**
 * Serviço de envio de contatos via Webhook.
 *
 * Substitui o envio via API Emarsys (WSSE/OAuth2).
 * Transforma os dados do contato no payload esperado pelo webhook externo.
 *
 * Payload enviado:
 * {
 *   "customer_id": "base64(md5(cpf ou email))",
 *   "client_type": "hope",
 *   "email": "...",
 *   "cpf": "...",
 *   "bday": "YYYY-MM-DD",
 *   "first_name": "...",
 *   "last_name": "...",
 *   "phone": "+55...",
 *   "mobile": "+55...",
 *   "gender": "masculino|feminino|outro",
 *   "address": "...",
 *   "city": "...",
 *   "state": "...",
 *   "country": "Brasil",
 *   "postal_code": "...",
 *   "opt_in": true|false,
 *   "registration_data": "ISO 8601"
 * }
 *
 * TODO: Definir CONTACTS_WEBHOOK_URL no .env quando o endpoint for fornecido.
 */
const axios = require('axios');
const crypto = require('crypto');
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
    if (!doc || typeof doc !== 'string') return '';
    return doc.replace(/[^\d]/g, '');
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
    // Suporta tanto campos nomeados quanto IDs numéricos da Emarsys
    const email = (contactData.email || contactData['3'] || '').trim().toLowerCase();
    const cpf = this.cleanDocument(contactData.cpf || contactData.document || contactData['43'] || '');
    const firstName = (contactData.first_name || contactData.firstName || contactData['1'] || '').trim();
    const lastName = (contactData.last_name || contactData.lastName || contactData['2'] || '').trim();
    const phone = this.normalizePhone(contactData.phone || contactData['15'] || '');
    const mobile = this.normalizePhone(contactData.mobile || contactData['37'] || '');
    const birthDate = this.normalizeDate(contactData.birth_date || contactData.bday || contactData.birthDate || contactData['4'] || '');
    const gender = this.normalizeGender(contactData.gender || contactData['5'] || '');
    const optIn = this.normalizeOptIn(contactData.opt_in ?? contactData.optin ?? contactData['31']);
    const address = (contactData.address || '').trim();
    const city = (contactData.city || contactData['11'] || '').trim();
    const state = (contactData.state || contactData['12'] || '').trim();
    const country = (contactData.country || contactData['14'] || 'Brasil').trim();
    const postalCode = (contactData.postal_code || contactData.zip_code || contactData['13'] || '').trim();
    const registrationData = contactData.registration_data || contactData.createdIn || new Date().toISOString();

    const payload = {
      customer_id: this.generateCustomerId(cpf, email),
      client_type: this.clientType,
      email,
      cpf,
      bday: birthDate,
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
      opt_in: optIn,
      registration_data: registrationData
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

    // Monta headers
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
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
      maskedPayload.cpf = maskedPayload.cpf.slice(0, 3) + '***' + maskedPayload.cpf.slice(-2);
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

        return {
          success: true,
          action: 'sent_to_webhook',
          data: response.data,
          status: response.status,
          attempts: attempt
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
          retryable: isRetryable
        });

        if (!isRetryable) {
          // Erro não-retryável (400, 401, 403, etc.) - falha imediata
          return {
            success: false,
            error: error.message,
            errorType: status === 401 || status === 403 ? 'AUTH_ERROR' : 'VALIDATION_ERROR',
            status,
            data,
            retryable: false,
            attempts: attempt
          };
        }

        if (attempt < maxRetries) {
          const delay = retryDelay * Math.pow(2, attempt - 1);
          console.log(`⏳ [ContactWebhook] Aguardando ${delay}ms antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      error: `Falha após ${maxRetries} tentativas: ${lastError.message}`,
      errorType: 'NETWORK_ERROR',
      retryable: true,
      attempts: maxRetries
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
