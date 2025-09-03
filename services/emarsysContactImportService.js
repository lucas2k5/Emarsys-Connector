require('dotenv').config({ debug: true });
const axios = require('axios');
const WSSeAuth = require('../utils/wsseAuth');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { createReadStream } = require('fs');

class EmarsysContactImportService {
  constructor() {
    // Configurações da API Emarsys
    this.baseURL = 'https://api.emarsys.net/api/v2/';
    this.wsseUser = process.env.EMARSYS_USER || process.env.EMARSYS_USERNAME;
    this.wsseSecret = process.env.EMARSYS_SECRET || process.env.EMARSYS_PASSWORD;
    
    const defaultExports = process.env.VERCEL ? '/tmp/exports' : path.join(__dirname, '..', 'exports');
    this.exportsDir = process.env.EXPORTS_DIR || defaultExports;
    
         console.log('🔧 [EmarsysContactImportService] Constructor inicializado:');
     console.log('   📁 ExportsDir:', this.exportsDir);
     console.log('   🌐 BaseURL:', this.baseURL);
     console.log('   👤 EMARSYS_USER:', this.wsseUser ? 'Configurado' : 'NÃO CONFIGURADO');
     console.log('   🔐 EMARSYS_SECRET:', this.wsseSecret ? 'Configurado' : 'NÃO CONFIGURADO');
     
     // Inicializa cliente apenas se as credenciais estiverem disponíveis
     if (this.wsseUser && this.wsseSecret) {
       this.initializeClient();
     } else {
       console.warn('⚠️ Credenciais Emarsys não configuradas. Configure EMARSYS_USER e EMARSYS_SECRET');
       this.client = null;
     }
  }

  /**
   * Inicializa o cliente Axios com autenticação WSSE
   */
  initializeClient() {
    try {
      // Headers básicos (X-WSSE será adicionado dinamicamente)
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip'
      };

      this.client = axios.create({ 
        baseURL: this.baseURL, 
        headers,
        timeout: 60000 // 1 minuto
      });

      // Interceptor para adicionar X-WSSE dinamicamente a cada requisição
      this.client.interceptors.request.use(config => {
        // Gera um novo header WSSE para cada requisição
        config.headers['X-WSSE'] = WSSeAuth.generateHeader(this.wsseUser, this.wsseSecret);
        return config;
      });

             // Configurar retry automático simples
       this.client.interceptors.response.use(
         response => response,
         async error => {
           const config = error.config;
           config.retryCount = config.retryCount || 0;
           
           if (config.retryCount < 3 && (
             !error.response || 
             error.response.status >= 500 || 
             error.code === 'ECONNRESET' ||
             error.code === 'ETIMEDOUT'
           )) {
             config.retryCount++;
             console.log(`🔄 Tentativa ${config.retryCount}/3 para ${config.url}`);
             
             // Aguarda antes de tentar novamente (backoff exponencial)
             await new Promise(resolve => setTimeout(resolve, Math.pow(2, config.retryCount) * 1000));
             
             return this.client.request(config);
           }
           
           return Promise.reject(error);
         }
       );

      // Interceptor para logs em desenvolvimento
      if (process.env.NODE_ENV !== 'production') {
        this.client.interceptors.request.use(request => {
          console.log('📤 Starting Request:', request.url);
          return request;
        });

        this.client.interceptors.response.use(
          response => {
            console.log('✅ Response:', response.status, response.statusText);
            return response;
          },
          error => {
            console.error('❌ Response Error:', error.response?.status, error.response?.statusText);
            return Promise.reject(error);
          }
        );
      }

      console.log('✅ Cliente Emarsys inicializado com sucesso');
    } catch (error) {
      console.error('❌ Erro ao inicializar cliente Emarsys:', error.message);
      this.client = null;
    }
  }

  /**
   * Busca o último arquivo CSV de contatos gerado
   * @returns {Object|null} Informações do arquivo ou null se não encontrado
   */
  async getLatestContactsCsvFile() {
    try {
      const files = await fs.readdir(this.exportsDir);
      
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
          const timestampA = a.filename.match(/\d{4}-\d{2}-\d{2}[T_]\d{2}[-:]\d{2}[-:]\d{2}/);
          const timestampB = b.filename.match(/\d{4}-\d{2}-\d{2}[T_]\d{2}[-:]\d{2}[-:]\d{2}/);
          
          if (timestampA && timestampB) {
            return timestampB[0].localeCompare(timestampA[0]);
          }
          return b.filename.localeCompare(a.filename);
        });

      if (contactCsvFiles.length === 0) {
        console.log('📁 Nenhum arquivo CSV de contatos encontrado');
        return null;
      }

      const latestFile = contactCsvFiles[0];
      const stats = await fs.stat(latestFile.filePath);
      
      console.log(`📄 Último arquivo CSV encontrado: ${latestFile.filename}`);
      console.log(`📊 Tamanho: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      
      return {
        ...latestFile,
        size: stats.size,
        modified: stats.mtime
      };
    } catch (error) {
      console.error('❌ Erro ao buscar arquivo CSV:', error.message);
      return null;
    }
  }

  /**
   * Processa arquivo CSV e converte para formato da Emarsys
   * @param {string} filePath - Caminho do arquivo CSV
   * @returns {Array} Array de contatos no formato Emarsys
   */
  async processCsvFile(filePath) {
    return new Promise((resolve, reject) => {
      const contacts = [];
      const stream = createReadStream(filePath);

      stream
        .pipe(csv())
        .on('data', (row) => {
          try {
            // Mapeia campos do CSV para formato Emarsys
            const contact = this.mapCsvRowToEmarsysContact(row);
            if (contact) {
              contacts.push(contact);
            }
          } catch (error) {
            console.warn('⚠️ Erro ao processar linha do CSV:', error.message);
          }
        })
        .on('end', () => {
          console.log(`✅ CSV processado: ${contacts.length} contatos válidos`);
          resolve(contacts);
        })
        .on('error', (error) => {
          console.error('❌ Erro ao ler CSV:', error.message);
          reject(error);
        });
    });
  }

  /**
   * Mapeia uma linha do CSV para formato de contato da Emarsys
   * @param {Object} row - Linha do CSV
   * @returns {Object|null} Contato no formato Emarsys ou null se inválido
   */
  mapCsvRowToEmarsysContact(row) {
    // Verifica se tem email (obrigatório)
    const email = row.email || row.Email || row.EMAIL;
    if (!email || !this.isValidEmail(email)) {
      return null;
    }

    // Mapeia campos padrão da Emarsys
    const contact = {
      '3': email, // Campo 3 = Email
    };

    // Adiciona outros campos se disponíveis
    if (row.firstName || row.firstname || row.FIRSTNAME) {
      contact['1'] = row.firstName || row.firstname || row.FIRSTNAME; // Campo 1 = First Name
    }

    if (row.lastName || row.lastname || row.LASTNAME) {
      contact['2'] = row.lastName || row.lastname || row.LASTNAME; // Campo 2 = Last Name
    }

    // Campos customizados comuns
    if (row.phone || row.Phone || row.PHONE) {
      contact['57'] = row.phone || row.Phone || row.PHONE; // Campo 57 = Phone (exemplo)
    }

    if (row.birthDate || row.birth_date || row.BIRTH_DATE) {
      contact['58'] = row.birthDate || row.birth_date || row.BIRTH_DATE; // Campo 58 = Birth Date (exemplo)
    }

    if (row.document || row.Document || row.DOCUMENT) {
      contact['59'] = row.document || row.Document || row.DOCUMENT; // Campo customizado para documento
    }

    // Campos de endereço se disponíveis
    if (row.city || row.City || row.CITY) {
      contact['60'] = row.city || row.City || row.CITY;
    }

    if (row.state || row.State || row.STATE) {
      contact['61'] = row.state || row.State || row.STATE;
    }

    if (row.postalCode || row.postal_code || row.POSTAL_CODE) {
      contact['62'] = row.postalCode || row.postal_code || row.POSTAL_CODE;
    }

    return contact;
  }

  /**
   * Valida se o email tem formato válido
   * @param {string} email - Email para validar
   * @returns {boolean} True se válido
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Cria ou atualiza um contato individual na Emarsys
   * @param {Object} contactData - Dados do contato
   * @returns {Object} Resultado da operação
   */
     async createContact(contactData) {
     if (!this.client) {
       return {
         success: false,
         error: 'Cliente Emarsys não inicializado. Verifique as credenciais EMARSYS_USER e EMARSYS_SECRET.'
       };
     }

    try {
      const response = await this.client.put('contact/?create_if_not_exists=1', contactData);
      
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error) {
      console.error('❌ Erro ao criar contato:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
        status: error.response?.status
      };
    }
  }

  /**
   * Importa contatos em lote para a Emarsys
   * @param {Array} contacts - Array de contatos
   * @param {Object} options - Opções de importação
   * @returns {Object} Resultado da importação
   */
     async importContactsBatch(contacts, options = {}) {
     if (!this.client) {
       return {
         success: false,
         error: 'Cliente Emarsys não inicializado. Verifique as credenciais EMARSYS_USER e EMARSYS_SECRET.'
       };
     }

    const batchSize = options.batchSize || 1000;
    const results = {
      total: contacts.length,
      processed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    console.log(`🚀 Iniciando importação de ${contacts.length} contatos em lotes de ${batchSize}`);

    // Processa em lotes
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      console.log(`📦 Processando lote ${Math.floor(i / batchSize) + 1}: ${batch.length} contatos`);

      try {
        // Para lotes, usamos requisições individuais (API v2 não tem bulk import direto)
        const batchResults = await Promise.allSettled(
          batch.map(contact => this.createContact(contact))
        );

        // Analisa resultados do lote
        batchResults.forEach((result, index) => {
          results.processed++;
          
          if (result.status === 'fulfilled' && result.value.success) {
            results.successful++;
          } else {
            results.failed++;
            results.errors.push({
              contact: batch[index],
              error: result.reason || result.value?.error || 'Erro desconhecido'
            });
          }
        });

        console.log(`✅ Lote processado: ${batchResults.filter(r => r.status === 'fulfilled' && r.value.success).length}/${batch.length} sucessos`);

        // Pausa entre lotes para não sobrecarregar a API
        if (i + batchSize < contacts.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`❌ Erro no lote ${Math.floor(i / batchSize) + 1}:`, error.message);
        results.failed += batch.length;
        results.processed += batch.length;
        
        results.errors.push({
          batch: Math.floor(i / batchSize) + 1,
          error: error.message
        });
      }
    }

    console.log(`🎉 Importação concluída: ${results.successful}/${results.total} contatos importados`);

    return {
      success: results.successful > 0,
      results,
      message: `Importação concluída: ${results.successful}/${results.total} contatos importados`
    };
  }

  /**
   * Importa contatos do último arquivo CSV gerado
   * @param {string} filename - Nome específico do arquivo (opcional)
   * @param {Object} options - Opções de importação
   * @returns {Object} Resultado da importação
   */
  async importContactsFromCsv(filename = null, options = {}) {
    try {
      console.log('🚀 Iniciando importação de contatos do CSV...');

             if (!this.client) {
         throw new Error('Cliente Emarsys não inicializado. Configure EMARSYS_USER e EMARSYS_SECRET');
       }

      let csvFile;

      if (filename) {
        const filePath = path.join(this.exportsDir, filename);
        try {
          const stats = await fs.stat(filePath);
          csvFile = { filename, filePath, size: stats.size };
        } catch (error) {
          throw new Error(`Arquivo não encontrado: ${filename}`);
        }
      } else {
        csvFile = await this.getLatestContactsCsvFile();
        if (!csvFile) {
          throw new Error('Nenhum arquivo CSV de contatos encontrado');
        }
      }

      console.log(`📄 Processando arquivo: ${csvFile.filename}`);

      // Processa o CSV
      const contacts = await this.processCsvFile(csvFile.filePath);

      if (contacts.length === 0) {
        throw new Error('Nenhum contato válido encontrado no arquivo CSV');
      }

      // Importa os contatos
      const importResult = await this.importContactsBatch(contacts, options);

      return {
        success: importResult.success,
        filename: csvFile.filename,
        fileSize: csvFile.size,
        fileSizeFormatted: `${(csvFile.size / 1024 / 1024).toFixed(2)} MB`,
        contactsFound: contacts.length,
        importResults: importResult.results,
        message: importResult.message
      };

    } catch (error) {
      console.error('❌ Erro na importação de contatos:', error.message);
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Testa a conectividade com a API da Emarsys
   * @returns {Object} Status do teste
   */
  async testConnection() {
    try {
             if (!this.client) {
         return {
           success: false,
           configured: false,
           error: 'Cliente não inicializado - verifique EMARSYS_USER e EMARSYS_SECRET'
         };
       }

      // Testa com uma requisição simples (busca campos disponíveis)
      const response = await this.client.get('field');
      
      return {
        success: true,
        configured: true,
        available: true,
        status: response.status,
        message: 'Conexão com API Emarsys estabelecida com sucesso',
        fieldsCount: response.data?.data?.length || 0
      };
    } catch (error) {
      console.error('❌ Erro no teste de conexão:', error.message);
      
      return {
        success: false,
        configured: !!(this.wsseUser && this.wsseSecret),
        available: false,
        error: error.response?.data || error.message,
        status: error.response?.status
      };
    }
  }

  /**
   * Lista campos disponíveis na Emarsys
   * @returns {Object} Lista de campos
   */
  async getAvailableFields() {
    if (!this.client) {
      return {
        success: false,
        error: 'Cliente não inicializado'
      };
    }

    try {
      const response = await this.client.get('field');
      
      return {
        success: true,
        fields: response.data?.data || [],
        count: response.data?.data?.length || 0
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }
}

module.exports = new EmarsysContactImportService();
