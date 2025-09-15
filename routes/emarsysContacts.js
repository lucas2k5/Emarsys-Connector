const express = require('express');
const router = express.Router();
const emarsysContactsService = require('../services/emarsysContactsService');

console.log('EmarsysContacts routes loaded');

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
 * @desc Envia arquivo CSV de contatos para Emarsys
 * @access Public
 * @body {string} [filename] - Nome específico do arquivo (opcional, usa o mais recente se não informado)
 */
router.post('/send', async (req, res) => {
  try {
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
 * @desc Cria um contato individual via API v2
 * @access Public
 * @body {Object} contact - Dados do contato no formato Emarsys
 */
router.post('/create', async (req, res) => {
  try {
    console.log('👤 Criando contato individual...');
    
    const { contact } = req.body;
    
    if (!contact || !contact['3']) {
      return res.status(400).json({
        success: false,
        error: 'Campo email (3) é obrigatório',
        timestamp: new Date().toISOString()
      });
    }
    
    const emarsysImportService = require('../services/emarsysContactImportService');
    const result = await emarsysImportService.createContact(contact);
    
    if (result.success) {
      res.status(201).json({
        success: true,
        message: 'Contato criado com sucesso',
        data: result.data,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(result.status || 500).json({
        success: false,
        error: result.error,
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
    const defaultExports = process.env.VERCEL ? '/tmp/exports' : path.join(__dirname, '..', 'exports');
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
    const defaultExports = process.env.VERCEL ? '/tmp/exports' : path.join(__dirname, '..', 'exports');
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
    const defaultExports = process.env.VERCEL ? '/tmp/exports' : path.join(__dirname, '..', 'exports');
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
 * @route POST /api/emarsys/contacts/create-single
 * @desc Cria um contato único via trigger automática
 * @access Public
 * @body {string} nome - Nome do contato
 * @body {string} email - Email do contato (obrigatório)
 * @body {string} [phone] - Telefone do contato
 * @body {string} [birth_of_date] - Data de nascimento (formato: YYYY-MM-DD)
 */
// Lock simples em memória para evitar duplicidade em janela curta
const __inFlightCreateByEmail = new Map();
const IDEMPOTENCY_WINDOW_MS = 15000;

router.post('/create-single', async (req, res) => {
  try {
    console.log('👤 Criando contato único via trigger...');
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
        if (clone.birth_of_date) {
          clone.birth_of_date = '****-**-**';
        }
        if (clone.zip_code) {
          clone.zip_code = String(clone.zip_code).replace(/\d(?=\d{2})/g, '*');
        }
        return clone;
      };
      const maskedBody = mask(req.body);
      const headersToLog = {
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type']
      };
      auditLogger.info('Create single contact - incoming request', {
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
    
    const { nome, last_name, email, phone, birth_of_date, optin, city, state, zip_code, country } = req.body;

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
    
    if (!nome) {
      return res.status(400).json({
        success: false,
        error: 'Campo nome é obrigatório',
        timestamp: new Date().toISOString()
      });
    }
    
    // Idempotência: evita processar múltiplas vezes o mesmo email em janela curta
    const emailKey = String(email || '').trim().toLowerCase();
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

    // Prepara os dados do contato no formato Emarsys
    const contact = {
      '3': emailKey, // Campo 3 = Email (chave primária)
      '1': nome.split(' ')[0] || nome, // Campo 1 = Primeiro nome (first_name)
      '2': last_name || nome.split(' ').slice(1).join(' ') || '', // Campo 2 = Sobrenome (last_name)
    };
    
    // Adiciona telefone se fornecido
    if (phone) {
      contact['15'] = phone; // Campo 15 = Telefone (phone)
    }
    
    // Adiciona data de nascimento se fornecida
    if (birth_of_date) {
      // Converte para formato Emarsys (YYYY-MM-DD)
      const birthDate = new Date(birth_of_date);
      if (!isNaN(birthDate.getTime())) {
        contact['4'] = birth_of_date; // Campo 4 = Data de nascimento (birth_date)
      }
    }
    
    // Define opt-in se informado (campo 31). Normaliza para 0/1
    if (typeof optin !== 'undefined') {
      contact['31'] = Number(Boolean(optin));
    }
    
    // Adiciona cidade se fornecida
    if (city) {
      contact['11'] = city; // Campo 11 = Cidade (city)
    }
    
    // Adiciona estado se fornecido
    if (state) {
      contact['12'] = state; // Campo 12 = Estado (state)
    }
    
    // Adiciona CEP se fornecido
    if (zip_code) {
      contact['13'] = zip_code; // Campo 13 = CEP (zip_code)
    }
    
    // Adiciona país se fornecido
    if (country) {
      // Mapeia o nome do país para o ID válido da Emarsys
      const countryId = mapCountryToEmarsysId(country);
      if (countryId) {
        contact['14'] = countryId; // Campo 14 = País (country) - ID válido
      } else {
        console.warn(`⚠️ País não reconhecido: ${country}. Campo country será omitido.`);
      }
    }
    
    try {
      const { logger } = require('../utils/logger');
      logger.info('Dados do contato preparados (masked)', {
        contact: {
          ...contact,
          '3': contact['3'] ? `${String(contact['3']).slice(0, 2)}***@${String(contact['3']).split('@')[1] || ''}` : undefined,
          '15': contact['15'] ? String(contact['15']).replace(/\d(?=\d{2})/g, '*') : undefined,
          '4': contact['4'] ? '****-**-**' : undefined,
          '13': contact['13'] ? String(contact['13']).replace(/\d(?=\d{2})/g, '*') : undefined,
        }
      });
    } catch (_) {}
    
    // Usa o serviço de importação da Emarsys
    const emarsysImportService = require('../services/emarsysContactImportService');
    // Loga payload real que será enviado (serviço também mascara ao logar)
    const { logger } = require('../utils/logger');
    logger.info('Emarsys upsert payload (pre-send)', { reqId, payload: { key_id: '3', ...contact } });
    const result = await emarsysImportService.createContact(contact);
    
    if (result.success) {
      const action = result.action || 'created';
      const message = action === 'updated' 
        ? 'Contato atualizado com sucesso via trigger' 
        : 'Contato criado com sucesso via trigger';
      
      res.status(201).json({
        success: true,
        message,
        action,
        data: {
          contact: {
            nome,
            last_name: last_name || '',
            email: emailKey,
            phone: phone || '',
            birth_of_date: birth_of_date || '',
            optin: typeof optin !== 'undefined' ? Boolean(optin) : null,
            city: city || '',
            state: state || '',
            zip_code: zip_code || '',
            country: country || '',
          },
          emarsysResponse: result.data
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(result.status || 500).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Erro ao criar contato único:', error);
    res.status(500).json({
      success: false,
      error: error.message,
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
  return countryMap[normalizedCountry] || null;
}

// Adiciona a função ao objeto router para poder ser chamada
router.mapCountryToEmarsysId = mapCountryToEmarsysId;

module.exports = router;
