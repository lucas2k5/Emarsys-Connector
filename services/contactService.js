const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { getBrazilianTimestamp, getBrazilianTimestampForFilename } = require('../utils/dateUtils');
const AddressService = require('./addressService');
require('dotenv').config();

class ContactService {
  constructor() {
    // Configuração de diretórios
    const defaultDataDir = path.join(__dirname, '..', 'data');
    const defaultExports = path.join(__dirname, '..', 'exports');
    this.dataDir = process.env.DATA_DIR || defaultDataDir;
    this.exportsDir = process.env.EXPORTS_DIR || defaultExports;
    
    // Inicializa o serviço de endereços
    this.addressService = new AddressService();
  }

  /**
   * Busca um registro da CL (Customer List) pelo id (equivalente ao userId da AD)
   * @param {string} id - ID do registro na CL
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object|null>} Registro da CL ou null se não encontrado
   */
  async getCLRecordById(id, options = {}) {
    try {
      if (!id) return null;
      const baseUrl = (process.env.VTEX_BASE_URL || '').replace(/\/$/, '');
      const url = `${baseUrl}/api/dataentities/CL/documents/${encodeURIComponent(id)}`;
      const response = await axios({
        method: 'GET',
        url,
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
          'pragma': 'no-cache',
          'cache-control': 'max-age=0'
        },
        timeout: options.timeout || 30000
      });
      return response?.data || null;
    } catch (error) {
      // 404 => não encontrado, retorna null; outros erros propaga mensagem
      if (error?.response?.status === 404) return null;
      console.error('❌ Erro ao buscar registro da CL por id:', {
        id,
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return null;
    }
  }

  /**
   * Retorna o email a partir do userId (CL.id)
   * @param {string} userId
   * @returns {Promise<string|null>} Email ou null se não encontrado
   */
  async getEmailByUserId(userId) {
    const record = await this.getCLRecordById(userId);
    if (!record) return null;
    return record.email || null;
  }

  /**
   * Busca todos os registros da CL (Customer List) usando API de scroll da VTEX
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Array>} Array com todos os registros da CL
   */
  async fetchAllCLRecords(options = {}) {
    try {
      console.log('🚀 Iniciando busca de todos os registros da CL usando API de scroll da VTEX...');
      console.log('✅ API de scroll confirmada funcionando: retorna 1000 registros com token!');
      
      return await this.fetchAllCLRecordsWithVTEXScroll(options);
      
    } catch (error) {
      console.error('❌ Erro ao buscar registros da CL:', error);
      throw error;
    }
  }

  /**
   * Busca todos os registros da CL usando API de scroll da VTEX (abordagem oficial)
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Array>} Array com todos os registros da CL
   */
  async fetchAllCLRecordsWithVTEXScroll(options = {}) {
    try {
      console.log('🚀 Iniciando busca usando API de scroll oficial da VTEX...');
      
      const allRecords = [];
      const pageSize = Math.min(options.size || 1000, 1000); // Máximo de 1000
      let currentToken = '';
      let hasMoreRecords = true;
      let requestCount = 0;
      const maxRequests = options.maxRequests || 5000;
      const userLimit = options.userLimit; // Novo: suporte para limite de usuários
      
      // Primeira requisição sem token
      console.log('🔄 Busca inicial (sem token)...');
      const initialResponse = await this.fetchCLWithVTEXScroll('', pageSize, options);
      
      if (initialResponse && initialResponse.data && Array.isArray(initialResponse.data)) {
        // Adiciona registros da primeira página respeitando o limite de usuários
        const recordsToAdd = userLimit ? initialResponse.data.slice(0, userLimit) : initialResponse.data;
        allRecords.push(...recordsToAdd);
        console.log(`✅ Página 1: ${recordsToAdd.length} registros adicionados`);
        
        // Verifica se já atingiu o limite de usuários na primeira página
        if (userLimit && allRecords.length >= userLimit) {
          console.log(`📊 Limite de usuários atingido na primeira página: ${userLimit} registros`);
          return allRecords;
        }
        
        // Obtém o token da resposta - pode estar em diferentes headers
        currentToken = initialResponse.headers?.['x-vtex-md-token'] || 
                      initialResponse.headers?.['x-vtex-page-token'] || '';
        
        console.log(`📄 Token para próxima página: ${currentToken ? 'presente' : 'ausente'}`);
        
        // Continua enquanto houver token e não atingiu o limite de usuários
        while (hasMoreRecords && currentToken && requestCount < maxRequests && (!userLimit || allRecords.length < userLimit)) {
          requestCount++;
          console.log(`📄 Buscando página ${requestCount + 1} com token...`);
          
          try {
            const response = await this.fetchCLWithVTEXScroll(currentToken, pageSize, options);
            
            if (response && response.data && Array.isArray(response.data)) {
              if (response.data.length > 0) {
                // Adiciona registros respeitando o limite de usuários
                const recordsToAdd = userLimit ? response.data.slice(0, userLimit - allRecords.length) : response.data;
                allRecords.push(...recordsToAdd);
                console.log(`✅ Página ${requestCount + 1}: ${recordsToAdd.length} registros adicionados (Total: ${allRecords.length})`);
                
                // Verifica se atingiu o limite de usuários
                if (userLimit && allRecords.length >= userLimit) {
                  console.log(`📊 Limite de usuários atingido: ${userLimit} registros`);
                  hasMoreRecords = false;
                  break;
                }
                
                // Obtém o próximo token
                currentToken = response.headers?.['x-vtex-md-token'] || 
                              response.headers?.['x-vtex-page-token'] || '';
                
                if (!currentToken) {
                  console.log('📄 Nenhum token retornado, finalizando busca');
                  hasMoreRecords = false;
                }
              } else {
                console.log('📄 Nenhum registro retornado, finalizando busca');
                hasMoreRecords = false;
              }
            } else {
              console.log('📄 Resposta inválida, finalizando busca');
              hasMoreRecords = false;
            }
            
            // Pausa entre requisições (aumentada para evitar rate limiting)
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error) {
            console.error(`❌ Erro ao buscar página ${requestCount + 1}:`, error.message);
            hasMoreRecords = false;
          }
        }
        
        console.log(`🎉 Busca com scroll oficial concluída!`);
        console.log(`📊 Total de registros encontrados: ${allRecords.length.toLocaleString()}`);
        
        // Se encontrou menos de 300k registros e ainda há token, pode ter falhado
        if (allRecords.length < 300000 && currentToken) {
          console.log(`⚠️ Apenas ${allRecords.length.toLocaleString()} registros encontrados, mas ainda há token. Tentando método alternativo...`);
          
          // Tenta buscar o restante usando offset
          const remainingRecords = await this.fetchAllCLRecordsWithOffset({
            ...options,
            startOffset: allRecords.length,
            maxRequests: 1000
          });
          
          if (remainingRecords.length > 0) {
            allRecords.push(...remainingRecords);
            console.log(`✅ Método alternativo adicionou mais ${remainingRecords.length.toLocaleString()} registros`);
            console.log(`📊 Total final: ${allRecords.length.toLocaleString()} registros`);
          }
        }
        
        return allRecords;
        
      } else {
        console.log('⚠️ Resposta inicial inválida');
        return [];
      }
      
    } catch (error) {
      console.error('❌ Erro ao buscar registros da CL com scroll oficial:', error);
      throw error;
    }
  }

  /**
   * Helper para usar a API de scroll oficial da VTEX com retry automático
   * @param {string} token - Token de paginação
   * @param {number} size - Tamanho da página
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Resposta da API
   */
  async fetchCLWithVTEXScroll(token = '', size = 1000, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const baseDelay = options.baseDelay || 2000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const baseUrl = (process.env.VTEX_BASE_URL || '').replace(/\/$/, '');
        const url = `${baseUrl}/api/dataentities/CL/scroll`;
        
                 const params = {
           _size: size,
           _fields: options.fields || 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName',
           _sort: options.sort || 'createdIn DESC'
         };
        
        // Adiciona o token se fornecido
        if (token) {
          params._token = token;
        }
        
        console.log(`🔗 Requisição para API de scroll (tentativa ${attempt}/${maxRetries}): ${url}`, {
          params: params,
          hasToken: !!token,
          tokenPreview: token ? token.substring(0, 20) + '...' : 'nenhum'
        });
        
        const response = await axios({
          method: 'GET',
          url: url,
          params: params,
          headers: {
            'Accept': 'application/vnd.vtex.ds.v10+json',
            'Content-Type': 'application/json',
            'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
            'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
            'pragma': 'no-cache',
            'cache-control': 'max-age=0'
          },
          timeout: 120000 // Aumentado para 2 minutos para lidar com grandes volumes
        });
        
        console.log(`📊 Resposta da API de scroll:`, {
          status: response.status,
          dataLength: response.data ? response.data.length : 0,
          hasNextToken: !!(response.headers?.['x-vtex-md-token'] || response.headers?.['x-vtex-page-token']),
          contentRange: response.headers?.['rest-content-range']
        });
        
        return response;
        
      } catch (error) {
        console.error(`❌ Erro na requisição de scroll oficial da CL (tentativa ${attempt}/${maxRetries}):`, {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data
        });
        
        // Se é o último retry, lança o erro
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Se é erro 408 (timeout) ou 429 (rate limit), faz retry com backoff exponencial
        if (error.response?.status === 408 || error.response?.status === 429) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.log(`⏳ Aguardando ${delay}ms antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Para outros erros, não faz retry
          throw error;
        }
      }
    }
  }

  /**
   * Busca todos os registros da CL usando paginação com offset (abordagem robusta)
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Array>} Array com todos os registros da CL
   */
  async fetchAllCLRecordsWithOffset(options = {}) {
    const startOffset = options.startOffset || 0;
    try {
      console.log('🚀 Iniciando busca de todos os registros da CL usando paginação com offset...');
      
      const allRecords = [];
      const pageSize = Math.min(options.size || 1000, 1000); // Máximo de 1000 por página
      let currentOffset = startOffset;
      let hasMoreRecords = true;
      let requestCount = 0;
      const maxRequests = options.maxRequests || 5000; // Para suportar 364.546 registros
      let totalRecords = 0;
      
      // Primeira requisição para obter o total
      console.log('🔄 Busca inicial para verificar total de registros...');
      const initialResponse = await this.fetchCLWithOffset(0, pageSize, options);
      
      if (initialResponse && initialResponse.data && Array.isArray(initialResponse.data)) {
        allRecords.push(...initialResponse.data);
        console.log(`✅ Página 1: ${initialResponse.data.length} registros adicionados`);
        
        // Extrai o total de registros do header content-range
        const contentRange = initialResponse.headers?.['rest-content-range'] || '';
        console.log(`📊 Content-Range: ${contentRange}`);
        
        if (contentRange) {
          const match = contentRange.match(/resources \d+-\d+\/(\d+)/);
          if (match) {
            totalRecords = parseInt(match[1]);
            console.log(`📊 Total de registros disponíveis: ${totalRecords.toLocaleString()}`);
          }
        }
        
        // Se não conseguiu extrair o total ou se há mais registros para buscar
        if (totalRecords === 0 || initialResponse.data.length === pageSize) {
          currentOffset = pageSize;
          hasMoreRecords = true;
        } else {
          hasMoreRecords = false;
        }
        
        // Continua buscando enquanto houver registros
        while (hasMoreRecords && requestCount < maxRequests && (totalRecords === 0 || currentOffset < totalRecords)) {
          requestCount++;
          console.log(`📄 Buscando página ${requestCount + 1} (offset: ${currentOffset})...`);
          
          try {
            const response = await this.fetchCLWithOffset(currentOffset, pageSize, options);
            
            if (response && response.data && Array.isArray(response.data)) {
              if (response.data.length > 0) {
                allRecords.push(...response.data);
                console.log(`✅ Página ${requestCount + 1}: ${response.data.length} registros adicionados (Total acumulado: ${allRecords.length})`);
                
                // Se recebeu menos registros do que o tamanho da página, chegou ao fim
                if (response.data.length < pageSize) {
                  console.log('📄 Última página alcançada (registros < tamanho da página)');
                  hasMoreRecords = false;
                } else {
                  currentOffset += pageSize;
                }
              } else {
                console.log('📄 Nenhum registro retornado, finalizando busca');
                hasMoreRecords = false;
              }
            } else {
              console.log('📄 Resposta vazia ou inválida, finalizando busca');
              hasMoreRecords = false;
            }
            
            // Pausa entre requisições para não sobrecarregar
            await new Promise(resolve => setTimeout(resolve, 200));
            
          } catch (error) {
            console.error(`❌ Erro ao buscar página ${requestCount + 1}:`, error.message);
            hasMoreRecords = false;
          }
        }
        
        console.log(`🎉 Busca com offset concluída!`);
        console.log(`📊 Total de registros encontrados: ${allRecords.length.toLocaleString()}`);
        console.log(`📊 Total esperado: ${totalRecords ? totalRecords.toLocaleString() : 'desconhecido'}`);
        
        return allRecords;
        
      } else {
        console.log('⚠️ Resposta inicial inválida');
        return [];
      }
      
    } catch (error) {
      console.error('❌ Erro ao buscar registros da CL com offset:', error);
      throw error;
    }
  }

  /**
   * Busca todos os registros da CL usando scroll tokens (abordagem correta da VTEX)
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Array>} Array com todos os registros da CL
   */
  async fetchAllCLRecordsWithScroll(options = {}) {
    try {
      console.log('🚀 Iniciando busca de todos os registros da CL usando scroll tokens...');
      
      const allRecords = [];
      const pageSize = options.size || 1000; // Usa 1000 conforme documentação da VTEX
      let currentToken = '';
      let hasMoreRecords = true;
      let requestCount = 0;
      const maxRequests = options.maxRequests || 5000; // Aumentado para suportar 364.399 registros
      
      // Primeira requisição para obter o token inicial
      console.log('🔄 Busca inicial para obter token de scroll...');
      const initialResponse = await this.fetchCLWithScroll('', pageSize, options);
      
      if (initialResponse && initialResponse.data && Array.isArray(initialResponse.data)) {
        allRecords.push(...initialResponse.data);
        console.log(`✅ Página 1: ${initialResponse.data.length} registros adicionados`);
        
        // Obtém o token para a próxima página (X-VTEX-MD-TOKEN)
        currentToken = initialResponse.headers?.['x-vtex-page-token'] || '';
        console.log(`📄 Token para próxima página: ${currentToken ? 'presente' : 'ausente'}`);
        
        // Se não há token, significa que não há mais páginas ou scroll não funciona
        if (!currentToken) {
          console.log('📄 Nenhum token retornado na primeira página - scroll tokens podem não estar funcionando');
          console.log(`📊 Retornando apenas os ${allRecords.length} registros da primeira página`);
          return allRecords;
        }
        
        // Continua buscando enquanto houver token
        while (hasMoreRecords && currentToken && requestCount < maxRequests) {
          requestCount++;
          console.log(`📄 Buscando página ${requestCount + 1} com token...`);
          
          try {
            const response = await this.fetchCLWithScroll(currentToken, pageSize, options);
            
            if (response && response.data && Array.isArray(response.data)) {
              if (response.data.length > 0) {
                allRecords.push(...response.data);
                console.log(`✅ Página ${requestCount + 1}: ${response.data.length} registros adicionados (Total acumulado: ${allRecords.length})`);
                
                // Obtém o token para a próxima página
                currentToken = response.headers?.['x-vtex-page-token'] || '';
                console.log(`📄 Token para próxima página: ${currentToken ? 'presente' : 'ausente'}`);
                
                if (!currentToken) {
                  console.log('📄 Nenhum token retornado, finalizando busca');
                  hasMoreRecords = false;
                }
              } else {
                console.log('📄 Nenhum registro retornado, finalizando busca');
                hasMoreRecords = false;
              }
            } else {
              console.log('📄 Resposta vazia ou inválida, finalizando busca');
              hasMoreRecords = false;
            }
            
            // Pausa entre requisições para não sobrecarregar (aumentada para evitar rate limiting)
            await new Promise(resolve => setTimeout(resolve, 500));
            
          } catch (error) {
            console.error(`❌ Erro ao buscar página ${requestCount + 1}:`, error.message);
            hasMoreRecords = false;
          }
        }
        
        console.log(`🎉 Busca com scroll concluída! Total de ${allRecords.length} registros encontrados`);
        return allRecords;
        
      } else {
        console.log('⚠️ Resposta inicial inválida');
        return [];
      }
      
    } catch (error) {
      console.error('❌ Erro ao buscar registros da CL com scroll:', error);
      throw error;
    }
  }

  /**
   * Busca registros da CL usando scroll token
   * @param {string} token - Token de scroll (vazio para primeira página)
   * @param {number} pageSize - Tamanho da página
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Resposta da API
   */
  async fetchCLWithScroll(token = '', pageSize = 200, options = {}) {
    try {
      const baseUrl = process.env.VTEX_BASE_URL;
      const url = `${baseUrl}/api/dataentities/CL/search`;
      
      const params = {
        _size: pageSize,
        _fields: options.fields || 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName',
        _sort: options.sort || 'createdIn DESC'
      };
      
      if (token) {
        params._token = token;
      }
      
      console.log(`🔗 Requisição com scroll: ${url}`, {
        params: params,
        hasToken: !!token,
        tokenPreview: token ? token.substring(0, 20) + '...' : 'nenhum'
      });
      
      const response = await axios({
        method: 'GET',
        url: url,
        params: params,
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
          'pragma': 'no-cache',
          'cache-control': 'max-age=0'
        },
        timeout: 30000
      });
      
      console.log(`📊 Resposta da API (scroll):`, {
        status: response.status,
        dataLength: response.data ? response.data.length : 0,
        contentRange: response.headers?.['rest-content-range'],
        hasNextToken: !!response.headers?.['x-vtex-page-token'],
        nextTokenPreview: response.headers?.['x-vtex-page-token'] ? response.headers['x-vtex-page-token'].substring(0, 20) + '...' : 'nenhum'
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro na requisição com scroll da CL:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Busca todos os registros da CL usando Range headers (abordagem otimizada para grandes volumes)
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Array>} Array com todos os registros da CL
   */
  async fetchAllCLRecordsWithRange(options = {}) {
    try {
      console.log('🚀 Iniciando busca de todos os registros da CL usando Range headers otimizado...');
      
      const allRecords = [];
      const pageSize = options.size || 1000; // Aumentado para 1000 registros por request
      let currentRange = 0;
      let hasMoreRecords = true;
      let requestCount = 0;
      const maxRequests = options.maxRequests || 5000; // Aumentado para suportar 364.399 registros
      
      // Primeira requisição para verificar o total
      console.log('🔄 Busca inicial para verificar total de registros...');
      const initialResponse = await this.fetchCLWithRange(0, pageSize - 1, options);
      
      if (initialResponse && initialResponse.headers) {
        const contentRange = initialResponse.headers['rest-content-range'];
        console.log(`📊 Content-Range header: ${contentRange}`);
        
        if (contentRange) {
          const match = contentRange.match(/resources \d+-\d+\/(\d+)/);
          if (match) {
            const totalRecords = parseInt(match[1]);
            console.log(`📊 Total de registros na CL: ${totalRecords}`);
            
            // Adiciona registros da primeira página
            if (initialResponse.data && Array.isArray(initialResponse.data)) {
              allRecords.push(...initialResponse.data);
              console.log(`✅ Página 1: ${initialResponse.data.length} registros adicionados (Total acumulado: ${allRecords.length})`);
            }
            
            // Continua com as próximas páginas usando Range
            currentRange = pageSize;
            
            while (hasMoreRecords && requestCount < maxRequests && currentRange < totalRecords) {
              requestCount++;
              const rangeEnd = Math.min(currentRange + pageSize - 1, totalRecords - 1);
              console.log(`📄 Buscando página ${requestCount + 1} com Range ${currentRange}-${rangeEnd}... (${Math.round((currentRange / totalRecords) * 100)}% completo)`);
              
              try {
                const response = await this.fetchCLWithRange(currentRange, rangeEnd, options);
                
                if (response && response.data && Array.isArray(response.data)) {
                  if (response.data.length > 0) {
                    allRecords.push(...response.data);
                    console.log(`✅ Página ${requestCount + 1}: ${response.data.length} registros adicionados (Total acumulado: ${allRecords.length}/${totalRecords})`);
                    currentRange += pageSize;
                  } else {
                    console.log('📄 Nenhum registro retornado, finalizando busca');
                    hasMoreRecords = false;
                  }
                } else {
                  console.log('📄 Resposta vazia ou inválida, finalizando busca');
                  hasMoreRecords = false;
                }
                
                // Pausa entre requisições para não sobrecarregar
                await new Promise(resolve => setTimeout(resolve, 100));
                
              } catch (error) {
                console.error(`❌ Erro ao buscar página ${requestCount + 1}:`, error.message);
                hasMoreRecords = false;
              }
            }
            
            console.log(`🎉 Busca com Range concluída! Total de ${allRecords.length} registros encontrados de ${totalRecords} esperados`);
            
            // Verifica se conseguiu buscar todos os registros
            if (allRecords.length < totalRecords) {
              console.warn(`⚠️ Aviso: Buscou ${allRecords.length} registros de ${totalRecords} esperados (${Math.round((allRecords.length / totalRecords) * 100)}%)`);
            }
            
            return allRecords;
            
          } else {
            console.log('⚠️ Não foi possível extrair o total de registros do header');
          }
        }
      }
      
      // Fallback: se não conseguiu extrair o total, tenta buscar algumas páginas
      console.log('🔄 Fallback: buscando algumas páginas sem saber o total...');
      return await this.fetchAllCLRecordsFallback(options);
      
    } catch (error) {
      console.error('❌ Erro ao buscar registros da CL com Range:', error);
      throw error;
    }
  }

  /**
   * Busca registros da CL usando offset (_from) - Helper para paginação robusta
   * @param {number} offset - Offset inicial (_from)
   * @param {number} size - Tamanho da página (_size)
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Resposta da API
   */
  async fetchCLWithOffset(offset = 0, size = 1000, options = {}) {
    try {
      const baseUrl =process.env.VTEX_BASE_URL;
      const url = `${baseUrl}/api/dataentities/CL/search`;
      
      const params = {
        _size: size,
        _from: offset,
        _fields: options.fields || 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName',
        _sort: options.sort || 'createdIn DESC'
      };
      
      console.log(`🔗 Requisição com offset: ${url}`, {
        params: params,
        offset: offset,
        size: size
      });
      
      const response = await axios({
        method: 'GET',
        url: url,
        params: params,
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
          'pragma': 'no-cache',
          'cache-control': 'max-age=0'
        },
        timeout: 30000
      });
      
      console.log(`📊 Resposta da API (offset):`, {
        status: response.status,
        dataLength: response.data ? response.data.length : 0,
        contentRange: response.headers?.['rest-content-range'],
        offset: offset,
        size: size
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro na requisição com offset da CL:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        offset: offset,
        size: size
      });
      throw error;
    }
  }

  /**
   * Busca registros da CL usando Range header
   * @param {number} start - Início do range
   * @param {number} end - Fim do range
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Resposta da API
   */
  async fetchCLWithRange(start = 0, end = 199, options = {}) {
    try {
      const baseUrl = process.env.VTEX_BASE_URL;
      const url = `${baseUrl}/api/dataentities/CL/search`;
      
      const params = {
        _size: end - start + 1,
        _fields: options.fields || 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName',
        _sort: options.sort || 'createdIn DESC'
      };
      
      const headers = {
        'Accept': 'application/vnd.vtex.ds.v10+json',
        'Content-Type': 'application/json',
        'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
        'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
        'Range': `resources=${start}-${end}`,
        'pragma': 'no-cache',
        'cache-control': 'max-age=0'
      };
      
      console.log(`🔗 Requisição com Range: ${url}`, {
        params: params,
        range: `${start}-${end}`
      });
      
      const response = await axios({
        method: 'GET',
        url: url,
        params: params,
        headers: headers,
        timeout: 30000
      });
      
      console.log(`📊 Resposta da API (Range ${start}-${end}):`, {
        status: response.status,
        dataLength: response.data ? response.data.length : 0,
        contentRange: response.headers?.['rest-content-range']
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro na requisição com Range da CL:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Fallback para buscar registros da CL sem saber o total
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Array>} Array com registros da CL
   */
  async fetchAllCLRecordsFallback(options = {}) {
    try {
      console.log('🔄 Iniciando busca fallback da CL...');
      
      const allRecords = [];
      const pageSize = options.size || 200;
      let currentRange = 0;
      let requestCount = 0;
      const maxRequests = options.maxRequests || 100; // Limite menor para fallback
      
      while (requestCount < maxRequests) {
        requestCount++;
        const rangeEnd = currentRange + pageSize - 1;
        console.log(`📄 Buscando página ${requestCount} com Range ${currentRange}-${rangeEnd}...`);
        
        try {
          const response = await this.fetchCLWithRange(currentRange, rangeEnd, options);
          
          if (response && response.data && Array.isArray(response.data)) {
            if (response.data.length > 0) {
              allRecords.push(...response.data);
              console.log(`✅ Página ${requestCount}: ${response.data.length} registros adicionados`);
              currentRange += pageSize;
            } else {
              console.log('📄 Nenhum registro retornado, finalizando busca');
              break;
            }
          } else {
            console.log('📄 Resposta vazia ou inválida, finalizando busca');
            break;
          }
          
          // Pausa entre requisições (aumentada para evitar rate limiting)
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`❌ Erro ao buscar página ${requestCount}:`, error.message);
          break;
        }
      }
      
      console.log(`🎉 Busca fallback concluída! Total de ${allRecords.length} registros encontrados`);
      return allRecords;
      
    } catch (error) {
      console.error('❌ Erro na busca fallback da CL:', error);
      throw error;
    }
  }

  /**
   * Testa a API da CL para descobrir campos disponíveis e comportamento de paginação
   * @returns {Promise<Object>} Resultado do teste
   */
  async testCLAPI() {
    try {
      console.log('🧪 Testando API da CL para descobrir campos e paginação...');
      
      const baseUrl = process.env.VTEX_BASE_URL;
      const url = `${baseUrl}/api/dataentities/CL/search`;
      
      // Teste 1: Busca básica sem campos específicos para ver todos os campos disponíveis
      console.log('📄 Teste 1: Busca básica para ver todos os campos...');
      const response1 = await axios({
        method: 'GET',
        url: url,
        params: {
          _size: 5,
          _sort: 'createdIn DESC'
        },
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
          'pragma': 'no-cache',
          'cache-control': 'max-age=0'
        },
        timeout: 30000
      });
      
      console.log('✅ Resposta 1 - Campos disponíveis:', {
        status: response1.status,
        dataLength: response1.data ? response1.data.length : 0,
        contentRange: response1.headers?.['rest-content-range'],
        sampleRecord: response1.data && response1.data.length > 0 ? Object.keys(response1.data[0]) : 'nenhum'
      });
      
      if (response1.data && response1.data.length > 0) {
        console.log('📋 Campos disponíveis no primeiro registro:', Object.keys(response1.data[0]));
        console.log('📋 Exemplo de registro:', JSON.stringify(response1.data[0], null, 2));
      }
      
      // Teste 2: Busca com paginação usando _from
      console.log('📄 Teste 2: Testando paginação com _from...');
      const response2 = await axios({
        method: 'GET',
        url: url,
        params: {
          _size: 10,
          _from: 10,
          _sort: 'createdIn DESC'
        },
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
          'pragma': 'no-cache',
          'cache-control': 'max-age=0'
        },
        timeout: 30000
      });
      
      console.log('✅ Resposta 2 - Paginação com _from:', {
        status: response2.status,
        dataLength: response2.data ? response2.data.length : 0,
        contentRange: response2.headers?.['rest-content-range']
      });
      
      // Teste 3: Busca com scroll usando _token
      console.log('📄 Teste 3: Testando scroll com _token...');
      const response3 = await axios({
        method: 'GET',
        url: url,
        params: {
          _size: 10,
          _sort: 'createdIn DESC'
        },
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
          'pragma': 'no-cache',
          'cache-control': 'max-age=0'
        },
        timeout: 30000
      });
      
      console.log('✅ Resposta 3 - Scroll inicial:', {
        status: response3.status,
        dataLength: response3.data ? response3.data.length : 0,
        contentRange: response3.headers?.['rest-content-range'],
        hasToken: !!response3.headers?.['x-vtex-page-token'],
        token: response3.headers?.['x-vtex-page-token'] || 'nenhum'
      });
      
      return {
        success: true,
        test1: {
          fields: response1.data && response1.data.length > 0 ? Object.keys(response1.data[0]) : [],
          sampleRecord: response1.data && response1.data.length > 0 ? response1.data[0] : null,
          totalFromHeader: response1.headers?.['rest-content-range']
        },
        test2: {
          dataLength: response2.data ? response2.data.length : 0,
          contentRange: response2.headers?.['rest-content-range']
        },
        test3: {
          dataLength: response3.data ? response3.data.length : 0,
          contentRange: response3.headers?.['rest-content-range'],
          hasToken: !!response3.headers?.['x-vtex-page-token'],
          token: response3.headers?.['x-vtex-page-token']
        }
      };
      
    } catch (error) {
      console.error('❌ Erro no teste da API da CL:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Testa o comportamento da paginação da API da CL
   * @returns {Promise<Object>} Resultado do teste
   */
  async testPaginationBehavior() {
    try {
      console.log('🧪 Testando comportamento da paginação da CL...');
      
      const baseUrl =process.env.VTEX_BASE_URL;
      const url = `${baseUrl}/api/dataentities/CL/search`;
      
      const results = [];
      
      // Teste 1: Primeira página
      console.log('📄 Teste 1: Primeira página (offset 0)');
      const response1 = await axios({
        method: 'GET',
        url: url,
        params: {
          _size: 10,
          _from: 0,
          _fields: 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName',
          _sort: 'createdIn DESC'
        },
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
        }
      });
      
      results.push({
        test: 'Página 1 (offset 0)',
        status: response1.status,
        dataLength: response1.data?.length || 0,
        contentRange: response1.headers?.['rest-content-range'],
        firstId: response1.data?.[0]?.id,
        lastId: response1.data?.[response1.data.length - 1]?.id
      });
      
      // Teste 2: Segunda página com _from
      console.log('📄 Teste 2: Segunda página (offset 10)');
      const response2 = await axios({
        method: 'GET',
        url: url,
        params: {
          _size: 10,
          _from: 10,
          _fields: 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName',
          _sort: 'createdIn DESC'
        },
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
        }
      });
      
      results.push({
        test: 'Página 2 (offset 10)',
        status: response2.status,
        dataLength: response2.data?.length || 0,
        contentRange: response2.headers?.['rest-content-range'],
        firstId: response2.data?.[0]?.id,
        lastId: response2.data?.[response2.data.length - 1]?.id
      });
      
      // Teste 3: Terceira página com _from
      console.log('📄 Teste 3: Terceira página (offset 20)');
      const response3 = await axios({
        method: 'GET',
        url: url,
        params: {
          _size: 10,
          _from: 20,
          _fields: 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName',
          _sort: 'createdIn DESC'
        },
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
        }
      });
      
      results.push({
        test: 'Página 3 (offset 20)',
        status: response3.status,
        dataLength: response3.data?.length || 0,
        contentRange: response3.headers?.['rest-content-range'],
        firstId: response3.data?.[0]?.id,
        lastId: response3.data?.[response3.data.length - 1]?.id
      });
      
      // Teste 4: Busca com scroll token
      console.log('📄 Teste 4: Busca com scroll token');
      const response4 = await axios({
        method: 'GET',
        url: url,
        params: {
          _size: 10,
          _fields: 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName',
          _sort: 'createdIn DESC'
        },
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
        }
      });
      
      const scrollToken = response4.headers?.['x-vtex-page-token'];
      
      results.push({
        test: 'Scroll inicial',
        status: response4.status,
        dataLength: response4.data?.length || 0,
        contentRange: response4.headers?.['rest-content-range'],
        scrollToken: scrollToken ? 'presente' : 'ausente',
        firstId: response4.data?.[0]?.id,
        lastId: response4.data?.[response4.data.length - 1]?.id
      });
      
      // Teste 5: Segunda página com scroll token
      if (scrollToken) {
        console.log('📄 Teste 5: Segunda página com scroll token');
        const response5 = await axios({
          method: 'GET',
          url: url,
          params: {
            _size: 10,
            _token: scrollToken,
            _fields: 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName',
            _sort: 'createdIn DESC'
          },
          headers: {
            'Accept': 'application/vnd.vtex.ds.v10+json',
            'Content-Type': 'application/json',
            'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
            'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
          }
        });
        
        results.push({
          test: 'Scroll segunda página',
          status: response5.status,
          dataLength: response5.data?.length || 0,
          contentRange: response5.headers?.['rest-content-range'],
          scrollToken: response5.headers?.['x-vtex-page-token'] ? 'presente' : 'ausente',
          firstId: response5.data?.[0]?.id,
          lastId: response5.data?.[response5.data.length - 1]?.id
        });
      }
      
      console.log('📊 Resultados dos testes de paginação:');
      results.forEach(result => {
        console.log(`- ${result.test}: ${result.dataLength} registros, Content-Range: ${result.contentRange}, Primeiro ID: ${result.firstId}`);
      });
      
      // Análise dos resultados
      const analysis = {
        fromWorks: results[0]?.firstId !== results[1]?.firstId,
        scrollWorks: results[3]?.firstId !== results[4]?.firstId,
        recommendations: []
      };
      
      if (!analysis.fromWorks) {
        analysis.recommendations.push('Parâmetro _from não funciona - usar scroll tokens');
      }
      
      if (analysis.scrollWorks) {
        analysis.recommendations.push('Scroll tokens funcionam - implementar paginação com tokens');
      }
      
      return {
        success: true,
        results,
        analysis
      };
      
    } catch (error) {
      console.error('❌ Erro no teste de paginação:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Gera CSV dos registros da CL com endereços (otimizado para grandes volumes)
   * @param {Array} records - Array de registros da CL
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Resultado da operação
   */
  async generateCLCSVWithAddresses(records, options = {}) {
    try {
      console.log('📊 Gerando arquivo CSV dos registros da CL com endereços...');
      
      if (!records || records.length === 0) {
        console.warn('⚠️ Nenhum registro fornecido para gerar CSV');
        return {
          success: false,
          error: 'Nenhum registro fornecido',
          timestamp: getBrazilianTimestamp()
        };
      }

      // Gera nome do arquivo com timestamp de Brasília e range
      const timestamp = getBrazilianTimestampForFilename();
      let filename;
      
      if (options.filename) {
        // Se filename foi fornecido, usa ele como base
        if (userRange) {
          filename = `${options.filename}-${timestamp}-range-${userRange.start}-${userRange.end}.csv`;
        } else {
          filename = `${options.filename}-${timestamp}.csv`;
        }
      } else {
        // Nome padrão com range
        if (userRange) {
          filename = `extracao-${timestamp}-range-${userRange.start}-${userRange.end}.csv`;
        } else {
          filename = `extracao-${timestamp}.csv`;
        }
      }
      
      // Adiciona extensão .csv se não tiver
      if (!filename.endsWith('.csv')) {
        filename += '.csv';
      }

      // Cria o diretório de saída se não existir
      const defaultExports = path.join(__dirname, '..', 'exports');
      let outputDir = process.env.EXPORTS_DIR || defaultExports;
      
      // Garante que o diretório existe
      try {
        await fs.mkdir(outputDir, { recursive: true });
        console.log(`📁 Diretório de exports criado/verificado: ${outputDir}`);
      } catch (error) {
        console.error(`❌ Erro ao criar diretório ${outputDir}:`, error.message);
        
      }

      const filePath = path.join(outputDir, filename);

      // Busca endereços para todos os usuários
      console.log('🔍 Buscando endereços para todos os usuários...');
      
      // Primeiro, busca todos os endereços para criar um mapa de userId -> endereços
      console.log('📊 Buscando todos os endereços para criar mapa de relacionamento...');
      const allAddresses = await this.addressService.fetchAllAddresses({
        size: 1000,
        maxRequests: 1000 // Busca até 1M endereços (para cobrir os 223k existentes)
      });
      
      console.log(`📊 Total de endereços encontrados: ${allAddresses.length}`);
      
      // Cria mapa de userId -> array de endereços
      const addressMap = {};
      allAddresses.forEach(address => {
        const userId = address.userId;
        if (userId) {
          if (!addressMap[userId]) {
            addressMap[userId] = [];
          }
          addressMap[userId].push(address);
        }
      });
      
      console.log(`📊 Mapa de endereços criado para ${Object.keys(addressMap).length} userIds únicos`);

      // Gera o conteúdo CSV em lotes para evitar problemas de memória
      console.log(`📝 Gerando CSV em lotes para ${records.length} registros...`);
      
      // Headers incluindo campos de endereço (padrão Emarsys)
      const headers = [
        // Campos do cliente (CL) - apenas campos necessários para Emarsys
        'email',
        'firstName',
        'lastName',
        'external_id', // CPF (renomeado)
        'date_of_birth', // Data de nascimento (renomeado)
        'phone', // Telefone
        // Campos de endereço (AD) - apenas campos necessários para Emarsys
        'zip_code', // CEP (renomeado)
        'state', // Estado
        'country', // País
        'city' // Cidade
      ];
      
      const csvWithBom = '\ufeff' + headers.join(',') + '\n';
      await fs.writeFile(filePath, csvWithBom, 'utf8');
      
      // Processa registros em lotes de 1000 para evitar problemas de memória
      const batchSize = 1000;
      let totalProcessed = 0;
      let csvContent = '';
      
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        console.log(`📝 Processando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(records.length / batchSize)} (${batch.length} registros)...`);
        
        for (const record of batch) {
          // Busca endereços do usuário
          const userAddresses = addressMap[record.id] || [];
          const primaryAddress = userAddresses.length > 0 ? userAddresses[0] : {};
          
                     const row = [
             // Campos do cliente (CL) - apenas campos necessários para Emarsys
             this.sanitizeField(record.email || '', 100, 'email'),
             this.sanitizeField(record.firstName || record.firstname || '', 50, 'firstName'),
             this.sanitizeField(record.lastName || record.lastname || '', 50, 'lastName'),
             this.sanitizeField(record.document || '', 20, 'external_id'),
             this.sanitizeField(record.birthDate || '', 20, 'date_of_birth'),
             this.sanitizeField(record.phone || '', 20, 'phone'),
             // Campos de endereço (AD) - apenas campos necessários para Emarsys
             this.sanitizeField(primaryAddress.postalCode || '', 20, 'zip_code'),
             this.sanitizeField(primaryAddress.state || '', 10, 'state'),
             this.sanitizeField(primaryAddress.country || '', 10, 'country'),
             this.sanitizeField(primaryAddress.city || '', 50, 'city')
           ];
          csvContent += row.join(',') + '\n';
          totalProcessed++;
        }
        
        // A cada 5000 registros, escreve no arquivo e limpa a memória
        if (csvContent.length > 100000) { // Aproximadamente 5000 registros
          await fs.appendFile(filePath, csvContent, 'utf8');
          console.log(`💾 Escrito ${totalProcessed} registros no arquivo...`);
          csvContent = '';
        }
      }
      
      // Escreve o restante dos dados
      if (csvContent.length > 0) {
        await fs.appendFile(filePath, csvContent, 'utf8');
      }

      console.log(`✅ Arquivo CSV da CL com endereços gerado: ${filePath}`);
      console.log(`📊 Total de registros processados: ${totalProcessed}`);

      const result = {
        success: true,
        filename: filename,
        filePath: filePath,
        timestamp: getBrazilianTimestamp(),
        totalRecords: totalProcessed,
        totalRecordsExpected: records.length,
        totalAddressesFound: Object.keys(addressMap).length
      };

      return result;

    } catch (error) {
      console.error('❌ Erro ao gerar CSV da CL com endereços:', error);
      return {
        success: false,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      };
    }
  }

  /**
   * Gera CSV dos registros da CL (otimizado para grandes volumes) - versão sem endereços
   * @param {Array} records - Array de registros da CL
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Resultado da operação
   */
  async generateCLCSV(records, options = {}) {
    try {
      console.log('📊 Gerando arquivo CSV dos registros da CL (otimizado para grandes volumes)...');
      
      if (!records || records.length === 0) {
        console.warn('⚠️ Nenhum registro fornecido para gerar CSV');
        return {
          success: false,
          error: 'Nenhum registro fornecido',
          timestamp: getBrazilianTimestamp()
        };
      }

      // Gera nome do arquivo com timestamp de Brasília
      const timestamp = getBrazilianTimestampForFilename();
      const filename = options.filename || `openflow-piccadilly-cl-data-${timestamp}.csv`;
      
      // Adiciona extensão .csv se não tiver
      if (!filename.endsWith('.csv')) {
        filename += '.csv';
      }

      // Cria o diretório de saída se não existir
      const defaultExports = path.join(__dirname, '..', 'exports');
      let outputDir = process.env.EXPORTS_DIR || defaultExports;
      
      // Garante que o diretório existe
      try {
        await fs.mkdir(outputDir, { recursive: true });
        console.log(`📁 Diretório de exports criado/verificado: ${outputDir}`);
      } catch (error) {
        console.error(`❌ Erro ao criar diretório ${outputDir}:`, error.message);
        
        
      }

      const filePath = path.join(outputDir, filename);

      // Gera o conteúdo CSV em lotes para evitar problemas de memória
      console.log(`📝 Gerando CSV em lotes para ${records.length} registros...`);
      
      // Escreve o header primeiro
      const headers = [
        'id',
        'email',
        'external_id',
        'date_of_birth',
        'phone',
        'createdIn',
        'updatedIn'
      ];
      
      const csvWithBom = '\ufeff' + headers.join(',') + '\n';
      await fs.writeFile(filePath, csvWithBom, 'utf8');
      
      // Processa registros em lotes de 1000 para evitar problemas de memória
      const batchSize = 1000;
      let totalProcessed = 0;
      let csvContent = '';
      
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        console.log(`📝 Processando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(records.length / batchSize)} (${batch.length} registros)...`);
        
        for (const record of batch) {
          const row = [
            this.sanitizeField(record.id || '', 100, 'id'),
            this.sanitizeField(record.email || '', 100, 'email'),
            this.sanitizeField(record.document || '', 20, 'external_id'),
            this.sanitizeField(record.birthDate || '', 20, 'date_of_birth'),
            this.sanitizeField(record.phone || '', 20, 'phone'),
            this.sanitizeField(record.createdIn || '', 100, 'createdIn'),
            this.sanitizeField(record.updatedIn || '', 100, 'updatedIn')
          ];
          csvContent += row.join(',') + '\n';
          totalProcessed++;
        }
        
        // A cada 5000 registros, escreve no arquivo e limpa a memória
        if (csvContent.length > 100000) { // Aproximadamente 5000 registros
          await fs.appendFile(filePath, csvContent, 'utf8');
          console.log(`💾 Escrito ${totalProcessed} registros no arquivo...`);
          csvContent = '';
        }
      }
      
      // Escreve o restante dos dados
      if (csvContent.length > 0) {
        await fs.appendFile(filePath, csvContent, 'utf8');
      }

      console.log(`✅ Arquivo CSV da CL gerado: ${filePath}`);
      console.log(`📊 Total de registros processados: ${totalProcessed}`);

      const result = {
        success: true,
        filename: filename,
        filePath: filePath,
        timestamp: getBrazilianTimestamp(),
        totalRecords: totalProcessed,
        totalRecordsExpected: records.length
      };

      return result;

    } catch (error) {
      console.error('❌ Erro ao gerar CSV da CL:', error);
      return {
        success: false,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      };
    }
  }

  /**
   * Gera conteúdo CSV para os registros da CL (mantido para compatibilidade)
   * @param {Array} records - Array de registros da CL
   * @returns {string} Conteúdo CSV
   */
  generateCLCSVContent(records) {
    // Headers baseados nos campos que realmente existem na API da CL
    const headers = [
      'id',
      'email',
      'external_id',
      'date_of_birth',
      'phone',
      'createdIn',
      'updatedIn'
    ];

    let csvContent = headers.join(',') + '\n';

    for (const record of records) {
      const row = [
        this.sanitizeField(record.id || '', 100, 'id'),
        this.sanitizeField(record.email || '', 100, 'email'),
        this.sanitizeField(record.document || '', 20, 'external_id'),
        this.sanitizeField(record.birthDate || '', 20, 'date_of_birth'),
        this.sanitizeField(record.phone || '', 20, 'phone'),
        this.sanitizeField(record.createdIn || '', 100, 'createdIn'),
        this.sanitizeField(record.updatedIn || '', 100, 'updatedIn')
      ];
      csvContent += row.join(',') + '\n';
    }

    return csvContent;
  }

  /**
   * Gera nome único de arquivo, adicionando sufixo se já existir
   * @param {string} baseFilename - Nome base do arquivo
   * @param {string} outputDir - Diretório de saída
   * @returns {string} Nome único do arquivo
   */
  async generateUniqueFilename(baseFilename, outputDir) {
    let filename = baseFilename;
    let counter = 1;
    
    // Verifica se o arquivo já existe e adiciona sufixo se necessário
    while (await fs.pathExists(path.join(outputDir, `${filename}-part-1.csv`))) {
      filename = `${baseFilename}-v${counter}`;
      counter++;
    }
    
    return filename;
  }

  /**
   * Carrega checkpoint de uma extração anterior
   * @param {string} checkpointFile - Caminho do arquivo de checkpoint
   * @returns {Object|null} Dados do checkpoint ou null se não existir
   */
  async loadCheckpoint(checkpointFile) {
    try {
      if (await fs.pathExists(checkpointFile)) {
        const data = await fs.readJson(checkpointFile);
        console.log(`📂 Checkpoint encontrado: ${checkpointFile}`);
        return data;
      }
    } catch (error) {
      console.error(`❌ Erro ao carregar checkpoint: ${error.message}`);
    }
    return null;
  }

  /**
   * Salva checkpoint do progresso atual
   * @param {string} checkpointFile - Caminho do arquivo de checkpoint
   * @param {Object} data - Dados do progresso
   */
  async saveCheckpoint(checkpointFile, data) {
    try {
      await fs.writeJson(checkpointFile, {
        ...data,
        timestamp: new Date().toISOString(),
        version: '1.0'
      }, { spaces: 2 });
    } catch (error) {
      console.error(`❌ Erro ao salvar checkpoint: ${error.message}`);
    }
  }

  /**
   * Remove checkpoint após conclusão bem-sucedida
   * @param {string} checkpointFile - Caminho do arquivo de checkpoint
   */
  async removeCheckpoint(checkpointFile) {
    try {
      if (await fs.pathExists(checkpointFile)) {
        await fs.remove(checkpointFile);
        console.log(`🗑️ Checkpoint removido: ${checkpointFile}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao remover checkpoint: ${error.message}`);
    }
  }

  /**
   * Sanitiza campo para CSV removendo caracteres problemáticos
   * @param {*} value - Valor a ser sanitizado
   * @param {number} maxLength - Comprimento máximo (padrão: 100)
   * @returns {string} Valor sanitizado
   */
  sanitizeField(value, maxLength = 100, fieldName = '') {
    if (value === null || value === undefined) return '';
    
    // Converte para string e remove caracteres problemáticos
    let cleanValue = String(value)
      .replace(/"/g, '')           // Remove aspas duplas
      .replace(/,/g, ' ')          // Substitui vírgulas por espaços
      .replace(/\r?\n/g, ' ')      // Remove quebras de linha
      .trim();                     // Remove espaços extras
    
    // Normalização específica para datas de nascimento (YYYY-MM-DD)
    if (fieldName === 'date_of_birth') {
      // Se vier em ISO (YYYY-MM-DDTHH:mm:ss[.sss][Z]) corta apenas a parte da data
      const isoMatch = cleanValue.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
      if (isoMatch) {
        cleanValue = isoMatch[1];
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
        // já está no formato correto
      } else {
        // Tenta fazer parse e reformatar
        const d = new Date(cleanValue);
        if (!isNaN(d.getTime())) {
          cleanValue = d.toISOString().slice(0, 10);
        }
      }
    }
    
    // Mantemos o documento como texto; remoções específicas serão aplicadas no ponto de uso
    
    // Trunca se necessário
    if (cleanValue.length > maxLength) {
      cleanValue = cleanValue.substring(0, maxLength);
    }
    
    return cleanValue;
  }

  /**
   * Gera CSV dos registros da CL com endereços dividido em múltiplos arquivos (otimizado para Emarsys)
   * @param {Array} records - Array de registros da CL
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Resultado da operação
   */
  async generateCLCSVWithAddressesOptimized(records, options = {}) {
    try {
      console.log('📊 Gerando arquivos CSV da CL com endereços otimizado para Emarsys...');
      
      if (!records || records.length === 0) {
        console.warn('⚠️ Nenhum registro fornecido para gerar CSV');
        return {
          success: false,
          error: 'Nenhum registro fornecido',
          timestamp: getBrazilianTimestamp()
        };
      }

      // Função para buscar endereço de um usuário específico (busca individual)
      const getUserAddress = async (record) => {
        try {
          const userId = record.id; // O id da CL é o userId da AD
          const userAddresses = await this.addressService.fetchAddressesByUserId(userId);
          return userAddresses.length > 0 ? userAddresses[0] : {}; // Retorna o primeiro endereço ou objeto vazio
        } catch (error) {
          console.error(`❌ Erro ao buscar endereço para userId ${record.id}:`, error.message);
          return {}; // Retorna objeto vazio em caso de erro
        }
      };
      
      console.log(`📊 Buscando endereços para ${records.length} usuários...`);

                   // Headers incluindo campos de endereço (padrão Emarsys)
      const headers = [
        // Campos do cliente (CL) - apenas campos necessários para Emarsys
        'email',
        'firstName',
        'lastName',
        'external_id', // CPF (renomeado)
        'date_of_birth', // Data de nascimento (renomeado)
        'phone', // Telefone
        'zip_code', // CEP (renomeado)
        'state', // Estado
        'country', // País
        'city' // Cidade
      ];
      
      // Configurações para divisão de arquivos
      const maxFileSizeMB = options.maxFileSizeMB || 99; // Máximo 99MB por arquivo (limite Emarsys)
      const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;
      const recordsPerFile = Math.floor(maxFileSizeBytes / (headers.length * 200)); // Estimativa de 200 bytes por campo
      
      console.log(`📊 Configurações de divisão: máximo ${maxFileSizeMB}MB por arquivo, ~${recordsPerFile} registros por arquivo`);
      
      // Cria o diretório de saída se não existir
      const defaultExports = path.join(__dirname, '..', 'exports');
      let outputDir = process.env.EXPORTS_DIR || defaultExports;
      
      try {
        await fs.mkdir(outputDir, { recursive: true });
        console.log(`📁 Diretório de exports criado/verificado: ${outputDir}`);
      } catch (error) {
        console.error(`❌ Erro ao criar diretório ${outputDir}:`, error.message);
        
      }

      // Gera nome base do arquivo com timestamp e range
      const timestamp = getBrazilianTimestampForFilename();
      let baseFilename;
      
      if (options.filename) {
        // Se filename foi fornecido, usa ele como base
        if (userRange) {
          baseFilename = `${options.filename}-${timestamp}-range-${userRange.start}-${userRange.end}`;
        } else {
          baseFilename = `${options.filename}-${timestamp}`;
        }
      } else {
        // Nome padrão com range
        if (userRange) {
          baseFilename = `extracao-${timestamp}-range-${userRange.start}-${userRange.end}`;
        } else {
          baseFilename = `extracao-${timestamp}`;
        }
      }
      
      // Divide registros em arquivos
      const files = [];
      let currentFileIndex = 1;
      let currentFileRecords = 0;
      let currentFileContent = '';
      let totalProcessed = 0;
      
      // Escreve o header do primeiro arquivo
      const csvHeader = '\ufeff' + headers.join(',') + '\n';
      currentFileContent = csvHeader;
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        
        // Busca endereço específico do usuário
        const primaryAddress = await getUserAddress(record);
        
                 // Cria linha com todos os campos (apenas campos necessários)
         const row = [
           // Campos do cliente (CL) - apenas campos necessários para Emarsys
           this.sanitizeFieldForCSV(record.email || ''),
           this.sanitizeFieldForCSV(record.firstName || record.firstname || ''),
           this.sanitizeFieldForCSV(record.lastName || record.lastname || ''),
           this.sanitizeFieldForCSV(record.document || ''), // CPF -> external_id (como vem da base)
           this.sanitizeFieldForCSV(record.birthDate || ''), // Data de nascimento -> date_of_birth
           this.sanitizeFieldForCSV(this.getPhoneNumber(record)), // Telefone
           // Campos de endereço (AD) - apenas campos necessários para Emarsys
           this.sanitizeFieldForCSV(primaryAddress.postalCode || ''), // CEP -> zip_code
           this.sanitizeFieldForCSV(primaryAddress.state || ''), // Estado
           this.sanitizeFieldForCSV(primaryAddress.country || 'BRA'), // País (padrão Brasil)
           this.sanitizeFieldForCSV(primaryAddress.city || '') // Cidade
         ];
        
        const rowContent = row.join(',') + '\n';
        currentFileContent += rowContent;
        currentFileRecords++;
        totalProcessed++;
        
        // Verifica se precisa criar novo arquivo
        if (currentFileRecords >= recordsPerFile || i === records.length - 1) {
          // Salva arquivo atual
          const filename = `${baseFilename}-part-${currentFileIndex}.csv`;
          const filePath = path.join(outputDir, filename);
          
          await fs.writeFile(filePath, currentFileContent, 'utf8');
          
          const fileSizeMB = (Buffer.byteLength(currentFileContent, 'utf8') / (1024 * 1024)).toFixed(2);
          
          console.log(`✅ Arquivo ${currentFileIndex} salvo: ${filename} (${currentFileRecords} registros, ${fileSizeMB}MB)`);
          
          files.push({
            filename: filename,
            filePath: filePath,
            records: currentFileRecords,
            sizeMB: parseFloat(fileSizeMB)
          });
          
          // Prepara próximo arquivo
          currentFileIndex++;
          currentFileRecords = 0;
          currentFileContent = csvHeader; // Header para próximo arquivo
        }
        
        // Log de progresso a cada 1000 registros
        if (totalProcessed % 1000 === 0) {
          console.log(`📊 Progresso: ${totalProcessed}/${records.length} registros processados (${Math.round((totalProcessed / records.length) * 100)}%)`);
        }
      }

      console.log(`🎉 Geração de arquivos CSV concluída!`);
      console.log(`📊 Total de registros processados: ${totalProcessed}`);
      console.log(`📁 Total de arquivos gerados: ${files.length}`);

      const result = {
        success: true,
        files: files,
        timestamp: getBrazilianTimestamp(),
        totalRecords: totalProcessed,
        totalRecordsExpected: records.length,
        totalFiles: files.length
      };

      return result;

    } catch (error) {
      console.error('❌ Erro ao gerar CSV da CL com endereços otimizado:', error);
      return {
        success: false,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      };
    }
  }

  /**
   * Obtém o telefone correto do registro (phone ou homePhone como fallback)
   * @param {Object} record - Registro da CL
   * @returns {string} Telefone ou string vazia
   */
  getPhoneNumber(record) {
    // Prioriza o campo 'phone', se não tiver, usa 'homePhone'
    return record.phone || record.homePhone || '';
  }

  /**
   * Sanitiza campo para CSV com aspas duplas (padrão RFC 4180)
   * @param {*} value - Valor a ser sanitizado
   * @returns {string} Valor sanitizado
   */
  sanitizeFieldForCSV(value) {
    if (value === null || value === undefined) return '';
    
    // Converte para string
    let cleanValue = String(value).trim();
    
    // Se o valor parecer uma data ISO (YYYY-MM-DDTHH:mm:ss...) normalize para apenas YYYY-MM-DD
    const isoDate = cleanValue.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
    if (isoDate) {
      cleanValue = isoDate[1];
    }
    // Também cobre casos como "1976-09-16T00:00:00" ou "1976-09-16 00:00:00"
    
    // Não forçar numérico para evitar notação científica em planilhas
    
    // Remove quebras de linha e tabs
    cleanValue = cleanValue.replace(/[\r\n\t]/g, ' ');
    
    // Remove múltiplos espaços
    cleanValue = cleanValue.replace(/\s+/g, ' ');
    
    // Se contém vírgula, aspas duplas ou quebra de linha, envolve em aspas duplas
    if (cleanValue.includes(',') || cleanValue.includes('"') || cleanValue.includes('\n') || cleanValue.includes('\r')) {
      // Escapa aspas duplas existentes (duplica-as)
      cleanValue = cleanValue.replace(/"/g, '""');
      // Envolve em aspas duplas
      cleanValue = `"${cleanValue}"`;
    }
    
    return cleanValue;
  }

  /**
   * Executa o fluxo completo de extração de contatos com endereços (processamento em tempo real)
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Resultado da operação
   */
  async extractContactsWithAddresses(options = {}) {
    try {
      console.log('🚀 Iniciando extração completa de contatos com endereços...');
      
      // Verifica se deve usar scroll na entidade AD
      const useScroll = options.useScroll || false;
      if (useScroll) {
        console.log('🔄 Modo scroll ativado: usando scroll na entidade AD para otimização');
        console.log('📋 Fluxo: CL (scroll) → AD (scroll) → CSV em tempo real');
      } else {
        console.log('📋 Fluxo: CL (scroll) → AD (endereços individuais) → CSV em tempo real');
      }
      
      // Processa o userLimit que pode ser um range (ex: "1:10000") ou número simples
      let userRange = null;
      if (options.userLimit) {
        if (typeof options.userLimit === 'string' && options.userLimit.includes(':')) {
          // Formato range: "start:end"
          const [start, end] = options.userLimit.split(':').map(Number);
          if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start) {
            userRange = { start, end, total: end - start + 1 };
            console.log(`📊 Range de usuários definido: ${start} a ${end} (${userRange.total} registros)`);
          } else {
            throw new Error('Formato de range inválido. Use "start:end" (ex: "1:10000")');
          }
        } else {
          // Formato simples: número
          const limit = Number(options.userLimit);
          if (!isNaN(limit) && limit > 0) {
            userRange = { start: 1, end: limit, total: limit };
            console.log(`📊 Limite de usuários definido: ${limit} registros`);
          } else {
            throw new Error('userLimit deve ser um número positivo ou range válido');
          }
        }
      }
      
      const startTime = Date.now();
      
      // Configurações para divisão de arquivos
      const maxFileSizeMB = options.maxFileSizeMB || 99; // Máximo 99MB por arquivo (limite Emarsys)
      const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;
      
      // Headers incluindo campos de endereço (padrão Emarsys)
      const headers = [
        // Campos do cliente (CL) - apenas campos necessários para Emarsys
        'email',
        'firstName',
        'lastName',
        'external_id', // CPF (renomeado)
        'date_of_birth', // Data de nascimento (renomeado)
        'phone', // Telefone
        'zip_code', // CEP (renomeado)
        'state', // Estado
        'country', // País
        'city' // Cidade
      ];
      
      // Cria o diretório de saída se não existir
      const defaultExports = path.join(__dirname, '..', 'exports');
      let outputDir = process.env.EXPORTS_DIR || defaultExports;
      
      try {
        await fs.mkdir(outputDir, { recursive: true });
        console.log(`📁 Diretório de exports criado/verificado: ${outputDir}`);
      } catch (error) {
        console.error(`❌ Erro ao criar diretório ${outputDir}:`, error.message);
        
      }

      // Gera nome base do arquivo com timestamp e range
      const timestamp = getBrazilianTimestampForFilename();
      let baseFilename;
      
      if (options.filename) {
        // Se filename foi fornecido, usa ele como base
        if (userRange) {
          baseFilename = `${options.filename}-${timestamp}-range-${userRange.start}-${userRange.end}`;
        } else {
          baseFilename = `${options.filename}-${timestamp}`;
        }
      } else {
        // Nome padrão com range
        if (userRange) {
          baseFilename = `extracao-${timestamp}-range-${userRange.start}-${userRange.end}`;
        } else {
          baseFilename = `extracao-${timestamp}`;
        }
      }
      
      // Garante que o nome do arquivo seja único
      baseFilename = await this.generateUniqueFilename(baseFilename, outputDir);
      console.log(`📁 Nome do arquivo final: ${baseFilename}-part-X.csv`);
      
      // Sistema de checkpoint para retomada
      const checkpointFile = path.join(outputDir, `${baseFilename}-checkpoint.json`);
      let checkpoint = await this.loadCheckpoint(checkpointFile);
      
      if (checkpoint) {
        console.log(`🔄 Retomando extração do checkpoint: processados ${checkpoint.totalProcessed}/${userRange?.total || 'N/A'} registros`);
      }
      
             // Variáveis para controle de arquivos
       const files = checkpoint?.files || [];
       let currentFileIndex = checkpoint?.currentFileIndex || 1;
       let currentFileContent = checkpoint?.currentFileContent || '';
       let totalProcessed = checkpoint?.totalProcessed || 0;
       let totalRecordsFound = checkpoint?.totalRecordsFound || 0;
       let recordsSkipped = checkpoint?.recordsSkipped || 0; // Contador de registros pulados (para range)
      
      // Função para buscar endereço de um usuário específico
      const getUserAddress = async (record, addressMap = null) => {
        try {
          const userId = record.id; // id da CL (chave primária)
          
          // Se temos um mapa de endereços (modo scroll ou lote), tenta por userId (relação correta CL.id -> AD.userId)
          if (addressMap && userId && addressMap[userId]) {
            return addressMap[userId];
          }
          
          // Fallback: busca individual na AD pelo userId (menos eficiente)
          const userAddresses = await this.addressService.fetchAddressesByUserId(userId);
          return userAddresses.length > 0 ? userAddresses[0] : {};
        } catch (error) {
          console.error(`❌ Erro ao buscar endereço para userId ${record.id}:`, error.message);
          return {};
        }
      };
      
      // Função para salvar arquivo atual e checkpoint
      const saveCurrentFile = async () => {
        if (currentFileContent.length > 0) {
          const filename = `${baseFilename}-part-${currentFileIndex}.csv`;
          const filePath = path.join(outputDir, filename);
          
          await fs.writeFile(filePath, currentFileContent, 'utf8');
          
          const fileSizeMB = (Buffer.byteLength(currentFileContent, 'utf8') / (1024 * 1024)).toFixed(2);
          const recordsInFile = (currentFileContent.split('\n').length - 2); // -2 para header e linha vazia final
          
          console.log(`✅ Arquivo ${currentFileIndex} salvo: ${filename} (${recordsInFile} registros, ${fileSizeMB}MB)`);
          
          files.push({
            filename: filename,
            filePath: filePath,
            records: recordsInFile,
            sizeMB: parseFloat(fileSizeMB)
          });
          
          // Prepara próximo arquivo
          currentFileIndex++;
          currentFileContent = '\ufeff' + headers.join(',') + '\n'; // Header para próximo arquivo
        }
      };

      // Função para salvar checkpoint do progresso
      const saveProgressCheckpoint = async () => {
        await this.saveCheckpoint(checkpointFile, {
          files,
          currentFileIndex,
          currentFileContent,
          totalProcessed,
          totalRecordsFound,
          recordsSkipped,
          userRange,
          baseFilename,
          startTime,
          options: {
            ...options,
            // Remove campos que podem ser muito grandes
            addressMap: undefined
          }
        });
      };
      
      // Inicializa o primeiro arquivo
      currentFileContent = '\ufeff' + headers.join(',') + '\n';
      
      // Passo 1: Se useScroll=true, buscar endereços via scroll primeiro (respeitando userLimit)
      let addressMap = null;
      if (useScroll) {
        console.log('\n📄 Passo 1: Buscando endereços via scroll na entidade AD...');
        
        const adPageSize = options.adPageSize || 1000;
        const adMaxRequests = options.adMaxRequests || 10000;
        
        // Calcula o limite de endereços baseado no userRange
        let adLimit = null;
        if (userRange) {
          adLimit = userRange.total; // Limita endereços ao mesmo número de usuários
          console.log(`📊 Limite de endereços definido: ${adLimit} (baseado no range de usuários)`);
        }
        
        try {
          // Usa o endpoint oficial de scroll da VTEX para AD com limite
          const addresses = await this.addressService.fetchAllAddresses({
            size: adPageSize,
            maxRequests: adMaxRequests,
            userLimit: adLimit, // Passa o limite para o AddressService
            fields: 'userId,postalCode,state,country,city'
          });
          
          // Cria mapa de userId -> endereço (primeiro endereço encontrado)
          // Relação correta: CL.id -> AD.userId
          addressMap = {};
          addresses.forEach(address => {
            if (address && address.userId && !addressMap[address.userId]) {
              addressMap[address.userId] = address;
            }
          });
          
          console.log(`✅ Mapa de endereços criado: ${Object.keys(addressMap).length} endereços únicos`);
        } catch (error) {
          console.error('❌ Erro ao buscar endereços via scroll (AD/scroll), continuando com busca individual:', error.message);
          addressMap = null;
        }
      }
      
      // Passo 2: Buscar registros da CL e criar estratégia híbrida para endereços
      console.log('\n📄 Passo 2: Buscando registros da CL...');
      
      // Se não usou scroll na AD, vamos coletar todos os CL primeiro e depois buscar endereços em lotes
      let shouldUseHybridMode = !useScroll && userRange && userRange.total <= 50000; // Usa modo híbrido para ranges menores
      
      if (shouldUseHybridMode) {
        console.log('🔧 Modo híbrido ativado: coletando CL primeiro, depois endereços em lotes para otimização');
        return await this.extractContactsWithAddressesHybridMode(options, userRange, startTime, baseFilename, headers, maxFileSizeBytes, outputDir);
      } else {
        console.log('📋 Modo sequencial: processamento em tempo real registro por registro');
      }
      
      const allRecords = [];
      const pageSize = Math.min(options.clPageSize || 1000, 1000);
      let currentToken = '';
      let hasMoreRecords = true;
      let requestCount = 0;
      const maxRequests = options.clMaxRequests || 5000;
      const userLimit = options.userLimit;
      
      // Primeira requisição sem token
      console.log('🔄 Busca inicial (sem token)...');
      const initialResponse = await this.fetchCLWithVTEXScroll('', pageSize, {
        fields: options.clFields || 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName'
      });
      
             if (initialResponse && initialResponse.data && Array.isArray(initialResponse.data)) {
         // Processa registros da primeira página considerando o range
         const recordsToProcess = initialResponse.data;
         
         console.log(`📊 Processando ${recordsToProcess.length} registros da primeira página...`);
         
         for (let i = 0; i < recordsToProcess.length; i++) {
           const record = recordsToProcess[i];
           totalRecordsFound++;
           const recordNumber = totalRecordsFound; // Número sequencial simples
           
           // Verifica se o registro está dentro do range especificado
           if (userRange && (recordNumber < userRange.start || recordNumber > userRange.end)) {
             recordsSkipped++;
             continue; // Pula este registro
           }
           
           // Se tem checkpoint, pula registros já processados
           if (checkpoint && totalProcessed < checkpoint.totalProcessed) {
             totalProcessed++;
             continue; // Pula registro já processado
           }
           
           // Busca endereço específico do usuário (reaproveita addressMap quando disponível)
           const primaryAddress = await getUserAddress(record, addressMap);
           
           // Cria linha com todos os campos
           const row = [
             // Campos do cliente (CL) - apenas campos necessários para Emarsys
             this.sanitizeFieldForCSV(record.email || ''),
             this.sanitizeFieldForCSV(record.firstName || record.firstname || ''),
             this.sanitizeFieldForCSV(record.lastName || record.lastname || ''),
             this.sanitizeFieldForCSV(record.document || ''), // CPF -> external_id (como vem da base)
             this.sanitizeFieldForCSV(record.birthDate || ''), // Data de nascimento -> date_of_birth
             this.sanitizeFieldForCSV(this.getPhoneNumber(record)), // Telefone
             // Campos de endereço (AD) - apenas campos necessários para Emarsys
             this.sanitizeFieldForCSV(primaryAddress.postalCode || ''), // CEP -> zip_code
             this.sanitizeFieldForCSV(primaryAddress.state || ''), // Estado
             this.sanitizeFieldForCSV(primaryAddress.country || 'BRA'), // País (padrão Brasil)
             this.sanitizeFieldForCSV(primaryAddress.city || '') // Cidade
           ];
           
           const rowContent = row.join(',') + '\n';
           currentFileContent += rowContent;
           totalProcessed++;
           
           // Verifica se precisa criar novo arquivo (baseado no tamanho)
           const currentFileSize = Buffer.byteLength(currentFileContent, 'utf8');
           if (currentFileSize >= maxFileSizeBytes) {
             await saveCurrentFile();
           }
           
           // Log de progresso a cada 100 registros e salva checkpoint a cada 500
           if (totalProcessed % 100 === 0) {
             const progressPercent = userRange ? Math.round((totalProcessed / userRange.total) * 100) : 'N/A';
             const rangeInfo = userRange ? ` (${progressPercent}% do range ${userRange.start}-${userRange.end})` : '';
             console.log(`📊 Progresso: ${totalProcessed} registros processados${rangeInfo}`);
             
             // Salva checkpoint a cada 500 registros para segurança
             if (totalProcessed % 500 === 0) {
               console.log(`💾 Salvando checkpoint... (${totalProcessed} registros)`);
               await saveProgressCheckpoint();
             }
           }
           
           // Verifica se atingiu o fim do range
           if (userRange && totalProcessed >= userRange.total) {
             console.log(`📊 Range completo atingido: ${userRange.start}-${userRange.end} (${totalProcessed} registros processados)`);
             break;
           }
         }
         
         // Verifica se já atingiu o fim do range na primeira página
         if (userRange && totalProcessed >= userRange.total) {
           console.log(`📊 Range completo atingido na primeira página: ${userRange.start}-${userRange.end}`);
           await saveCurrentFile(); // Salva o arquivo final
          
          const endTime = Date.now();
          const duration = Math.round((endTime - startTime) / 1000);
          
          console.log('\n🎉 Extração completa concluída com sucesso!');
          console.log(`⏱️ Tempo total: ${duration} segundos`);
          console.log(`📊 Resumo:`);
          console.log(`   - Registros CL processados: ${totalProcessed.toLocaleString()}`);
          if (userRange) {
            console.log(`   - Range processado: ${userRange.start} a ${userRange.end}`);
            console.log(`   - Registros pulados (fora do range): ${recordsSkipped.toLocaleString()}`);
          }
          console.log(`   - Arquivos gerados: ${files.length}`);
          console.log(`   - Tamanho médio por arquivo: ${files.length > 0 ? (files.reduce((sum, file) => sum + file.sizeMB, 0) / files.length).toFixed(2) : '0.00'}MB`);
          
          return {
            success: true,
            timestamp: getBrazilianTimestamp(),
            duration: duration,
            clRecords: totalProcessed,
            csvResult: {
              success: true,
              files: files,
              timestamp: getBrazilianTimestamp(),
              totalRecords: totalProcessed,
              totalRecordsExpected: totalProcessed,
              totalFiles: files.length
            },
            summary: {
              totalRecords: totalProcessed,
              totalFiles: files.length,
              averageFileSize: files.length > 0 ? (files.reduce((sum, file) => sum + file.sizeMB, 0) / files.length).toFixed(2) : '0.00'
            }
          };
        }
        
        // Obtém o token da resposta
        currentToken = initialResponse.headers?.['x-vtex-md-token'] || 
                      initialResponse.headers?.['x-vtex-page-token'] || '';
        
        console.log(`📄 Token para próxima página: ${currentToken ? 'presente' : 'ausente'}`);
        
                 // Continua enquanto houver token e não atingiu o fim do range
         while (hasMoreRecords && currentToken && requestCount < maxRequests && (!userRange || totalProcessed < userRange.total)) {
          requestCount++;
          console.log(`📄 Buscando página ${requestCount + 1} com token...`);
          
          try {
            const response = await this.fetchCLWithVTEXScroll(currentToken, pageSize, {
              fields: options.clFields || 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName'
            });
            
                         if (response && response.data && Array.isArray(response.data)) {
               if (response.data.length > 0) {
                 // Processa todos os registros da página considerando o range
                 const recordsToProcess = response.data;
                 
                 console.log(`📊 Processando ${recordsToProcess.length} registros da página ${requestCount + 1}...`);
                 
                 for (let i = 0; i < recordsToProcess.length; i++) {
                   const record = recordsToProcess[i];
                   totalRecordsFound++;
                   const recordNumber = totalRecordsFound; // Número sequencial simples
                   
                   // Verifica se o registro está dentro do range especificado
                   if (userRange && (recordNumber < userRange.start || recordNumber > userRange.end)) {
                     recordsSkipped++;
                     continue; // Pula este registro
                   }
                   
                   // Se tem checkpoint, pula registros já processados
                   if (checkpoint && totalProcessed < checkpoint.totalProcessed) {
                     totalProcessed++;
                     continue; // Pula registro já processado
                   }
                   
                   // Busca endereço específico do usuário (reaproveita addressMap quando disponível)
                   const primaryAddress = await getUserAddress(record, addressMap);
                   
                   // Cria linha com todos os campos
                   const row = [
                     // Campos do cliente (CL) - apenas campos necessários para Emarsys
                     this.sanitizeFieldForCSV(record.email || ''),
                     this.sanitizeFieldForCSV(record.firstName || record.firstname || ''),
                     this.sanitizeFieldForCSV(record.lastName || record.lastname || ''),
                     this.sanitizeFieldForCSV(record.document || ''), // CPF -> external_id (como vem da base)
                     this.sanitizeFieldForCSV(record.birthDate || ''), // Data de nascimento -> date_of_birth
                     this.sanitizeFieldForCSV(this.getPhoneNumber(record)), // Telefone
                     // Campos de endereço (AD) - apenas campos necessários para Emarsys
                     this.sanitizeFieldForCSV(primaryAddress.postalCode || ''), // CEP -> zip_code
                     this.sanitizeFieldForCSV(primaryAddress.state || ''), // Estado
                     this.sanitizeFieldForCSV(primaryAddress.country || 'BRA'), // País (padrão Brasil)
                     this.sanitizeFieldForCSV(primaryAddress.city || '') // Cidade
                   ];
                   
                   const rowContent = row.join(',') + '\n';
                   currentFileContent += rowContent;
                   totalProcessed++;
                   
                   // Verifica se precisa criar novo arquivo (baseado no tamanho)
                   const currentFileSize = Buffer.byteLength(currentFileContent, 'utf8');
                   if (currentFileSize >= maxFileSizeBytes) {
                     await saveCurrentFile();
                   }
                   
                   // Log de progresso a cada 100 registros e salva checkpoint a cada 500
                   if (totalProcessed % 100 === 0) {
                     const progressPercent = userRange ? Math.round((totalProcessed / userRange.total) * 100) : 'N/A';
                     const rangeInfo = userRange ? ` (${progressPercent}% do range ${userRange.start}-${userRange.end})` : '';
                     console.log(`📊 Progresso: ${totalProcessed} registros processados${rangeInfo}`);
                     
                     // Salva checkpoint a cada 500 registros para segurança
                     if (totalProcessed % 500 === 0) {
                       console.log(`💾 Salvando checkpoint... (${totalProcessed} registros)`);
                       await saveProgressCheckpoint();
                     }
                   }
                   
                   // Verifica se atingiu o fim do range
                   if (userRange && totalProcessed >= userRange.total) {
                     console.log(`📊 Range completo atingido: ${userRange.start}-${userRange.end} (${totalProcessed} registros processados)`);
                     break;
                   }
                 }
                 
                 // Verifica se atingiu o fim do range
                 if (userRange && totalProcessed >= userRange.total) {
                   hasMoreRecords = false;
                   break;
                 }
                
                // Obtém o próximo token
                currentToken = response.headers?.['x-vtex-md-token'] || 
                              response.headers?.['x-vtex-page-token'] || '';
                
                if (!currentToken) {
                  console.log('📄 Nenhum token retornado, finalizando busca');
                  hasMoreRecords = false;
                }
              } else {
                console.log('📄 Nenhum registro retornado, finalizando busca');
                hasMoreRecords = false;
              }
            } else {
              console.log('📄 Resposta inválida, finalizando busca');
              hasMoreRecords = false;
            }
            
            // Pausa entre requisições
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error) {
            console.error(`❌ Erro ao buscar página ${requestCount + 1}:`, error.message);
            
            // Salva checkpoint antes de falhar
            console.log(`💾 Salvando checkpoint devido ao erro... (${totalProcessed} registros processados)`);
            await saveProgressCheckpoint();
            
            // Se é erro de token expirado, informa como retomar
            if (error.message.includes('Operation not found for this token')) {
              console.log('\n🔄 TOKEN EXPIRADO! Para retomar a extração:');
              console.log(`1. Execute novamente com os MESMOS parâmetros`);
              console.log(`2. O sistema detectará o checkpoint e continuará de onde parou`);
              console.log(`3. Progresso salvo: ${totalProcessed}/${userRange?.total || 'N/A'} registros`);
            }
            
            hasMoreRecords = false;
          }
        }
        
        // Salva o arquivo final
        await saveCurrentFile();
        
        // Remove checkpoint após conclusão bem-sucedida
        await this.removeCheckpoint(checkpointFile);
        
        const endTime = Date.now();
        const duration = Math.round((endTime - startTime) / 1000);
        
        console.log('\n🎉 Extração completa concluída com sucesso!');
        console.log(`⏱️ Tempo total: ${duration} segundos`);
        console.log(`📊 Resumo:`);
        console.log(`   - Registros CL processados: ${totalProcessed.toLocaleString()}`);
        if (userRange) {
          console.log(`   - Range processado: ${userRange.start} a ${userRange.end}`);
          console.log(`   - Registros pulados (fora do range): ${recordsSkipped.toLocaleString()}`);
        }
        console.log(`   - Arquivos gerados: ${files.length}`);
        console.log(`   - Tamanho médio por arquivo: ${files.length > 0 ? (files.reduce((sum, file) => sum + file.sizeMB, 0) / files.length).toFixed(2) : '0.00'}MB`);
        
        // Lista os arquivos gerados
        console.log('\n📁 Arquivos gerados:');
        files.forEach((file, index) => {
          console.log(`   ${index + 1}. ${file.filename} (${file.records.toLocaleString()} registros, ${file.sizeMB}MB)`);
        });
        
        return {
          success: true,
          timestamp: getBrazilianTimestamp(),
          duration: duration,
          clRecords: totalProcessed,
          csvResult: {
            success: true,
            files: files,
            timestamp: getBrazilianTimestamp(),
            totalRecords: totalProcessed,
            totalRecordsExpected: totalProcessed,
            totalFiles: files.length
          },
          summary: {
            totalRecords: totalProcessed,
            totalFiles: files.length,
            averageFileSize: files.length > 0 ? (files.reduce((sum, file) => sum + file.sizeMB, 0) / files.length).toFixed(2) : '0.00'
          }
        };
        
      } else {
        console.log('⚠️ Resposta inicial inválida');
        return {
          success: false,
          error: 'Resposta inicial inválida',
          timestamp: getBrazilianTimestamp()
        };
      }
      
    } catch (error) {
      console.error('❌ Erro na extração completa de contatos:', error);
      return {
        success: false,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      };
    }
  }

  /**
   * Modo híbrido otimizado: coleta CL primeiro, depois endereços em lotes
   * @param {Object} options - Opções de configuração
   * @param {Object} userRange - Range de usuários
   * @param {number} startTime - Timestamp de início
   * @param {string} baseFilename - Nome base do arquivo
   * @param {Array} headers - Headers do CSV
   * @param {number} maxFileSizeBytes - Tamanho máximo do arquivo
   * @param {string} outputDir - Diretório de saída
   * @returns {Promise<Object>} Resultado da operação
   */
  async extractContactsWithAddressesHybridMode(options, userRange, startTime, baseFilename, headers, maxFileSizeBytes, outputDir) {
    try {
      console.log('🚀 Iniciando modo híbrido otimizado...');
      
      // Passo 1: Coletar todos os registros CL necessários
      console.log('\n📄 Passo 1: Coletando registros da CL...');
      const clRecords = [];
      const pageSize = Math.min(options.clPageSize || 1000, 1000);
      let currentToken = '';
      let hasMoreRecords = true;
      let requestCount = 0;
      const maxRequests = options.clMaxRequests || 5000;
      let totalRecordsFound = 0;
      let recordsSkipped = 0;
      
      // Primeira requisição
      const initialResponse = await this.fetchCLWithVTEXScroll('', pageSize, {
        fields: options.clFields || 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName'
      });
      
      if (initialResponse && initialResponse.data && Array.isArray(initialResponse.data)) {
        // Processa primeira página
        for (const record of initialResponse.data) {
          totalRecordsFound++;
          const recordNumber = totalRecordsFound;
          
          if (userRange && (recordNumber < userRange.start || recordNumber > userRange.end)) {
            recordsSkipped++;
            continue;
          }
          
          clRecords.push(record);
          if (userRange && clRecords.length >= userRange.total) {
            break;
          }
        }
        
        console.log(`✅ Primeira página: ${clRecords.length} registros coletados (${recordsSkipped} pulados)`);
        
        // Continua se necessário
        currentToken = initialResponse.headers?.['x-vtex-md-token'] || initialResponse.headers?.['x-vtex-page-token'] || '';
        
        while (hasMoreRecords && currentToken && requestCount < maxRequests && (!userRange || clRecords.length < userRange.total)) {
          requestCount++;
          
          const response = await this.fetchCLWithVTEXScroll(currentToken, pageSize, {
            fields: options.clFields || 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName'
          });
          
          if (response && response.data && Array.isArray(response.data)) {
            for (const record of response.data) {
              totalRecordsFound++;
              const recordNumber = totalRecordsFound;
              
              if (userRange && (recordNumber < userRange.start || recordNumber > userRange.end)) {
                recordsSkipped++;
                continue;
              }
              
              clRecords.push(record);
              if (userRange && clRecords.length >= userRange.total) {
                break;
              }
            }
            
            console.log(`✅ Página ${requestCount + 1}: ${clRecords.length} registros coletados no total`);
            
            if (userRange && clRecords.length >= userRange.total) {
              break;
            }
            
            currentToken = response.headers?.['x-vtex-md-token'] || response.headers?.['x-vtex-page-token'] || '';
            if (!currentToken || response.data.length === 0) {
              hasMoreRecords = false;
            }
          } else {
            hasMoreRecords = false;
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`✅ Coleta CL concluída: ${clRecords.length} registros coletados`);
      
      // Passo 2: Coletar userIds únicos (relação correta CL.id -> AD.userId)
      console.log('\n📄 Passo 2: Preparando busca de endereços...');
      const userIds = [...new Set(clRecords.map(r => r.id).filter(id => id && id.trim() !== ''))];
      console.log(`📊 ${userIds.length} userIds únicos para buscar endereços`);
      
      // Passo 3: Buscar endereços em lotes usando userId
      console.log('\n📄 Passo 3: Buscando endereços em lotes...');
      const addressMap = await this.addressService.fetchAddressesByUserIdsInBatch(userIds, {
        maxBatch: 200,
        fields: 'userId,postalCode,state,country,city'
      });
      
      console.log(`✅ ${Object.keys(addressMap).length} endereços encontrados`);
      
      // Passo 4: Gerar CSV com dados combinados
      console.log('\n📄 Passo 4: Gerando arquivos CSV...');
      
      const files = [];
      let currentFileIndex = 1;
      let currentFileContent = '\ufeff' + headers.join(',') + '\n';
      let totalProcessed = 0;
      
      const saveCurrentFile = async () => {
        if (currentFileContent.split('\n').length > 2) { // Tem conteúdo além do header
          const filename = `${baseFilename}-part-${currentFileIndex}.csv`;
          const filePath = path.join(outputDir, filename);
          
          await fs.writeFile(filePath, currentFileContent, 'utf8');
          
          const fileSizeMB = (Buffer.byteLength(currentFileContent, 'utf8') / (1024 * 1024)).toFixed(2);
          const recordsInFile = (currentFileContent.split('\n').length - 2);
          
          console.log(`✅ Arquivo ${currentFileIndex} salvo: ${filename} (${recordsInFile} registros, ${fileSizeMB}MB)`);
          
          files.push({
            filename: filename,
            filePath: filePath,
            records: recordsInFile,
            sizeMB: parseFloat(fileSizeMB)
          });
          
          currentFileIndex++;
          currentFileContent = '\ufeff' + headers.join(',') + '\n';
        }
      };
      
      for (const record of clRecords) {
        const primaryAddress = addressMap[record.id] || {}; // Usa record.id (CL.id) para buscar no mapa AD.userId
        
        const row = [
          this.sanitizeFieldForCSV(record.email || ''),
          this.sanitizeFieldForCSV(record.document || ''), // CPF -> external_id (como vem da base)
          this.sanitizeFieldForCSV(record.birthDate || ''),
          this.sanitizeFieldForCSV(this.getPhoneNumber(record)),
          this.sanitizeFieldForCSV(primaryAddress.postalCode || ''),
          this.sanitizeFieldForCSV(primaryAddress.state || ''),
          this.sanitizeFieldForCSV(primaryAddress.country || ''),
          this.sanitizeFieldForCSV(primaryAddress.city || ''),
        ];
        
        currentFileContent += row.join(',') + '\n';
        totalProcessed++;
        
        const currentFileSize = Buffer.byteLength(currentFileContent, 'utf8');
        if (currentFileSize >= maxFileSizeBytes) {
          await saveCurrentFile();
        }
        
        if (totalProcessed % 1000 === 0) {
          console.log(`📊 Progresso: ${totalProcessed}/${clRecords.length} registros processados`);
        }
      }
      
      // Salva arquivo final
      await saveCurrentFile();
      
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);
      
      console.log('\n🎉 Extração híbrida concluída com sucesso!');
      console.log(`⏱️ Tempo total: ${duration} segundos`);
      console.log(`📊 Resumo:`);
      console.log(`   - Registros CL processados: ${totalProcessed.toLocaleString()}`);
      console.log(`   - Endereços encontrados: ${Object.keys(addressMap).length.toLocaleString()}`);
      console.log(`   - Arquivos gerados: ${files.length}`);
      
      return {
        success: true,
        timestamp: getBrazilianTimestamp(),
        duration: duration,
        clRecords: totalProcessed,
        csvResult: {
          success: true,
          files: files,
          timestamp: getBrazilianTimestamp(),
          totalRecords: totalProcessed,
          totalRecordsExpected: totalProcessed,
          totalFiles: files.length
        },
        summary: {
          totalRecords: totalProcessed,
          totalFiles: files.length,
          averageFileSize: files.length > 0 ? (files.reduce((sum, file) => sum + file.sizeMB, 0) / files.length).toFixed(2) : '0.00'
        }
      };
      
    } catch (error) {
      console.error('❌ Erro no modo híbrido:', error);
      return {
        success: false,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      };
    }
  }

  /**
   * Testa a funcionalidade de extração de contatos com endereços
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Resultado do teste
   */
  async testContactsExtraction(options = {}) {
    try {
      console.log('🧪 Testando funcionalidade de extração de contatos...');
      
      // Teste 1: Buscar apenas alguns registros da CL
      console.log('\n📄 Teste 1: Buscando primeiros 100 registros da CL...');
      const testRecords = await this.fetchAllCLRecords({
        size: 100,
        maxRequests: 1,
        fields: 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName'
      });
      
      if (!testRecords || testRecords.length === 0) {
        return {
          success: false,
          error: 'Nenhum registro encontrado para teste',
          timestamp: getBrazilianTimestamp()
        };
      }
      
      console.log(`✅ Teste 1: ${testRecords.length} registros encontrados`);
      
      // Teste 2: Gerar CSV com endereços para os registros de teste
      console.log('\n📄 Teste 2: Gerando CSV com endereços...');
      const csvResult = await this.generateCLCSVWithAddressesOptimized(testRecords, {
        maxFileSizeMB: 1, // Arquivo pequeno para teste
        filename: 'test-contacts-extraction'
      });
      
      if (!csvResult.success) {
        return {
          success: false,
          error: 'Erro ao gerar CSV de teste: ' + csvResult.error,
          timestamp: getBrazilianTimestamp()
        };
      }
      
      console.log(`✅ Teste 2: CSV gerado com sucesso`);
      
      // Teste 3: Verificar estrutura dos dados
      console.log('\n📄 Teste 3: Verificando estrutura dos dados...');
      const sampleRecord = testRecords[0];
      const sampleAddress = await this.addressService.fetchAddressesByUserId(sampleRecord.id, {
        fields: 'addressName,userId,id,postalCode,state,country,city,receiverName,reference,geoCoordinate,addressType,addressLabel'
      });
      
      console.log(`✅ Teste 3: Estrutura verificada`);
      console.log(`   - Campos CL: ${Object.keys(sampleRecord).length}`);
      console.log(`   - Endereços para ${sampleRecord.id}: ${sampleAddress.length}`);
      
      return {
        success: true,
        timestamp: getBrazilianTimestamp(),
        testResults: {
          clRecords: testRecords.length,
          csvFiles: csvResult.files.length,
          sampleRecordFields: Object.keys(sampleRecord).length,
          sampleAddresses: sampleAddress.length
        },
        sampleData: {
          clRecord: sampleRecord,
          addresses: sampleAddress
        }
      };
      
    } catch (error) {
      console.error('❌ Erro no teste de extração:', error);
      return {
        success: false,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      };
    }
  }

  /**
   * Gera CSV específico para importação no Emarsys com mapeamento correto das colunas
   * @param {Array} records - Array de registros da CL
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Resultado da operação
   */
  async generateEmarsysContactsCsv(records, options = {}) {
    try {
      console.log('📊 Gerando arquivo CSV específico para importação no Emarsys...');
      
      if (!records || records.length === 0) {
        console.warn('⚠️ Nenhum registro fornecido para gerar CSV');
        return {
          success: false,
          error: 'Nenhum registro fornecido',
          timestamp: getBrazilianTimestamp()
        };
      }

      // Gera nome do arquivo com timestamp de Brasília
      const timestamp = getBrazilianTimestampForFilename();
      const filename = options.filename || `contatos_vtex_emarsys-${timestamp}.csv`;
      
      // Adiciona extensão .csv se não tiver
      if (!filename.endsWith('.csv')) {
        filename += '.csv';
      }

      // Cria o diretório de saída se não existir
      const defaultExports = path.join(__dirname, '..', 'exports');
      let outputDir = process.env.EXPORTS_DIR || defaultExports;
      
      try {
        await fs.mkdir(outputDir, { recursive: true });
        console.log(`📁 Diretório de exports criado/verificado: ${outputDir}`);
      } catch (error) {
        console.error(`❌ Erro ao criar diretório ${outputDir}:`, error.message);
        
      }

      const filePath = path.join(outputDir, filename);

      // Headers específicos para Emarsys (mapeamento correto)
      const headers = [
        'email',
        'firstName',
        'lastName',
        'external_id', // CPF
        'date_of_birth', // Data de nascimento
        'phone', // Telefone
        'zip_code', // CEP
        'state', // Estado
        'country', // País
        'city', // Cidade
      ];
      
      const csvWithBom = '\ufeff' + headers.join(',') + '\n';
      await fs.writeFile(filePath, csvWithBom, 'utf8');
      
      // Processa registros em lotes de 1000 para evitar problemas de memória
      const batchSize = 1000;
      let totalProcessed = 0;
      let csvContent = '';
      
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        console.log(`📝 Processando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(records.length / batchSize)} (${batch.length} registros)...`);
        
        for (const record of batch) {
          // Busca endereços do usuário
          const userAddresses = await this.addressService.fetchAddressesByUserId(record.id);
          const primaryAddress = userAddresses.length > 0 ? userAddresses[0] : {};
          
          // Cria linha com mapeamento correto para Emarsys
          const row = [
            // Campos do cliente (CL) - mapeamento correto
            this.sanitizeField(record.email || '', 100, 'email'),
            this.sanitizeField(record.firstName || record.firstname || '', 50, 'firstName'),
            this.sanitizeField(record.lastName || record.lastname || '', 50, 'lastName'),
            this.sanitizeField(String(record.document || '').replace(/[.\-]/g, '')), // CPF (somente dígitos)
            this.sanitizeField(record.birthDate || '', 20, 'date_of_birth'), // Data de nascimento
            this.sanitizeField(this.getPhoneNumber(record), 20, 'phone'), // Telefone
            // Campos de endereço (AD) - mapeamento correto
            this.sanitizeField(primaryAddress.postalCode || '', 20, 'zip_code'), // CEP
            this.sanitizeField(primaryAddress.state || '', 10, 'state'), // Estado
            this.sanitizeField(primaryAddress.country || 'BRA', 10, 'country'), // País (padrão Brasil)
            this.sanitizeField(primaryAddress.city || '', 50, 'city'), // Cidade
          ];
          
          csvContent += row.join(',') + '\n';
          totalProcessed++;
        }
        
        // A cada 5000 registros, escreve no arquivo e limpa a memória
        if (csvContent.length > 100000) { // Aproximadamente 5000 registros
          await fs.appendFile(filePath, csvContent, 'utf8');
          console.log(`💾 Escrito ${totalProcessed} registros no arquivo...`);
          csvContent = '';
        }
      }
      
      // Escreve o restante dos dados
      if (csvContent.length > 0) {
        await fs.appendFile(filePath, csvContent, 'utf8');
      }

      console.log(`✅ Arquivo CSV para Emarsys gerado: ${filePath}`);
      console.log(`📊 Total de registros processados: ${totalProcessed}`);

      const result = {
        success: true,
        filename: filename,
        filePath: filePath,
        timestamp: getBrazilianTimestamp(),
        totalRecords: totalProcessed,
        totalRecordsExpected: records.length,
        format: 'SAP Emarsys Contacts Import',
        headers: headers,
        documentation: 'https://help.sap.com/docs/SAP_EMARSYS/f8e2fafeea804018a954a8857d9dfff3/fde8076374c11014b351dcadd185eb1f.html?locale=en-US'
      };

      return result;

    } catch (error) {
      console.error('❌ Erro ao gerar CSV para Emarsys:', error);
      return {
        success: false,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      };
    }
  }

  /**
   * Extrai contatos criados ou alterados nas últimas X horas
   * @param {Object} options - Opções de configuração
   * @param {number} options.hours - Número de horas para buscar (padrão: 6)
   * @param {string} options.filename - Nome base do arquivo CSV
   * @param {boolean} options.useScroll - Usar scroll para otimização
   * @param {string} options.startDate - Data inicial em ISO
   * @param {string} options.endDate - Data final em ISO
   * @returns {Promise<Object>} Resultado da extração
   */
  async extractRecentContacts(options = {}) {
    try {
      console.log('🚀 Iniciando extração de contatos recentes...');
      
      const {
        hours = 6,
        filename = 'contatos-recentes',
        useScroll = true,
        startDate,
        endDate
      } = options;
      
      console.log(`📅 Período: ${hours} horas (${startDate} até ${endDate})`);
      
      // Cria o diretório de saída se não existir
      const defaultExports = path.join(__dirname, '..', 'exports');
      let outputDir = process.env.EXPORTS_DIR || defaultExports;
      
      try {
        await fs.mkdir(outputDir, { recursive: true });
        console.log(`📁 Diretório de exports criado/verificado: ${outputDir}`);
      } catch (error) {
        console.error(`❌ Erro ao criar diretório ${outputDir}:`, error.message);
        
      }

      // Gera nome do arquivo com timestamp
      const timestamp = getBrazilianTimestampForFilename();
      const baseFilename = `${filename}-${timestamp}-${hours}h`;
      
      // Headers incluindo campos de endereço (padrão Emarsys) - mesmo da extração full
      const headers = [
        // Campos do cliente (CL) - apenas campos necessários para Emarsys
        'email',
        'firstName',
        'lastName',
        'external_id', // CPF (renomeado)
        'date_of_birth', // Data de nascimento (renomeado)
        'phone', // Telefone
        'zip_code', // CEP (renomeado)
        'state', // Estado
        'country', // País
        'city' // Cidade
      ];
      
      let allContacts = [];
      let totalContacts = 0;
      let totalAddresses = 0;
      let currentFileIndex = 1;
      let currentFileSize = 0;
      const maxFileSizeMB = 50;
      const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;
      
      // Busca contatos da CL usando o mesmo método da extração full (que funciona)
      console.log('📄 Buscando contatos da CL usando scroll (mesmo método da extração full)...');
      
      const clContacts = await this.fetchCLRecordsWithScrollAndDateFilter(startDate, endDate, {
        useScroll,
        fields: 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName,accountId,accountName'
      });
      
      if (!clContacts || clContacts.length === 0) {
        console.log('⚠️ Nenhum contato encontrado no período especificado');
        return {
          success: true,
          message: 'Nenhum contato encontrado no período especificado',
          data: {
            totalContacts: 0,
            totalAddresses: 0,
            filesGenerated: [],
            period: {
              hours,
              startDate,
              endDate
            }
          }
        };
      }
      
      console.log(`✅ ${clContacts.length} contatos encontrados na CL`);
      totalContacts = clContacts.length;
      
      // Busca endereços para os contatos encontrados (mesmo método da extração full)
      console.log('🏠 Buscando endereços para os contatos...');
      
      // Função para buscar endereço de um usuário específico (mesma da extração full)
      const getUserAddress = async (record) => {
        try {
          const userId = record.id; // id da CL (chave primária)
          
          // Busca individual na AD pelo userId (mesmo método da extração full)
          const userAddresses = await this.addressService.fetchAddressesByUserId(userId);
          return userAddresses.length > 0 ? userAddresses[0] : {};
        } catch (error) {
          console.warn(`⚠️ Erro ao buscar endereço para userId ${record.id}:`, error.message);
          return {};
        }
      };
      
      // Busca endereços para cada contato (mesmo método da extração full)
      let addressMap = {};
      for (const contact of clContacts) {
        if (contact.id) {
          const address = await getUserAddress(contact);
          if (address && Object.keys(address).length > 0) {
            addressMap[contact.id] = address;
          }
        }
      }
      
      totalAddresses = Object.keys(addressMap).length;
      console.log(`✅ ${totalAddresses} endereços encontrados`);
      
      // Processa contatos e gera CSV (mesmo método da extração full)
      console.log('📝 Processando contatos e gerando CSV...');
      
      // Inicializa o primeiro arquivo com BOM (mesmo da extração full)
      let currentCsvContent = '\ufeff' + headers.join(',') + '\n';
      const generatedFiles = [];
      
      for (let i = 0; i < clContacts.length; i++) {
        const contact = clContacts[i];
        const address = addressMap[contact.id] || {}; // Usa contact.id como chave
        
        // Cria linha com todos os campos (mesmo método da extração full)
        const row = [
          // Campos do cliente (CL) - apenas campos necessários para Emarsys
          this.sanitizeFieldForCSV(contact.email || ''),
          this.sanitizeFieldForCSV(contact.firstName || contact.firstname || ''),
          this.sanitizeFieldForCSV(contact.lastName || contact.lastname || ''),
          this.sanitizeFieldForCSV(contact.document || ''), // CPF -> external_id (como vem da base)
          this.sanitizeFieldForCSV(contact.birthDate || ''), // Data de nascimento -> date_of_birth
          this.sanitizeFieldForCSV(this.getPhoneNumber(contact)), // Telefone
          // Campos de endereço (AD) - apenas campos necessários para Emarsys
          this.sanitizeFieldForCSV(address.postalCode || ''), // CEP -> zip_code
          this.sanitizeFieldForCSV(address.state || ''), // Estado
          this.sanitizeFieldForCSV(address.country || 'BRA'), // País (padrão BRA)
          this.sanitizeFieldForCSV(address.city || '') // Cidade
        ];
        
        const rowContent = row.join(',') + '\n';
        currentCsvContent += rowContent;
        currentFileSize += rowContent.length;
        
        // Verifica se precisa criar novo arquivo
        if (currentFileSize >= maxFileSizeBytes && i < clContacts.length - 1) {
          const currentFilename = `${baseFilename}-parte-${currentFileIndex}.csv`;
          const currentFilePath = path.join(outputDir, currentFilename);
          
          await fs.writeFile(currentFilePath, currentCsvContent, 'utf8');
          generatedFiles.push({
            filename: currentFilename,
            path: currentFilePath,
            size: currentFileSize,
            sizeFormatted: `${(currentFileSize / 1024 / 1024).toFixed(2)} MB`,
            contactsCount: i + 1
          });
          
          console.log(`📄 Arquivo ${currentFilename} gerado: ${(currentFileSize / 1024 / 1024).toFixed(2)} MB`);
          
          // Reinicia para próximo arquivo (mesmo da extração full)
          currentCsvContent = '\ufeff' + headers.join(',') + '\n';
          currentFileSize = 0;
          currentFileIndex++;
        }
      }
      
      // Salva o último arquivo (ou único arquivo)
      const finalFilename = currentFileIndex === 1 ? `${baseFilename}.csv` : `${baseFilename}-parte-${currentFileIndex}.csv`;
      const finalFilePath = path.join(outputDir, finalFilename);
      
      await fs.writeFile(finalFilePath, currentCsvContent, 'utf8');
      generatedFiles.push({
        filename: finalFilename,
        path: finalFilePath,
        size: currentFileSize,
        sizeFormatted: `${(currentFileSize / 1024 / 1024).toFixed(2)} MB`,
        contactsCount: clContacts.length
      });
      
      console.log(`📄 Arquivo final ${finalFilename} gerado: ${(currentFileSize / 1024 / 1024).toFixed(2)} MB`);
      
      const endTime = Date.now();
      const duration = Math.round((endTime - Date.now()) / 1000);
      
      console.log('🎉 Extração de contatos recentes concluída!');
      console.log(`📊 Resumo: ${totalContacts} contatos, ${totalAddresses} endereços, ${generatedFiles.length} arquivo(s)`);
      
      // Envio automático via WebDAV após extração
      let webdavResult = null;
      if (generatedFiles.length > 0) {
        try {
          console.log('📤 Iniciando envio automático via WebDAV...');
          const emarsysContactsService = require('./emarsysContactsService');
          webdavResult = await emarsysContactsService.sendContactsCsvToEmarsys();
          
          if (webdavResult.success) {
            console.log('✅ Arquivo enviado com sucesso via WebDAV');
          } else {
            console.log('⚠️ Erro no envio via WebDAV:', webdavResult.error);
          }
        } catch (webdavError) {
          console.error('❌ Erro no envio automático via WebDAV:', webdavError.message);
          webdavResult = {
            success: false,
            error: webdavError.message
          };
        }
      }
      
      return {
        success: true,
        message: `Extração de contatos recentes (${hours}h) concluída com sucesso`,
        data: {
          totalContacts,
          totalAddresses,
          filesGenerated: generatedFiles,
          period: {
            hours,
            startDate,
            endDate
          },
          duration: `${duration}s`,
          useScroll,
          webdavSend: webdavResult
        }
      };
      
    } catch (error) {
      console.error('❌ Erro na extração de contatos recentes:', error);
      return {
        success: false,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      };
    }
  }

  /**
   * Busca registros da CL usando scroll (que funciona) e filtra por data após buscar
   * @param {string} startDate - Data inicial em ISO
   * @param {string} endDate - Data final em ISO
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Array>} Array com registros da CL filtrados por data
   */
  async fetchCLRecordsWithScrollAndDateFilter(startDate, endDate, options = {}) {
    try {
      console.log(`🔍 Buscando registros da CL usando scroll e filtrando por data...`);
      console.log(`📅 Período: ${startDate} até ${endDate}`);
      
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      
      // Busca todos os registros usando scroll (mesmo método da extração full)
      console.log('📄 Buscando registros da CL usando scroll (mesmo método da extração full)...');
      
      const allRecords = [];
      const pageSize = 1000;
      let currentToken = '';
      let hasMoreRecords = true;
      let requestCount = 0;
      const maxRequests = 100; // Limite para evitar loop infinito
      
      // Primeira requisição sem token
      console.log('🔄 Busca inicial (sem token)...');
      const initialResponse = await this.fetchCLWithVTEXScroll('', pageSize, {
        fields: options.fields || 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName,accountId,accountName'
      });
      
      if (initialResponse && initialResponse.data && Array.isArray(initialResponse.data)) {
        allRecords.push(...initialResponse.data);
        currentToken = initialResponse.headers?.['x-vtex-page-token'] || '';
        requestCount++;
        
        console.log(`📄 Página ${requestCount}: ${initialResponse.data.length} registros (Total: ${allRecords.length})`);
        
        // Continua buscando enquanto há mais registros
        while (hasMoreRecords && currentToken && requestCount < maxRequests) {
          requestCount++;
          
          const response = await this.fetchCLWithVTEXScroll(currentToken, pageSize, {
            fields: options.fields || 'email,id,createdIn,updatedIn,document,birthDate,phone,homePhone,firstName,lastName,accountId,accountName'
          });
          
          if (response && response.data && Array.isArray(response.data)) {
            allRecords.push(...response.data);
            currentToken = response.headers?.['x-vtex-page-token'] || '';
            
            console.log(`📄 Página ${requestCount}: ${response.data.length} registros (Total: ${allRecords.length})`);
            
            // Se não há mais registros ou token, para
            if (response.data.length === 0 || !currentToken) {
              hasMoreRecords = false;
            }
          } else {
            hasMoreRecords = false;
          }
          
          // Pausa entre requisições para evitar rate limit
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      console.log(`📊 Total de registros buscados via scroll: ${allRecords.length}`);
      
      // Agora filtra os registros por data
      console.log('🔍 Filtrando registros por data...');
      
      const filteredRecords = allRecords.filter(record => {
        const createdIn = new Date(record.createdIn);
        const updatedIn = new Date(record.updatedIn);
        
        // Verifica se foi criado ou atualizado no período
        const isInPeriod = (createdIn >= startDateObj && createdIn <= endDateObj) ||
                          (updatedIn >= startDateObj && updatedIn <= endDateObj);
        
        return isInPeriod;
      });
      
      console.log(`✅ Registros filtrados por data: ${filteredRecords.length} de ${allRecords.length}`);
      
      // Log de alguns exemplos para debug
      if (filteredRecords.length > 0) {
        console.log('📋 Exemplos de registros encontrados:');
        filteredRecords.slice(0, 3).forEach((record, index) => {
          console.log(`   ${index + 1}. ${record.email} - Criado: ${record.createdIn}, Atualizado: ${record.updatedIn}`);
        });
      }
      
      return filteredRecords;
      
    } catch (error) {
      console.error('❌ Erro ao buscar registros da CL com scroll e filtro de data:', error);
      throw error;
    }
  }
}

module.exports = ContactService;