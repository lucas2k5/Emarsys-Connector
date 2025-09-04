require('dotenv').config({ debug: true });
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class EmarsysContactsService {
  constructor() {
    // Para contatos, vamos usar WebDAV como método principal
    this.webdavUrl = process.env.WEBDAV_FOLDER || process.env.WEBDAV_SERVER;
    this.webdavUser = process.env.WEBDAV_USER;
    this.webdavPass = process.env.WEBDAV_PASS;
    
    // Fallback para API direta se disponível
    this.apiUrl = process.env.EMARSYS_CONTACTS_API_URL || 'https://api.emarsys.net/api/v2/contact/import';
    this.bearerToken = process.env.EMARSYS_CONTACTS_TOKEN;
    
    const defaultExports = process.env.VERCEL ? '/tmp/exports' : path.join(__dirname, '..', 'exports');
    this.exportsDir = process.env.EXPORTS_DIR || defaultExports;
    
    console.log('🔧 [EmarsysContactsService] Constructor inicializado:');
    console.log('   📁 ExportsDir:', this.exportsDir);
    console.log('   🌐 WebDAV URL:', this.webdavUrl ? 'Configurado' : 'NÃO CONFIGURADO');
    console.log('   👤 WebDAV User:', this.webdavUser ? 'Configurado' : 'NÃO CONFIGURADO');
    console.log('   🔐 WebDAV Pass:', this.webdavPass ? 'Configurado' : 'NÃO CONFIGURADO');
    console.log('   🔑 API Token:', this.bearerToken ? 'Configurado' : 'NÃO CONFIGURADO');
  }

  /**
   * Busca o último arquivo CSV de contatos gerado
   * @returns {Object|null} Informações do arquivo ou null se não encontrado
   */
  async getLatestContactsCsvFile() {
    try {
      const files = await fs.readdir(this.exportsDir);
      
      // Procura por arquivos de contatos (gerados pelo extract-contacts)
      const contactCsvFiles = files
        .filter(file => {
          return file.endsWith('.csv') && (
            file.includes('contatos') || 
            file.includes('contacts') ||
            file.includes('cl-with-addresses') ||
            file.includes('customers')
          );
        })
        .map(filename => {
          const filePath = path.join(this.exportsDir, filename);
          return { filename, filePath };
        })
        .sort((a, b) => {
          // Ordena por timestamp no nome do arquivo ou por nome
          const timestampA = a.filename.match(/\d{4}-\d{2}-\d{2}[T_]\d{2}[-:]\d{2}[-:]\d{2}/);
          const timestampB = b.filename.match(/\d{4}-\d{2}-\d{2}[T_]\d{2}[-:]\d{2}[-:]\d{2}/);
          
          if (timestampA && timestampB) {
            return timestampB[0].localeCompare(timestampA[0]);
          }
          return b.filename.localeCompare(a.filename);
        });

      if (contactCsvFiles.length === 0) {
        console.log('📁 Nenhum arquivo CSV de contatos encontrado no diretório exports');
        console.log('📋 Arquivos disponíveis:', files.filter(f => f.endsWith('.csv')));
        return null;
      }

      const latestFile = contactCsvFiles[0];
      const stats = await fs.stat(latestFile.filePath);
      
      console.log(`📄 Último arquivo CSV de contatos encontrado: ${latestFile.filename}`);
      console.log(`📊 Tamanho: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      console.log(`📅 Modificado: ${stats.mtime}`);
      
      return {
        ...latestFile,
        size: stats.size,
        modified: stats.mtime,
        content: null
      };
    } catch (error) {
      console.error('❌ Erro ao buscar último arquivo CSV de contatos:', error.message);
      return null;
    }
  }

  /**
   * Lista todos os arquivos CSV de contatos disponíveis
   * @returns {Array} Lista de arquivos de contatos
   */
  async listContactsCsvFiles() {
    try {
      const files = await fs.readdir(this.exportsDir);
      
      const contactFiles = [];
      for (const filename of files) {
        if (filename.endsWith('.csv') && (
          filename.includes('contatos') || 
          filename.includes('contacts') ||
          filename.includes('cl-with-addresses') ||
          filename.includes('customers')
        )) {
          const filePath = path.join(this.exportsDir, filename);
          const stats = await fs.stat(filePath);
          
          contactFiles.push({
            filename,
            filePath,
            size: stats.size,
            sizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
            modified: stats.mtime,
            modifiedFormatted: stats.mtime.toISOString()
          });
        }
      }
      
      // Ordena por data de modificação (mais recente primeiro)
      contactFiles.sort((a, b) => b.modified - a.modified);
      
      console.log(`📋 Encontrados ${contactFiles.length} arquivos CSV de contatos`);
      return contactFiles;
    } catch (error) {
      console.error('❌ Erro ao listar arquivos CSV de contatos:', error.message);
      return [];
    }
  }

  /**
   * Carrega o conteúdo de um arquivo CSV
   * @param {string} filePath - Caminho do arquivo
   * @returns {string} Conteúdo do arquivo
   */
  async loadCsvContent(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      console.log(`📄 Conteúdo CSV carregado: ${content.length} caracteres`);
      
      // Valida se é um CSV válido
      const lines = content.split('\n').filter(line => line.trim() !== '');
      console.log(`📊 CSV possui ${lines.length} linhas`);
      
      if (lines.length < 2) {
        throw new Error('Arquivo CSV deve ter pelo menos um cabeçalho e uma linha de dados');
      }
      
      return content;
    } catch (error) {
      console.error('❌ Erro ao carregar conteúdo CSV:', error.message);
      throw error;
    }
  }

  /**
   * Envia arquivo CSV de contatos via WebDAV (método principal)
   * @param {string} filename - Nome do arquivo CSV (opcional, usa o mais recente se não informado)
   * @returns {Object} Resultado do envio
   */
  async sendContactsCsvViaWebDAV(filename = null) {
    try {
      console.log('📤 [EmarsysContactsService] Enviando arquivo CSV de contatos via WebDAV...');
      
      if (!this.webdavUrl || !this.webdavUser || !this.webdavPass) {
        throw new Error('Configurações WebDAV não encontradas. Verifique WEBDAV_SERVER, WEBDAV_USER e WEBDAV_PASS');
      }
      
      let csvFile;

      if (filename) {
        // Usa arquivo específico
        const filePath = path.join(this.exportsDir, filename);
        try {
          const stats = await fs.stat(filePath);
          csvFile = { filename, filePath, size: stats.size, modified: stats.mtime };
          console.log(`📄 Usando arquivo específico: ${filename}`);
        } catch (error) {
          throw new Error(`Arquivo não encontrado: ${filename}`);
        }
      } else {
        // Usa o arquivo mais recente
        csvFile = await this.getLatestContactsCsvFile();
        if (!csvFile) {
          throw new Error('Nenhum arquivo CSV de contatos encontrado');
        }
      }

      console.log(`📤 Enviando arquivo ${csvFile.filename} via WebDAV...`);
      console.log(`📊 Tamanho: ${(csvFile.size / 1024 / 1024).toFixed(2)} MB`);
      
      // Usa o serviço WebDAV existente
      const EmarsysWebdavService = require('./emarsysWebdavService');
      const webdavService = new EmarsysWebdavService();
      
      // Define o caminho remoto para contatos (usando /export para compatibilidade com auto-import)
      const remotePath = `/export/${csvFile.filename}`;
      
      const result = await webdavService.uploadCatalogFile(csvFile.filePath, remotePath);
      
      if (result.success) {
        console.log('✅ Upload de contatos via WebDAV concluído com sucesso');
        return {
          success: true,
          method: 'webdav',
          filename: csvFile.filename,
          remotePath: result.remotePath,
          fileSize: csvFile.size,
          fileSizeFormatted: `${(csvFile.size / 1024 / 1024).toFixed(2)} MB`,
          message: 'Contacts CSV uploaded successfully via WebDAV'
        };
      } else {
        throw new Error(`Erro no upload WebDAV: ${result.error}`);
      }

    } catch (error) {
      console.error('❌ Erro ao enviar arquivo CSV de contatos via WebDAV:', error.message);
      
      return {
        success: false,
        method: 'webdav',
        error: error.message,
        filename: filename
      };
    }
  }

  /**
   * Envia arquivo CSV de contatos via API direta (método alternativo)
   * @param {string} filename - Nome do arquivo CSV (opcional, usa o mais recente se não informado)
   * @returns {Object} Resultado do envio
   */
  async sendContactsCsvViaAPI(filename = null) {
    try {
      console.log('📤 [EmarsysContactsService] Enviando arquivo CSV de contatos via API...');
      
      if (!this.bearerToken) {
        throw new Error('Token de API não configurado. Verifique EMARSYS_CONTACTS_TOKEN');
      }
      
      let csvFile;

      if (filename) {
        // Usa arquivo específico
        const filePath = path.join(this.exportsDir, filename);
        try {
          const stats = await fs.stat(filePath);
          csvFile = { filename, filePath, size: stats.size, modified: stats.mtime };
          console.log(`📄 Usando arquivo específico: ${filename}`);
        } catch (error) {
          throw new Error(`Arquivo não encontrado: ${filename}`);
        }
      } else {
        // Usa o arquivo mais recente
        csvFile = await this.getLatestContactsCsvFile();
        if (!csvFile) {
          throw new Error('Nenhum arquivo CSV de contatos encontrado');
        }
      }

      const csvContent = await this.loadCsvContent(csvFile.filePath);
      
      console.log(`📤 Enviando arquivo ${csvFile.filename} (${csvContent.length} caracteres) via API...`);
      console.log('🌐 URL:', this.apiUrl);
      console.log('🔑 Token configurado:', this.bearerToken ? 'Sim' : 'Não');

      const response = await axios.post(this.apiUrl, csvContent, {
        headers: {
          'Authorization': `Bearer ${this.bearerToken}`,
          'Content-Type': 'text/csv',
          'Accept': 'application/json'
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 120000 // 2 minutos para contatos (pode ser arquivo grande)
      });

      console.log('✅ Resposta da Emarsys API recebida:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data
      });

      return {
        success: true,
        method: 'api',
        response: response.data,
        filename: csvFile.filename,
        csvSize: csvContent.length,
        fileSize: csvFile.size,
        fileSizeFormatted: `${(csvFile.size / 1024 / 1024).toFixed(2)} MB`
      };
    } catch (error) {
      console.error('❌ Erro ao enviar arquivo CSV de contatos via API:');
      console.error('   📊 Status:', error.response?.status);
      console.error('   📝 Status Text:', error.response?.statusText);
      console.error('   📄 Response Data:', error.response?.data);
      console.error('   🔗 URL:', this.apiUrl);
      console.error('   🚨 Message:', error.message);
      
      return {
        success: false,
        method: 'api',
        error: error.response?.data || error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        filename: filename
      };
    }
  }

  /**
   * Envia arquivo CSV de contatos (tenta WebDAV primeiro, depois API v2 com WSSE)
   * @param {string} filename - Nome do arquivo CSV (opcional, usa o mais recente se não informado)
   * @returns {Object} Resultado do envio
   */
  async sendContactsCsvToEmarsys(filename = null) {
    try {
      console.log('🚀 [EmarsysContactsService] Iniciando envio de contatos para Emarsys...');
      
      // Tenta WebDAV primeiro (se configurado e funcionando)
      if (this.webdavUrl && this.webdavUser && this.webdavPass) {
        console.log('📤 Tentando envio via WebDAV...');
        const webdavResult = await this.sendContactsCsvViaWebDAV(filename);
        
        if (webdavResult.success) {
          console.log('✅ Envio via WebDAV bem-sucedido');
          return webdavResult;
        } else {
          console.warn('⚠️ Falha no envio via WebDAV, tentando API v2...');
        }
      }
      
      // Novo: Tenta API v2 com WSSE (método recomendado)
      console.log('📤 Tentando importação via API v2 com WSSE...');
      const emarsysImportService = require('./emarsysContactImportService');
      const importResult = await emarsysImportService.importContactsFromCsv(filename);
      
      if (importResult.success) {
        console.log('✅ Importação via API v2 bem-sucedida');
        return {
          success: true,
          method: 'api_v2_wsse',
          filename: importResult.filename,
          fileSize: importResult.fileSize,
          fileSizeFormatted: importResult.fileSizeFormatted,
          contactsFound: importResult.contactsFound,
          contactsImported: importResult.importResults.successful,
          contactsFailed: importResult.importResults.failed,
          message: importResult.message,
          details: importResult.importResults
        };
      } else {
        console.warn('⚠️ Falha na importação via API v2, tentando API direta...');
      }
      
      // Fallback para API direta se disponível
      if (this.bearerToken) {
        console.log('📤 Tentando envio via API direta...');
        const apiResult = await this.sendContactsCsvViaAPI(filename);
        
        if (apiResult.success) {
          console.log('✅ Envio via API direta bem-sucedido');
          return apiResult;
        } else {
          console.error('❌ Falha no envio via API direta');
        }
      }
      
      throw new Error('Nenhum método de envio disponível ou todos falharam');
      
    } catch (error) {
      console.error('❌ Erro geral no envio de contatos:', error.message);
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Obtém estatísticas dos arquivos de contatos
   * @returns {Object} Estatísticas dos arquivos
   */
  async getContactsFilesStats() {
    try {
      const files = await this.listContactsCsvFiles();
      
      if (files.length === 0) {
        return {
          totalFiles: 0,
          totalSize: 0,
          latestFile: null,
          oldestFile: null
        };
      }
      
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const latestFile = files[0]; // Já ordenado por data
      const oldestFile = files[files.length - 1];
      
      return {
        totalFiles: files.length,
        totalSize,
        totalSizeFormatted: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
        latestFile: {
          filename: latestFile.filename,
          size: latestFile.sizeFormatted,
          modified: latestFile.modifiedFormatted
        },
        oldestFile: {
          filename: oldestFile.filename,
          size: oldestFile.sizeFormatted,
          modified: oldestFile.modifiedFormatted
        },
        allFiles: files.map(f => ({
          filename: f.filename,
          size: f.sizeFormatted,
          modified: f.modifiedFormatted
        }))
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error.message);
      return {
        error: error.message
      };
    }
  }

  /**
   * Testa a conectividade com os serviços da Emarsys
   * @returns {Object} Status dos testes
   */
  async testConnectivity() {
    const results = {
      webdav: { available: false, configured: false },
      api_v2_wsse: { available: false, configured: false },
      api_direct: { available: false, configured: false },
      timestamp: new Date().toISOString()
    };

    // Testa configuração WebDAV
    if (this.webdavUrl && this.webdavUser && this.webdavPass) {
      results.webdav.configured = true;
      try {
        const EmarsysWebdavService = require('./emarsysWebdavService');
        const webdavService = new EmarsysWebdavService();
        const testResult = await webdavService.testConnection();
        results.webdav.available = testResult.success;
        results.webdav.message = testResult.message || testResult.error;
      } catch (error) {
        results.webdav.error = error.message;
      }
    }

    // Novo: Testa API v2 com WSSE (método recomendado)
    try {
      const emarsysImportService = require('./emarsysContactImportService');
      const wsseTest = await emarsysImportService.testConnection();
      
      results.api_v2_wsse = {
        available: wsseTest.available || false,
        configured: wsseTest.configured || false,
        message: wsseTest.message || wsseTest.error,
        status: wsseTest.status,
        fieldsCount: wsseTest.fieldsCount
      };
    } catch (error) {
      results.api_v2_wsse.error = error.message;
    }

    // Testa configuração API direta (fallback)
    if (this.bearerToken) {
      results.api_direct.configured = true;
      results.api_direct.available = true;
      results.api_direct.message = 'Token configurado, teste real requer requisição';
    }

    return results;
  }
}

module.exports = new EmarsysContactsService();
