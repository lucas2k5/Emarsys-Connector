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

module.exports = router;
