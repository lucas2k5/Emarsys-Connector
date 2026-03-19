const express = require('express');
const router = express.Router();
const emarsysContactsService = require('../services/emarsysContactsService');
const ContactService = require('../services/contactService');

console.log('EmarsysContacts routes loaded');

// Normaliza datas para o formato YYYY-MM-DD (aceita ISO como 1995-01-10T00:00:00Z)
function normalizeBirthDate(input) {
  if (!input) return null;
  const raw = String(input).trim();
  // Já está no formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // ISO com tempo
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

// Remove formatação de documentos (CPF, CNPJ, etc)
function cleanDocument(document) {
  if (!document || typeof document !== 'string') {
    return '';
  }
  return document.replace(/[.\-\s]/g, '');
}

// Normaliza telefone brasileiro adicionando +55 se necessário
function normalizarTelefone(phone) {
  if (!phone) return '';
  
  const limpo = phone.trim().replace(/[^\d+]/g, '');
  
  if (limpo.startsWith('+55')) return limpo;
  if (limpo.startsWith('55')) return '+' + limpo;
  
  return '+55' + limpo;
}

/**
 * @route GET /api/emarsys/contacts/files
 * @desc Lista todos os arquivos CSV de contatos disponíveis
 * @access Public
 */
router.get('/files', async (req, res) => {
  try {
    console.log('📋 Listando arquivos CSV de contatos...');
    
    const files = await emarsysContactsService.listContactsCsvFiles();
    
    res.json({
      success: true,
      message: `${files.length} arquivo(s) CSV de contatos encontrado(s)`,
      data: {
        totalFiles: files.length,
        files: files
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao listar arquivos CSV de contatos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/emarsys/contacts/stats
 * @desc Obtém estatísticas dos arquivos CSV de contatos
 * @access Public
 */
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Obtendo estatísticas dos arquivos CSV de contatos...');
    
    const stats = await emarsysContactsService.getContactsFilesStats();
    
    res.json({
      success: true,
      message: 'Estatísticas obtidas com sucesso',
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/emarsys/contacts/latest
 * @desc Obtém informações do último arquivo CSV de contatos
 * @access Public
 */
router.get('/latest', async (req, res) => {
  try {
    console.log('🔍 Buscando último arquivo CSV de contatos...');
    
    const latestFile = await emarsysContactsService.getLatestContactsCsvFile();
    
    if (!latestFile) {
      return res.status(404).json({
        success: false,
        message: 'Nenhum arquivo CSV de contatos encontrado',
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      message: 'Último arquivo encontrado',
      data: {
        filename: latestFile.filename,
        size: latestFile.size,
        sizeFormatted: `${(latestFile.size / 1024 / 1024).toFixed(2)} MB`,
        modified: latestFile.modified,
        modifiedFormatted: latestFile.modified.toISOString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao buscar último arquivo:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/emarsys/contacts/send
 * @desc [DEPRECIADO] Envia arquivo CSV de contatos para Emarsys.
 *       Contatos agora devem ser enviados via webhook (/create-single ou /create).
 *       Esta rota é mantida para compatibilidade temporária.
 * @access Public
 * @body {string} [filename] - Nome específico do arquivo (opcional, usa o mais recente se não informado)
 */
router.post('/send', async (req, res) => {
  try {
    console.warn('⚠️ [DEPRECIADO] Rota /send será removida. Use /create-single (webhook) para enviar contatos.');
    console.log('🚀 Iniciando envio de arquivo CSV de contatos para Emarsys...');
    
    const { filename } = req.body;
    
    if (filename) {
      console.log(`📄 Arquivo específico solicitado: ${filename}`);
    } else {
      console.log('📄 Usando arquivo mais recente');
    }
    
    const result = await emarsysContactsService.sendContactsCsvToEmarsys(filename);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Arquivo CSV de contatos enviado com sucesso para Emarsys',
        data: result,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erro ao enviar arquivo CSV de contatos para Emarsys',
        error: result.error,
        data: result,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Erro na rota de envio de contatos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/emarsys/contacts/send-webdav
 * @desc Envia arquivo CSV de contatos para Emarsys via WebDAV especificamente
 * @access Public
 * @body {string} [filename] - Nome específico do arquivo (opcional, usa o mais recente se não informado)
 */
router.post('/send-webdav', async (req, res) => {
  try {
    console.log('🚀 Iniciando envio via WebDAV...');
    
    const { filename } = req.body;
    
    const result = await emarsysContactsService.sendContactsCsvViaWebDAV(filename);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Arquivo CSV enviado com sucesso via WebDAV',
        data: result,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erro ao enviar arquivo via WebDAV',
        error: result.error,
        data: result,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Erro no envio via WebDAV:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/emarsys/contacts/send-api
 * @desc Envia arquivo CSV de contatos para Emarsys via API especificamente
 * @access Public
 * @body {string} [filename] - Nome específico do arquivo (opcional, usa o mais recente se não informado)
 */
router.post('/send-api', async (req, res) => {
  try {
    console.log('🚀 Iniciando envio via API...');
    
    const { filename } = req.body;
    
    const result = await emarsysContactsService.sendContactsCsvViaAPI(filename);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Arquivo CSV enviado com sucesso via API',
        data: result,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erro ao enviar arquivo via API',
        error: result.error,
        data: result,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Erro no envio via API:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/emarsys/contacts/test
 * @desc Testa a conectividade com os serviços da Emarsys para contatos
 * @access Public
 */
router.get('/test', async (req, res) => {
  try {
    console.log('🧪 Testando conectividade dos serviços de contatos...');
    
    const testResults = await emarsysContactsService.testConnectivity();
    
    res.json({
      success: true,
      message: 'Teste de conectividade concluído',
      data: testResults,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro no teste de conectividade:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/emarsys/contacts/import
 * @desc Importa contatos diretamente via API v2 com WSSE
 * @access Public
 * @body {string} [filename] - Nome específico do arquivo (opcional, usa o mais recente se não informado)
 * @body {number} [batchSize] - Tamanho do lote para importação (padrão: 1000)
 */
router.post('/import', async (req, res) => {
  try {
    console.log('🚀 Iniciando importação direta via API v2...');
    
    const { filename, batchSize } = req.body;
    
    const emarsysImportService = require('../services/emarsysContactImportService');
    const result = await emarsysImportService.importContactsFromCsv(filename, { batchSize });
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Importação de contatos concluída com sucesso',
        data: result,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erro na importação de contatos',
        error: result.error,
        data: result,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Erro na rota de importação:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/emarsys/contacts/fields
 * @desc Lista campos disponíveis na Emarsys
 * @access Public
 */
router.get('/fields', async (req, res) => {
  try {
    console.log('📋 Buscando campos disponíveis na Emarsys...');
    
    const emarsysImportService = require('../services/emarsysContactImportService');
    const result = await emarsysImportService.getAvailableFields();
    
    if (result.success) {
      res.json({
        success: true,
        message: `${result.count} campo(s) disponível(is)`,
        data: {
          fields: result.fields,
          count: result.count
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Erro ao buscar campos:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/emarsys/contacts/create
 * @desc Cria um contato individual via webhook
 * @access Public
 * @body {Object} contact - Dados do contato (formato Emarsys com IDs numéricos ou campos nomeados)
 */
router.post('/create', async (req, res) => {
  try {
    console.log('👤 Criando contato individual via webhook...');

    const { contact } = req.body;

    // Aceita tanto campo '3' (ID Emarsys) quanto 'email' (nomeado)
    const email = contact && (contact['3'] || contact.email);
    if (!contact || !email) {
      return res.status(400).json({
        success: false,
        error: 'Campo email (3 ou email) é obrigatório',
        timestamp: new Date().toISOString()
      });
    }

    // Usa o serviço de webhook em vez da API Emarsys
    const contactWebhookService = require('../services/contactWebhookService');
    const result = await contactWebhookService.sendContact(contact);

    if (result.success) {
      res.status(201).json({
        success: true,
        message: 'Contato enviado com sucesso via webhook',
        data: result.data,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(result.status || 500).json({
        success: false,
        error: result.error,
        errorType: result.errorType,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Erro ao criar contato:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/emarsys/contacts/download/:filename
 * @desc Faz download de um arquivo CSV de contatos específico
 * @access Public
 */
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    console.log(`📥 Download solicitado: ${filename}`);
    
    const path = require('path');
    const defaultExports = path.join(__dirname, '..', 'exports');
    const exportsDir = process.env.EXPORTS_DIR || defaultExports;
    const filePath = path.join(exportsDir, filename);
    
    // Verifica se o arquivo existe
    const fs = require('fs').promises;
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: `Arquivo não encontrado: ${filename}`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Verifica se é um arquivo de contatos válido
    if (!filename.endsWith('.csv') || !(
      filename.includes('contatos') || 
      filename.includes('contacts') ||
      filename.includes('cl-with-addresses') ||
      filename.includes('customers')
    )) {
      return res.status(400).json({
        success: false,
        error: 'Arquivo não é um CSV de contatos válido',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`✅ Enviando arquivo: ${filename}`);
    res.download(filePath, filename);
    
  } catch (error) {
    console.error('❌ Erro no download:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/emarsys/contacts/preview/:filename
 * @desc Mostra preview de um arquivo CSV de contatos
 * @access Public
 */
router.get('/preview/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const lines = parseInt(req.query.lines) || 10;
    
    console.log(`👁️ Preview solicitado: ${filename} (${lines} linhas)`);
    
    const path = require('path');
    const fs = require('fs').promises;
    const defaultExports = path.join(__dirname, '..', 'exports');
    const exportsDir = process.env.EXPORTS_DIR || defaultExports;
    const filePath = path.join(exportsDir, filename);
    
    // Verifica se o arquivo existe
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: `Arquivo não encontrado: ${filename}`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Lê o arquivo
    const content = await fs.readFile(filePath, 'utf8');
    const allLines = content.split('\n').filter(line => line.trim() !== '');
    const previewLines = allLines.slice(0, lines);
    
    const stats = await fs.stat(filePath);
    
    res.json({
      success: true,
      message: `Preview de ${filename}`,
      data: {
        filename,
        totalLines: allLines.length,
        previewLines: previewLines.length,
        fileSize: stats.size,
        fileSizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
        modified: stats.mtime.toISOString(),
        preview: previewLines
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro no preview:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route DELETE /api/emarsys/contacts/files/:filename
 * @desc Remove um arquivo CSV de contatos específico
 * @access Public
 */
router.delete('/files/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    console.log(`🗑️ Remoção solicitada: ${filename}`);
    
    const path = require('path');
    const fs = require('fs').promises;
    const defaultExports = path.join(__dirname, '..', 'exports');
    const exportsDir = process.env.EXPORTS_DIR || defaultExports;
    const filePath = path.join(exportsDir, filename);
    
    // Verifica se o arquivo existe
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: `Arquivo não encontrado: ${filename}`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Verifica se é um arquivo de contatos válido
    if (!filename.endsWith('.csv') || !(
      filename.includes('contatos') || 
      filename.includes('contacts') ||
      filename.includes('cl-with-addresses') ||
      filename.includes('customers')
    )) {
      return res.status(400).json({
        success: false,
        error: 'Arquivo não é um CSV de contatos válido',
        timestamp: new Date().toISOString()
      });
    }
    
    // Remove o arquivo
    await fs.unlink(filePath);
    
    console.log(`✅ Arquivo removido: ${filename}`);
    
    res.json({
      success: true,
      message: `Arquivo ${filename} removido com sucesso`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro na remoção:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/emarsys/contacts/extract-recent
 * @desc Extrai contatos criados ou alterados nas últimas 6 horas e gera CSV
 * @access Public
 * @body {number} [hours=6] - Número de horas para buscar (padrão: 6)
 * @body {string} [filename] - Nome base do arquivo CSV (opcional)
 * @body {boolean} [useScroll=true] - Usar scroll para otimização (padrão: true)
 */
router.post('/extract-recent', async (req, res) => {
  try {
    console.log('🚀 Iniciando extração de contatos recentes...');
    
    const { hours = 6, filename, useScroll = true } = req.body;
    
    // Calcula a data de 6 horas atrás
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - (hours * 60 * 60 * 1000));
    
    console.log(`📅 Buscando contatos criados/alterados desde: ${sixHoursAgo.toISOString()}`);
    console.log(`⏰ Período: ${hours} horas atrás`);
    
    const contactService = require('../services/contactService');
    const contactServiceInstance = new contactService();
    
    // Chama o método para extrair contatos recentes
    const result = await contactServiceInstance.extractRecentContacts({
      hours,
      filename: filename || 'contatos-recentes',
      useScroll,
      startDate: sixHoursAgo.toISOString(),
      endDate: now.toISOString()
    });

    if (result.success) {
      res.status(200).json({
        success: true,
        message: `Extração de contatos recentes (${hours}h) concluída com sucesso`,
        data: {
          ...result,
          period: {
            hours,
            startDate: sixHoursAgo.toISOString(),
            endDate: now.toISOString()
          }
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Erro na rota de extração de contatos recentes:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/emarsys/contacts/create-single-from-ad
 * @desc Recebe userId da AD + endereço, busca email na CL e cria contato
 * @access Public
 * @body {string} userId - ID do usuário (CL.id / AD.userId)
 * @body {string} [state]
 * @body {string} [city]
 * @body {string} [country]
 * @body {string} [zip_code]
 */
router.post('/create-single-from-ad', async (req, res) => {
  try {
    console.log('🔗 Criando contato a partir do userId (AD) + endereço...');
    
    // Log detalhado para debug
    console.log('📝 Dados recebidos:', {
      hasBody: !!req.body,
      bodyType: typeof req.body,
      bodyKeys: req.body ? Object.keys(req.body) : 'N/A',
      contentLength: req.get('content-length'),
      contentType: req.get('content-type')
    });
    
    // Validação adicional do body da requisição
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Body da requisição inválido ou vazio',
        timestamp: new Date().toISOString()
      });
    }
    
    const { userId, state, city, country, zip_code } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Campo userId é obrigatório',
        timestamp: new Date().toISOString()
      });
    }

    const contactService = new ContactService();
    const clRecord = await contactService.getCLRecordById(userId);

    if (!clRecord || !clRecord.email) {
      return res.status(404).json({
        success: false,
        error: 'Email não encontrado para o userId informado',
        timestamp: new Date().toISOString()
      });
    }

    const firstName = clRecord.firstName;
    const lastName = clRecord.lastName;

    const forwardBody = {
      first_name: firstName,
      last_name: lastName,
      email: clRecord.email,
      city: city || '',
      state: state || '',
      country: "24",
      document: clRecord.document || '',
      zip_code: zip_code || ''
    };

    // Envia para o webhook usando o novo serviço (substitui API Emarsys)
    const contactWebhookService = require('../services/contactWebhookService');

    const result = await contactWebhookService.sendContact(forwardBody);

    if (result.success) {
      const message = 'Contato enviado com sucesso via webhook (userId + endereço)';

      const { logger } = require('../utils/logger');
      logger.info('Contato processado com sucesso via userId + endereço (webhook)', {
        action: result.action,
        userId,
        email: forwardBody.email,
        webhookResponse: result.data,
        timestamp: new Date().toISOString()
      });

      return res.status(201).json({
        success: true,
        message,
        action: result.action,
        data: {
          contact: forwardBody,
          webhookResponse: result.data
        },
        timestamp: new Date().toISOString()
      });
    }

    return res.status(result.status || 500).json({
      success: false,
      error: result.error,
      errorType: result.errorType,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao criar contato a partir do userId:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/emarsys/contacts/create-single
 * @desc Cria um contato único via trigger automática
 * @access Public
 * @body {string} first_name - Primeiro nome do contato
 * @body {string} email - Email do contato (obrigatório)
 * @body {string} [phone] - Telefone do contato
 * @body {string} [mobile] - Celular do contato
 * @body {string} [birth_date] - Data de nascimento (formato: YYYY-MM-DD)
 */
// Lock simples em memória para evitar duplicidade em janela curta
const __inFlightCreateByEmail = new Map();
const IDEMPOTENCY_WINDOW_MS = 15000;

router.post('/create-single', async (req, res) => {
  let emailKey = '';
  try {
    console.log('👤 Criando contato único via webhook...');
    try {
      const { logger, auditLogger } = require('../utils/logger');
      const mask = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const clone = { ...obj };
        if (clone.email) {
          const [user, domain] = String(clone.email).split('@');
          clone.email = user && domain ? `${user.slice(0, 2)}***@${domain}` : '***';
        }
        if (clone.phone) {
          clone.phone = String(clone.phone).replace(/\d(?=\d{2})/g, '*');
        }
        if (clone.mobile) {
          clone.mobile = String(clone.mobile).replace(/\d(?=\d{2})/g, '*');
        }
        if (clone.birth_date) {
          clone.birth_date = '****-**-**';
        }
        if (clone.zip_code) {
          clone.zip_code = String(clone.zip_code).replace(/\d(?=\d{2})/g, '*');
        }
        if (clone.document) {
          clone.document = String(clone.document).replace(/\d(?=\d{2})/g, '*');
        }
        return clone;
      };
      const maskedBody = mask(req.body);
      const headersToLog = {
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type']
      };
      auditLogger.info('Create single contact - incoming request (webhook)', {
        route: '/api/emarsys/contacts/create-single',
        method: 'POST',
        headers: headersToLog,
        body: maskedBody,
        query: req.query,
        timestamp: new Date().toISOString()
      });
      logger.http('Incoming request body (masked)', { body: maskedBody });
    } catch (e) {
      console.warn('⚠️ Falha ao logar auditoria da requisição:', e.message);
    }

    const { first_name, last_name, email, phone, mobile, birth_date, gender, optin, city, state, zip_code, country, document, address, postal_code } = req.body;

    // X-Request-Id para correlação
    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    res.set('X-Request-Id', reqId);

    // Validação dos campos obrigatórios
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Campo email é obrigatório',
        timestamp: new Date().toISOString()
      });
    }

    // Verifica se o webhook está configurado
    const contactWebhookService = require('../services/contactWebhookService');
    if (!contactWebhookService.isConfigured()) {
      return res.status(500).json({
        success: false,
        error: 'CONTACTS_WEBHOOK_URL não configurado no .env',
        message: 'Configure a variável CONTACTS_WEBHOOK_URL com a URL do webhook de contatos',
        timestamp: new Date().toISOString()
      });
    }

    // Validação de credenciais VTEX (necessárias para desofuscar email e buscar opt-in)
    const missingCredentials = [];
    if (!process.env.VTEX_BASE_URL) missingCredentials.push('VTEX_BASE_URL');
    if (!process.env.VTEX_APP_KEY) missingCredentials.push('VTEX_APP_KEY');
    if (!process.env.VTEX_APP_TOKEN) missingCredentials.push('VTEX_APP_TOKEN');

    if (missingCredentials.length > 0) {
      console.warn(`⚠️ Credenciais VTEX faltando: ${missingCredentials.join(', ')}. Enriquecimento de dados desabilitado.`);
    }

    // Idempotência: evita processar múltiplas vezes o mesmo email em janela curta
    emailKey = String(email || '').trim().toLowerCase();
    const nowTs = Date.now();
    const lastTs = __inFlightCreateByEmail.get(emailKey) || 0;
    if (emailKey && nowTs - lastTs < IDEMPOTENCY_WINDOW_MS) {
      const { logger } = require('../utils/logger');
      logger.info('Idempotency guard: skipping duplicate request within window', { reqId, email: emailKey });
      return res.status(202).json({
        success: true,
        skipped: true,
        reason: 'duplicate within 15s',
        timestamp: new Date().toISOString()
      });
    }
    if (emailKey) {
      __inFlightCreateByEmail.set(emailKey, nowTs);
      setTimeout(() => __inFlightCreateByEmail.delete(emailKey), IDEMPOTENCY_WINDOW_MS);
    }

    // Obtém email real se necessário (desofuscar email) - só se VTEX estiver configurado
    let realEmail = emailKey;
    let optinStatus = optin;

    if (missingCredentials.length === 0) {
      const VtexOrdersService = require('../services/vtexOrdersService');
      const vtexOrdersService = new VtexOrdersService();

      try {
        const emailMapping = await vtexOrdersService.getRealEmail(emailKey);
        if (emailMapping && emailMapping.email) {
          realEmail = emailMapping.email;
          console.log('👤 Email desofuscado:', realEmail);
        }
      } catch (error) {
        console.warn(`⚠️ Erro ao obter email real para ${emailKey}:`, error.message);
      }

      // Busca o status de isNewsletterOptIn da CL (Customer List)
      try {
        const clOptIn = await vtexOrdersService.getCLOptInStatus(realEmail);
        if (clOptIn !== null) {
          optinStatus = clOptIn;
          console.log('✅ Usando optinStatus da CL:', optinStatus);
        }
      } catch (error) {
        console.error(`❌ Erro ao buscar isNewsletterOptIn da CL para ${realEmail}:`, error.message);
      }
    }

    // Monta os dados do contato no formato que o contactWebhookService espera
    const contactData = {
      email: realEmail,
      first_name: first_name || '',
      last_name: last_name || '',
      phone: phone || '',
      mobile: mobile || '',
      birth_date: birth_date || '',
      gender: gender || '',
      optin: optinStatus,
      address: address || '',
      city: city || '',
      state: state || '',
      country: country || 'Brasil',
      postal_code: postal_code || zip_code || '',
      document: document || ''
    };

    try {
      const { logger } = require('../utils/logger');
      logger.info('Webhook payload preparado (pre-send)', { reqId, email: realEmail });
    } catch (_) {}

    // Envia para o webhook usando o novo serviço
    const retryOptions = {
      maxRetries: 3,
      retryDelay: 1000
    };

    const result = await contactWebhookService.sendContact(contactData, retryOptions);

    if (result.success) {
      res.status(201).json({
        success: true,
        message: 'Contato enviado com sucesso via webhook',
        action: result.action,
        data: {
          contact: {
            first_name: first_name || '',
            last_name: last_name || '',
            email: emailKey,
            phone: phone || '',
            mobile: mobile || '',
            birth_date: normalizeBirthDate(birth_date) || '',
            gender: gender || '',
            opt_in: contactWebhookService.normalizeOptIn(optinStatus),
            city: city || '',
            state: state || '',
            postal_code: postal_code || zip_code || '',
            country: country || 'Brasil',
            document: document || '',
          },
          webhookResponse: result.data
        },
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('❌ Falha ao enviar contato para webhook:', {
        error: result.error,
        errorType: result.errorType,
        retryable: result.retryable,
        attempts: result.attempts,
        email: emailKey
      });

      let httpStatus = result.status || 500;
      if (result.errorType === 'VALIDATION_ERROR') httpStatus = 400;
      else if (result.errorType === 'AUTH_ERROR') httpStatus = 401;
      else if (result.errorType === 'CONFIG_ERROR') httpStatus = 500;

      res.status(httpStatus).json({
        success: false,
        error: result.error,
        errorType: result.errorType,
        retryable: result.retryable,
        attempts: result.attempts,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Erro ao criar contato único:', {
      message: error.message,
      stack: error.stack,
      email: emailKey
    });

    res.status(500).json({
      success: false,
      error: error.message,
      errorType: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Mapeia nomes de países para IDs válidos da Emarsys
 * @param {string} countryName - Nome do país
 * @returns {string|number|null} ID válido da Emarsys ou null se não encontrado
 */
function mapCountryToEmarsysId(countryName) {
  if (!countryName) return null;
  
  const countryMap = {
    // Mapeamento baseado nos IDs padrão da Emarsys para países
    'brazil': 'BR',
    'brasil': 'BR',
    'br': 'BR',
    'united states': 'US',
    'usa': 'US',
    'us': 'US',
    'united kingdom': 'GB',
    'uk': 'GB',
    'great britain': 'GB',
    'canada': 'CA',
    'ca': 'CA',
    'australia': 'AU',
    'au': 'AU',
    'germany': 'DE',
    'de': 'DE',
    'france': 'FR',
    'fr': 'FR',
    'spain': 'ES',
    'es': 'ES',
    'italy': 'IT',
    'it': 'IT',
    'portugal': 'PT',
    'pt': 'PT',
    'argentina': 'AR',
    'ar': 'AR',
    'chile': 'CL',
    'cl': 'CL',
    'colombia': 'CO',
    'co': 'CO',
    'mexico': 'MX',
    'mx': 'MX',
    'peru': 'PE',
    'pe': 'PE',
    'uruguay': 'UY',
    'uy': 'UY',
    'paraguay': 'PY',
    'py': 'PY',
    'bolivia': 'BO',
    'bo': 'BO',
    'venezuela': 'VE',
    've': 'VE',
    'ecuador': 'EC',
    'ec': 'EC',
    'japan': 'JP',
    'jp': 'JP',
    'china': 'CN',
    'cn': 'CN',
    'india': 'IN',
    'in': 'IN',
    'russia': 'RU',
    'ru': 'RU',
    'south korea': 'KR',
    'korea': 'KR',
    'kr': 'KR',
    'netherlands': 'NL',
    'nl': 'NL',
    'belgium': 'BE',
    'be': 'BE',
    'switzerland': 'CH',
    'ch': 'CH',
    'austria': 'AT',
    'at': 'AT',
    'sweden': 'SE',
    'se': 'SE',
    'norway': 'NO',
    'no': 'NO',
    'denmark': 'DK',
    'dk': 'DK',
    'finland': 'FI',
    'fi': 'FI',
    'poland': 'PL',
    'pl': 'PL',
    'czech republic': 'CZ',
    'czech': 'CZ',
    'cz': 'CZ',
    'hungary': 'HU',
    'hu': 'HU',
    'romania': 'RO',
    'ro': 'RO',
    'bulgaria': 'BG',
    'bg': 'BG',
    'croatia': 'HR',
    'hr': 'HR',
    'slovenia': 'SI',
    'si': 'SI',
    'slovakia': 'SK',
    'sk': 'SK',
    'estonia': 'EE',
    'ee': 'EE',
    'latvia': 'LV',
    'lv': 'LV',
    'lithuania': 'LT',
    'lt': 'LT',
    'greece': 'GR',
    'gr': 'GR',
    'turkey': 'TR',
    'tr': 'TR',
    'israel': 'IL',
    'il': 'IL',
    'south africa': 'ZA',
    'za': 'ZA',
    'egypt': 'EG',
    'eg': 'EG',
    'morocco': 'MA',
    'ma': 'MA',
    'tunisia': 'TN',
    'tn': 'TN',
    'algeria': 'DZ',
    'dz': 'DZ',
    'libya': 'LY',
    'ly': 'LY',
    'sudan': 'SD',
    'sd': 'SD',
    'ethiopia': 'ET',
    'et': 'ET',
    'kenya': 'KE',
    'ke': 'KE',
    'uganda': 'UG',
    'ug': 'UG',
    'tanzania': 'TZ',
    'tz': 'TZ',
    'ghana': 'GH',
    'gh': 'GH',
    'nigeria': 'NG',
    'ng': 'NG',
    'senegal': 'SN',
    'sn': 'SN',
    'ivory coast': 'CI',
    'cote d\'ivoire': 'CI',
    'ci': 'CI',
    'cameroon': 'CM',
    'cm': 'CM',
    'gabon': 'GA',
    'ga': 'GA',
    'congo': 'CG',
    'cg': 'CG',
    'democratic republic of congo': 'CD',
    'drc': 'CD',
    'cd': 'CD',
    'central african republic': 'CF',
    'cf': 'CF',
    'chad': 'TD',
    'td': 'TD',
    'niger': 'NE',
    'ne': 'NE',
    'mali': 'ML',
    'ml': 'ML',
    'burkina faso': 'BF',
    'bf': 'BF',
    'guinea': 'GN',
    'gn': 'GN',
    'sierra leone': 'SL',
    'sl': 'SL',
    'liberia': 'LR',
    'lr': 'LR',
    'guinea-bissau': 'GW',
    'gw': 'GW',
    'cape verde': 'CV',
    'cv': 'CV',
    'gambia': 'GM',
    'gm': 'GM',
    'guinea-bissau': 'GW',
    'gw': 'GW',
    'sao tome and principe': 'ST',
    'st': 'ST',
    'equatorial guinea': 'GQ',
    'gq': 'GQ',
    'angola': 'AO',
    'ao': 'AO',
    'zambia': 'ZM',
    'zm': 'ZM',
    'zimbabwe': 'ZW',
    'zw': 'ZW',
    'botswana': 'BW',
    'bw': 'BW',
    'namibia': 'NA',
    'na': 'NA',
    'lesotho': 'LS',
    'ls': 'LS',
    'swaziland': 'SZ',
    'sz': 'SZ',
    'malawi': 'MW',
    'mw': 'MW',
    'mozambique': 'MZ',
    'mz': 'MZ',
    'madagascar': 'MG',
    'mg': 'MG',
    'mauritius': 'MU',
    'mu': 'MU',
    'seychelles': 'SC',
    'sc': 'SC',
    'comoros': 'KM',
    'km': 'KM',
    'djibouti': 'DJ',
    'dj': 'DJ',
    'eritrea': 'ER',
    'er': 'ER',
    'somalia': 'SO',
    'so': 'SO',
    'burundi': 'BI',
    'bi': 'BI',
    'rwanda': 'RW',
    'rw': 'RW',
    'congo': 'CG',
    'cg': 'CG',
    'democratic republic of congo': 'CD',
    'drc': 'CD',
    'cd': 'CD',
    'central african republic': 'CF',
    'cf': 'CF',
    'chad': 'TD',
    'td': 'TD',
    'niger': 'NE',
    'ne': 'NE',
    'mali': 'ML',
    'ml': 'ML',
    'burkina faso': 'BF',
    'bf': 'BF',
    'guinea': 'GN',
    'gn': 'GN',
    'sierra leone': 'SL',
    'sl': 'SL',
    'liberia': 'LR',
    'lr': 'LR',
    'guinea-bissau': 'GW',
    'gw': 'GW',
    'cape verde': 'CV',
    'cv': 'CV',
    'gambia': 'GM',
    'gm': 'GM',
    'guinea-bissau': 'GW',
    'gw': 'GW',
    'sao tome and principe': 'ST',
    'st': 'ST',
    'equatorial guinea': 'GQ',
    'gq': 'GQ',
    'angola': 'AO',
    'ao': 'AO',
    'zambia': 'ZM',
    'zm': 'ZM',
    'zimbabwe': 'ZW',
    'zw': 'ZW',
    'botswana': 'BW',
    'bw': 'BW',
    'namibia': 'NA',
    'na': 'NA',
    'lesotho': 'LS',
    'ls': 'LS',
    'swaziland': 'SZ',
    'sz': 'SZ',
    'malawi': 'MW',
    'mw': 'MW',
    'mozambique': 'MZ',
    'mz': 'MZ',
    'madagascar': 'MG',
    'mg': 'MG',
    'mauritius': 'MU',
    'mu': 'MU',
    'seychelles': 'SC',
    'sc': 'SC',
    'comoros': 'KM',
    'km': 'KM',
    'djibouti': 'DJ',
    'dj': 'DJ',
    'eritrea': 'ER',
    'er': 'ER',
    'somalia': 'SO',
    'so': 'SO',
    'burundi': 'BI',
    'bi': 'BI',
    'rwanda': 'RW',
    'rw': 'RW'
  };
  
  const normalizedCountry = countryName.toLowerCase().trim();
  return countryMap[normalizedCountry] || '24';
}

// Adiciona a função ao objeto router para poder ser chamada
router.mapCountryToEmarsysId = mapCountryToEmarsysId;

module.exports = router;
