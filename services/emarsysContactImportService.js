require('dotenv').config();
const axios = require('axios');
const WSSeAuth = require('../utils/wsseAuth');
const fs = require('fs').promises;
const path = require('path');
const { createReadStream } = require('fs');

class EmarsysContactImportService {
  constructor() {
    // Configurações da API Emarsys
    this.baseURL = 'https://api.emarsys.net/api/v2/';
    this.coreBaseURL = 'https://api.emarsys.net/api/v3/'; // API Core v3 (conforme aviso de depreciação)
    this.wsseUser = process.env.EMARSYS_USER || process.env.EMARSYS_USERNAME;
    this.wsseSecret = process.env.EMARSYS_SECRET || process.env.EMARSYS_PASSWORD;
    
    // Cache de token OAuth2
    this.oauth2Token = null;
    this.tokenExpiry = null;
    
    const defaultExports = path.join(__dirname, '..', 'exports');
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
   * Obtém token OAuth2 da Emarsys
   * @returns {Promise<string>} Token de acesso
   */
  async getOAuth2Token() {
    try {     

      // Verifica se temos um token válido em cache
      if (this.oauth2Token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        console.log('🔄 Usando token OAuth2 em cache');
        return this.oauth2Token;
      }

      console.log('🔑 Obtendo novo token OAuth2 da Emarsys...');
      
      // Verifica credenciais dinamicamente (pode ter sido carregado depois da instanciação)
      const wsseUser = this.wsseUser || process.env.EMARSYS_USER || process.env.EMARSYS_USERNAME;
      const wsseSecret = this.wsseSecret || process.env.EMARSYS_SECRET || process.env.EMARSYS_PASSWORD;
      
      if (!wsseUser || !wsseSecret) {
        throw new Error('Credenciais Emarsys não configuradas para OAuth2');
      }
      
      // Atualiza as propriedades se foram carregadas do env dinamicamente
      if (!this.wsseUser || !this.wsseSecret) {
        this.wsseUser = wsseUser;
        this.wsseSecret = wsseSecret;
      }
      
      // Usa as credenciais do Postman (Basic Auth)
      const credentials = Buffer.from(`${wsseUser}:${wsseSecret}`).toString('base64');
      
      const response = await axios.post('https://auth.emarsys.net/oauth2/token', 
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'Authorization': `Basic ${credentials}`
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.access_token) {
        // Armazena o token e calcula o tempo de expiração
        this.oauth2Token = response.data.access_token;
        this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 minuto antes da expiração
        
        console.log('✅ Token OAuth2 obtido com sucesso');
        console.log(`⏰ Token expira em: ${new Date(this.tokenExpiry).toLocaleString()}`);
        
        return this.oauth2Token;
      } else {
        throw new Error('Token não encontrado na resposta');
      }
    } catch (error) {
      console.error('❌ Erro ao obter token OAuth2:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Inicializa o cliente Axios com autenticação WSSE (para API v2)
   */
  initializeClient() {
    try {
      // Headers básicos
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };

      this.client = axios.create({ 
        baseURL: this.baseURL, 
        headers,
        timeout: 60000 // 1 minuto
      });

      // Interceptor para adicionar WSSE dinamicamente a cada requisição
      this.client.interceptors.request.use((config) => {
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

      // Interceptor para logs em desenvolvimento (desativado em produção)
      if (process.env.NODE_ENV !== 'production' && process.env.LOG_LEVEL === 'debug') {
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
      // Carrega csv-parser sob demanda para evitar falhas em rotas que não usam CSV
      const csv = require('csv-parser');
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
      console.log(`⚠️ Email inválido ou ausente: ${email}`);
      return null;
    }

    // Mapeia campos padrão da Emarsys com IDs corretos
    const contact = {
      '3': email, // Campo 3 = Email
    };

    // Adiciona outros campos se disponíveis (usando IDs corretos)
    if (row.firstName || row.firstname || row.FIRSTNAME) {
      contact['1'] = row.firstName || row.firstname || row.FIRSTNAME; // Campo 1 = First Name
    }

    if (row.lastName || row.lastname || row.LASTNAME) {
      contact['2'] = row.lastName || row.lastname || row.LASTNAME; // Campo 2 = Last Name
    }

    // Campos com IDs corretos conforme tabelas da Emarsys
    if (row.phone || row.Phone || row.PHONE) {
      contact['15'] = row.phone || row.Phone || row.PHONE; // Campo 15 = Phone
    }

    if (row.date_of_birth || row.birthDate || row.birth_date || row.BIRTH_DATE) {
      contact['4'] = row.date_of_birth || row.birthDate || row.birth_date || row.BIRTH_DATE; // Campo 4 = Birth Date
    }

    if (row.external_id || row.document || row.Document || row.DOCUMENT) {
      contact['59'] = row.external_id || row.document || row.Document || row.DOCUMENT; // Campo customizado para documento
    }

    // Campos de endereço se disponíveis
    if (row.city || row.City || row.CITY) {
      contact['11'] = row.city || row.City || row.CITY; // Campo 11 = City
    }

    if (row.state || row.State || row.STATE) {
      contact['12'] = row.state || row.State || row.STATE; // Campo 12 = State
    }

    if (row.zip_code || row.postalCode || row.postal_code || row.POSTAL_CODE) {
      contact['13'] = row.zip_code || row.postalCode || row.postal_code || row.POSTAL_CODE; // Campo 13 = ZIP Code
    }

    if (row.country || row.Country || row.COUNTRY) {
      const countryValue = row.country || row.Country || row.COUNTRY;
      const countryId = this.mapCountryToEmarsysId(countryValue);
      if (countryId) {
        contact['14'] = countryId; // Campo 14 = Country - ID válido
      } else {
        console.warn(`⚠️ País não reconhecido: ${countryValue}. Campo country será omitido.`);
      }
    }

    console.log(`✅ Contato mapeado: ${email} -> ${JSON.stringify(contact)}`);
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
   * Retorna sempre o ID do Brasil na Emarsys
   * @param {string} countryName - Nome do país (ignorado)
   * @returns {string} ID do Brasil na Emarsys (24)
   */
  mapCountryToEmarsysId(countryName) {
    return '24'; // ID do Brasil na Emarsys
  }

  /**
   * Cria um cliente OAuth2 para API Core
   * @returns {Object} Cliente Axios configurado
   */
  createOAuth2Client() {
    const client = axios.create({
      baseURL: this.coreBaseURL,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    // Interceptor para adicionar token OAuth2
    client.interceptors.request.use(async (config) => {
      try {
        const token = await this.getOAuth2Token();
        config.headers['Authorization'] = `Bearer ${token}`;
        return config;
      } catch (error) {
        console.error('❌ Erro ao obter token OAuth2:', error.message);
        return Promise.reject(error);
      }
    });

    return client;
  }

  /**
   * Valida dados do contato antes do envio
   * @param {Object} contactData - Dados do contato
   * @returns {Object} Resultado da validação
   */
  validateContactData(contactData) {
    const errors = [];
    const warnings = [];

    // Validação do email (campo obrigatório)
    if (!contactData['3']) {
      errors.push('Email é obrigatório (campo 3)');
    } else {
      const email = String(contactData['3']).trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push('Email inválido (campo 3)');
      }
    }

    // Validação do primeiro nome
    if (contactData['1'] && String(contactData['1']).length > 100) {
      warnings.push('Primeiro nome muito longo (campo 1)');
    }

    // Validação do sobrenome
    if (contactData['2'] && String(contactData['2']).length > 100) {
      warnings.push('Sobrenome muito longo (campo 2)');
    }

    // Validação da data de nascimento
    if (contactData['4']) {
      const birthDate = String(contactData['4']);
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(birthDate)) {
        errors.push('Data de nascimento deve estar no formato YYYY-MM-DD (campo 4)');
      } else {
        const date = new Date(birthDate);
        const now = new Date();
        if (date > now) {
          warnings.push('Data de nascimento no futuro (campo 4)');
        }
      }
    }

    // Validação do gênero
    if (contactData['5'] !== undefined) {
      const gender = String(contactData['5']).trim();
      if (!['1', '2', '3'].includes(gender)) {
        warnings.push('Gênero deve ser 1 (masculino), 2 (feminino) ou 3 (outro) (campo 5)');
      }
    }

    // Validação do opt-in
    if (contactData['31'] !== undefined) {
      const optin = String(contactData['31']).trim();
      if (!['1', '2'].includes(optin)) {
        warnings.push('Opt-in deve ser 1 (sim) ou 2 (não) (campo 31)');
      }
    }

    // Validação do telefone
    if (contactData['15']) {
      const phone = String(contactData['15']).replace(/\D/g, '');
      if (phone.length < 10 || phone.length > 15) {
        warnings.push('Telefone deve ter entre 10 e 15 dígitos (campo 15)');
      }
    }

    // Validação do celular
    if (contactData['37']) {
      const mobile = String(contactData['37']).replace(/\D/g, '');
      if (mobile.length < 10 || mobile.length > 15) {
        warnings.push('Celular deve ter entre 10 e 15 dígitos (campo 37)');
      }
    }

    // Validação do CEP
    if (contactData['13']) {
      const zipCode = String(contactData['13']).replace(/\D/g, '');
      if (zipCode.length !== 8) {
        warnings.push('CEP deve ter 8 dígitos (campo 13)');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Cria ou atualiza um contato individual na Emarsys
   * @param {Object} contactData - Dados do contato
   * @param {Object} options - Opções de retry e validação
   * @returns {Object} Resultado da operação
   */
    async createContact(contactData, options = {}) {
      const { maxRetries = 3, retryDelay = 1000, validateData = true } = options;
      
      // Verifica credenciais dinamicamente (pode ter sido carregado depois da instanciação)
      const wsseUser = this.wsseUser || process.env.EMARSYS_USER || process.env.EMARSYS_USERNAME;
      const wsseSecret = this.wsseSecret || process.env.EMARSYS_SECRET || process.env.EMARSYS_PASSWORD;
      
      if (!wsseUser || !wsseSecret) {
        console.error('❌ Credenciais Emarsys não configuradas:', {
          hasWsseUser: !!this.wsseUser,
          hasWsseSecret: !!this.wsseSecret,
          hasEnvUser: !!process.env.EMARSYS_USER,
          hasEnvUsername: !!process.env.EMARSYS_USERNAME,
          hasEnvSecret: !!process.env.EMARSYS_SECRET,
          hasEnvPassword: !!process.env.EMARSYS_PASSWORD
        });
        return {
          success: false,
          error: 'Credenciais Emarsys não configuradas. Configure EMARSYS_USER e EMARSYS_SECRET (ou EMARSYS_USERNAME e EMARSYS_PASSWORD)',
          errorType: 'CONFIG_ERROR'
        };
      }
      
      // Atualiza as propriedades se foram carregadas do env dinamicamente
      if (!this.wsseUser || !this.wsseSecret) {
        this.wsseUser = wsseUser;
        this.wsseSecret = wsseSecret;
        // Inicializa o cliente se ainda não foi inicializado
        if (!this.client) {
          console.log('🔧 Inicializando cliente Emarsys com credenciais carregadas dinamicamente...');
          this.initializeClient();
        }
      }

      // Validação dos dados se habilitada
      if (validateData) {
        const validation = this.validateContactData(contactData);
        if (!validation.isValid) {
          return {
            success: false,
            error: `Dados inválidos: ${validation.errors.join(', ')}`,
            errorType: 'VALIDATION_ERROR',
            validation: validation
          };
        }
        
        // Log de warnings se houver
        if (validation.warnings.length > 0) {
          console.warn('⚠️ Avisos de validação:', validation.warnings);
        }
      }

      let lastError = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`👤 Criando/Atualizando contato na Emarsys Core API v3... (tentativa ${attempt}/${maxRetries})`);
          
          try {
            const { logger } = require('../utils/logger');
            const maskContact = (obj) => {
              const c = { ...obj };
              if (c['3']) {
                const email = String(c['3']);
                const [user, domain] = email.split('@');
                c['3'] = user && domain ? `${user.slice(0, 2)}***@${domain}` : '***';
              }
              if (c['15']) c['15'] = String(c['15']).replace(/\d(?=\d{2})/g, '*');
              if (c['4']) c['4'] = '****-**-**';
              if (c['13']) c['13'] = String(c['13']).replace(/\d(?=\d{2})/g, '*');
              return c;
            };
            logger.info('Contato (masked) recebido para createContact', { 
              contact: maskContact(contactData),
              attempt,
              maxRetries
            });
          } catch (_) {}
          
          // Cria cliente OAuth2 para API Core v3
          const oauth2Client = this.createOAuth2Client();
          
          // Normaliza email e optin antes de montar o payload
          const normalized = { ...contactData };
          if (normalized['3']) normalized['3'] = String(normalized['3']).trim().toLowerCase();
          // Campos 5 e 31 devem ser enviados como string
          if (typeof normalized['31'] !== 'undefined') normalized['31'] = String(normalized['31']).trim();
          if (typeof normalized['5'] !== 'undefined') normalized['5'] = String(normalized['5']).trim();

          const payload = {
            key_id: '3', // Campo email como chave primária
            ...normalized
          };
          
          try {
            const { logger } = require('../utils/logger');
            const maskedPayload = { ...payload };
            if (maskedPayload['3']) {
              const email = String(maskedPayload['3']);
              const [user, domain] = email.split('@');
              maskedPayload['3'] = user && domain ? `${user.slice(0, 2)}***@${domain}` : '***';
            }
            if (maskedPayload['15']) maskedPayload['15'] = String(maskedPayload['15']).replace(/\d(?=\d{2})/g, '*');
            if (maskedPayload['4']) maskedPayload['4'] = '****-**-**';
            if (maskedPayload['13']) maskedPayload['13'] = String(maskedPayload['13']).replace(/\d(?=\d{2})/g, '*');
            logger.info('Payload final para Emarsys (masked)', { 
              payload: maskedPayload,
              attempt,
              maxRetries
            });
          } catch (_) { console.log('📦 Payload final:', payload); }
          console.log('🔗 URL completa:', `${this.coreBaseURL}contact/?create_if_not_exists=1`);

          // Upsert único via Core API v3 (PUT com create_if_not_exists=1)
          const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          try { const { logger } = require('../utils/logger'); logger.info('Emarsys upsert (request)', { reqId, payload, attempt, maxRetries }); } catch (_) {}

          // Envia com URL absoluta para evitar qualquer conflito de resolução de rota
          const absoluteUrl = `${this.coreBaseURL}contact/?create_if_not_exists=1`;
          const accessToken = await this.getOAuth2Token();
          const singleContact = Object.fromEntries(Object.entries(payload).filter(([k]) => k !== 'key_id'));
          const requestBody = { key_id: payload.key_id, contacts: [singleContact] };
          let response;
          try {
            response = await axios.put(absoluteUrl, requestBody, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              },
              timeout: 60000
            });
          } catch (err) {
            const replyCode = err.response?.data?.replyCode;
            const replyText = err.response?.data?.replyText;
            const status = err.response?.status;
            
            // Categoriza o erro para decidir se deve tentar novamente
            const errorType = this.categorizeEmarsysError(err);
            
            // Fallback alternativo para 'contacts' sem a barra, se necessário
            if (status === 400 && replyCode === 1 && /No resource requested\.?/i.test(String(replyText || ''))) {
              const bulkUrl = `${this.coreBaseURL}contacts?create_if_not_exists=1`;
              console.log('ℹ️ Retentando via endpoint em lote (contacts):', { url: bulkUrl, attempt });
              response = await axios.put(bulkUrl, requestBody, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Accept': 'application/json',
                  'Content-Type': 'application/json'
                },
                timeout: 60000
              });
            } else {
              // Se é um erro que não deve ser retentado, falha imediatamente
              if (!errorType.retryable) {
                throw err;
              }
              
              // Se é a última tentativa, falha
              if (attempt === maxRetries) {
                throw err;
              }
              
              // Se é retryable e não é a última tentativa, continua o loop
              lastError = err;
              console.warn(`⚠️ Erro retryable na tentativa ${attempt}/${maxRetries}:`, {
                errorType: errorType.type,
                message: errorType.message,
                retryable: errorType.retryable
              });
              
              // Aguarda antes da próxima tentativa
              await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
              continue;
            }
          }

          console.log('✅ Contato upsert realizado com sucesso:', {
            status: response.status,
            url: absoluteUrl,
            data: response.data,
            attempt
          });
          try { const { logger } = require('../utils/logger'); logger.info('Emarsys upsert (response)', { reqId, status: response.status, data: response.data, attempt }); } catch (_) {}

          return {
            success: true,
            data: response.data,
            status: response.status,
            action: 'upserted',
            attempt
          };
          
        } catch (error) {
          lastError = error;
          const errorType = this.categorizeEmarsysError(error);
          
          console.error(`❌ Erro ao criar contato (tentativa ${attempt}/${maxRetries}):`);
          console.error('   Status:', error.response?.status);
          console.error('   Headers:', error.response?.headers);
          console.error('   Data:', error.response?.data);
          console.error('   Message:', error.message);
          console.error('   Error Type:', errorType.type);
          console.error('   Retryable:', errorType.retryable);
          
          // Se não é retryable ou é a última tentativa, falha
          if (!errorType.retryable || attempt === maxRetries) {
            break;
          }
          
          // Aguarda antes da próxima tentativa
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
      
      // Se chegou aqui, todas as tentativas falharam
      const finalErrorType = this.categorizeEmarsysError(lastError);
      
      // Registra o erro no monitor
      try {
        const ContactErrorMonitor = require('../utils/contactErrorMonitor');
        const errorMonitor = new ContactErrorMonitor();
        await errorMonitor.logContactError({
          email: contactData['3'],
          errorType: finalErrorType.type,
          errorMessage: lastError.response?.data || lastError.message,
          status: lastError.response?.status,
          retryable: finalErrorType.retryable,
          attempts: maxRetries,
          payload: contactData,
          stack: lastError.stack
        });
      } catch (monitorError) {
        console.error('❌ Erro ao registrar no monitor:', monitorError.message);
      }
      
      return {
        success: false,
        error: lastError.response?.data || lastError.message,
        status: lastError.response?.status,
        errorType: finalErrorType.type,
        retryable: finalErrorType.retryable,
        attempts: maxRetries,
        lastAttempt: lastError
      };
    }

  /**
   * Categoriza erros da API Emarsys para determinar se devem ser retentados
   * @param {Error} error - Erro da API
   * @returns {Object} Informações sobre o tipo de erro
   */
  categorizeEmarsysError(error) {
    const status = error.response?.status;
    const replyCode = error.response?.data?.replyCode;
    const replyText = error.response?.data?.replyText;
    const message = error.message;

    // Erros de rede/timeout - retryable
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return {
        type: 'NETWORK_ERROR',
        message: 'Erro de rede ou timeout',
        retryable: true
      };
    }

    // Erros de autenticação - não retryable
    if (status === 401 || status === 403) {
      return {
        type: 'AUTH_ERROR',
        message: 'Erro de autenticação',
        retryable: false
      };
    }

    // Erros de validação de dados - não retryable
    if (status === 400 && (replyCode === 2001 || replyCode === 2002)) {
      return {
        type: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        retryable: false
      };
    }

    // Erros de rate limit - retryable
    if (status === 429) {
      return {
        type: 'RATE_LIMIT_ERROR',
        message: 'Rate limit excedido',
        retryable: true
      };
    }

    // Erros de servidor - retryable
    if (status >= 500) {
      return {
        type: 'SERVER_ERROR',
        message: 'Erro interno do servidor',
        retryable: true
      };
    }

    // Erros de timeout - retryable
    if (message.includes('timeout') || status === 408) {
      return {
        type: 'TIMEOUT_ERROR',
        message: 'Timeout na requisição',
        retryable: true
      };
    }

    // Outros erros - não retryable por padrão
    return {
      type: 'UNKNOWN_ERROR',
      message: 'Erro desconhecido',
      retryable: false
    };
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
