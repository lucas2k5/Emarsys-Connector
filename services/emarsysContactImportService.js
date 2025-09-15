require('dotenv').config({ debug: true });
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
      
      // Usa as credenciais do Postman (Basic Auth)
      const credentials = Buffer.from(`${this.wsseUser}:${this.wsseSecret}`).toString('base64');
      
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
   * Mapeia nomes de países para IDs válidos da Emarsys
   * @param {string} countryName - Nome do país
   * @returns {string|number|null} ID válido da Emarsys ou null se não encontrado
   */
  mapCountryToEmarsysId(countryName) {
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
   * Cria ou atualiza um contato individual na Emarsys
   * @param {Object} contactData - Dados do contato
   * @returns {Object} Resultado da operação
   */
     async createContact(contactData) {
     if (!this.wsseUser || !this.wsseSecret) {
       return {
         success: false,
         error: 'Credenciais Emarsys não configuradas.'
       };
     }

    try {
      console.log('👤 Criando/Atualizando contato na Emarsys Core API v3...');
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
        logger.info('Contato (masked) recebido para createContact', { contact: maskContact(contactData) });
      } catch (_) {}
      
      // Cria cliente OAuth2 para API Core v3
      const oauth2Client = this.createOAuth2Client();
      
      // Normaliza email e optin antes de montar o payload
      const normalized = { ...contactData };
      if (normalized['3']) normalized['3'] = String(normalized['3']).trim().toLowerCase();
      if (typeof normalized['31'] !== 'undefined') normalized['31'] = Number(Boolean(normalized['31']));

      // Adiciona key_id para identificar o campo chave (email = campo 3)
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
        logger.info('Payload final para Emarsys (masked)', { payload: maskedPayload });
      } catch (_) { console.log('📦 Payload final:', payload); }
      console.log('🔗 URL completa:', `${this.coreBaseURL}contact`);
      
      // Tenta criar o contato primeiro
      const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try { const { logger } = require('../utils/logger'); logger.info('Emarsys upsert (request)', { reqId, payload }); } catch (_) {}
      try {
        const response = await oauth2Client.post('contact', payload);
        console.log('✅ Contato criado com sucesso:', response.data);
        try { const { logger } = require('../utils/logger'); logger.info('Emarsys upsert (response)', { reqId, status: response.status, data: response.data }); } catch (_) {}
        
        return {
          success: true,
          data: response.data,
          status: response.status,
          action: 'created'
        };
      } catch (createError) {
        // Se o contato já existe (erro 2009), tenta atualizar
        if (createError.response?.data?.replyCode === 2009) {
          console.log('🔄 Contato já existe, tentando atualizar...');
          
          // Usa PUT para atualizar o contato existente
          const updateResponse = await oauth2Client.put('contact', payload);
          console.log('✅ Contato atualizado com sucesso:', updateResponse.data);
          try { const { logger } = require('../utils/logger'); logger.info('Emarsys upsert (response)', { reqId, status: updateResponse.status, data: updateResponse.data }); } catch (_) {}
          
          return {
            success: true,
            data: updateResponse.data,
            status: updateResponse.status,
            action: 'updated'
          };
        } else {
          // Se não for erro de contato existente, propaga o erro
          throw createError;
        }
      }
    } catch (error) {
      console.error('❌ Erro ao criar contato:');
      console.error('   Status:', error.response?.status);
      console.error('   Headers:', error.response?.headers);
      console.error('   Data:', error.response?.data);
      console.error('   Message:', error.message);
      
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
