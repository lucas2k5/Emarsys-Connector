const axios = require('axios');
const { getBrazilianTimestamp } = require('../utils/dateUtils');
require('dotenv').config();

class AddressService {
  constructor() {
    const baseUrl = process.env.VTEX_BASE_URL;
    // Remove trailing slash to avoid double slashes in URLs
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Busca endereços de um usuário específico na entidade AD
   * @param {string} userId - ID do usuário
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Array>} Array com endereços do usuário
   */
  async fetchAddressesByUserId(userId, options = {}) {
    try {
      if (!userId) {
        console.log('⚠️ userId não fornecido, retornando array vazio');
        return [];
      }

      const url = `${this.baseUrl}/api/dataentities/AD/search`;
      
      const params = {
        _where: `userId=${userId}`,
        _fields: options.fields || 'addressName,userId,id,accountId,accountName,dataEntityId,postalCode,state,country,city,street,neighborhood,number,complement,receiverName,reference,geoCoordinate,addressType,addressLabel',
        _sort: options.sort || 'addressName ASC'
      };

      console.log(`🔍 Buscando endereços para userId: ${userId}`);

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
        timeout: options.timeout || 30000
      });

      const addresses = response.data || [];
      console.log(`✅ Encontrados ${addresses.length} endereços para userId: ${userId}`);

      return addresses;

    } catch (error) {
      console.error(`❌ Erro ao buscar endereços para userId ${userId}:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      // Retorna array vazio em caso de erro para não interromper o processo
      return [];
    }
  }

  /**
   * Realiza busca na entidade AD usando /search com scroll/scrollId
   * Compatível com a orientação VTEX (primeira chamada com scroll=true, próximas com scrollId)
   * @param {Object} options
   * @param {string} [options.scrollId] - scrollId retornado anteriormente
   * @param {number} [options.size=1000] - tamanho do lote
   * @param {string} [options.fields] - lista de campos (_fields)
   * @param {string} [options.where] - filtro (_where)
   * @param {number} [options.timeout=30000]
   * @returns {Promise<Object>} resposta da API
   */
  async fetchAddressesWithSearchScroll(options = {}) {
    const size = options.size || 1000;
    const scrollId = options.scrollId || '';
    const url = `${this.baseUrl}/api/dataentities/AD/search`;

    const params = {
      _fields: options.fields || 'userId,postalCode,state,country,city,street,neighborhood,number,complement',
      _size: size
    };

    if (options.where) {
      params._where = options.where;
    }

    // Primeira página usa scroll=true; as próximas usam scrollId
    if (scrollId) {
      params.scrollId = scrollId;
    } else {
      params.scroll = true;
    }

    const response = await axios({
      method: 'GET',
      url,
      params,
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

    return response;
  }

  /**
   * Varre todos os endereços usando /search com scroll, opcionalmente com filtro _where
   * @param {Object} options
   * @param {number} [options.size=1000]
   * @param {string} [options.fields]
   * @param {string} [options.where]
   * @param {number} [options.maxRequests=10000]
   * @returns {Promise<{addresses: Array, pages: number}>}
   */
  async fetchAllAddressesViaSearchScroll(options = {}) {
    const size = options.size || 1000;
    const maxRequests = options.maxRequests || 10000;

    console.log('🚀 Iniciando scroll via /search na entidade AD...');

    let pages = 0;
    let total = 0;
    const all = [];
    let scrollId = '';
    let hasMore = true;

    // Primeira chamada com scroll=true
    let resp = await this.fetchAddressesWithSearchScroll({
      size,
      fields: options.fields,
      where: options.where,
      timeout: options.timeout
    });

    const extractScrollId = (r) => r?.data?.scrollId || r?.headers?.['x-vtex-page-token'] || r?.headers?.['x-vtex-md-token'] || '';

    while (hasMore && pages < maxRequests) {
      pages++;
      const data = Array.isArray(resp.data) ? resp.data : (resp.data?.data || []);
      const batchLen = data.length;
      if (batchLen === 0) {
        console.log(`📄 Página ${pages}: vazia, encerrando.`);
        break;
      }

      all.push(...data);
      total += batchLen;
      console.log(`✅ Página ${pages}: ${batchLen} registros (Total: ${total})`);

      scrollId = extractScrollId(resp);
      if (!scrollId) {
        console.log('📄 Nenhum scrollId retornado, encerrando.');
        break;
      }

      // Próxima página com scrollId
      resp = await this.fetchAddressesWithSearchScroll({
        size,
        fields: options.fields,
        where: options.where,
        scrollId,
        timeout: options.timeout
      });
    }

    console.log(`🎉 Scroll AD via /search concluído: ${total} endereços em ${pages} páginas`);
    return { addresses: all, pages };
  }

  /**
   * Busca endereços de uma conta específica na entidade AD
   * @param {string} accountId - ID da conta
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Array>} Array com endereços da conta
   */
  async fetchAddressesByAccountId(accountId, options = {}) {
    try {
      if (!accountId) {
        console.log('⚠️ accountId não fornecido, retornando array vazio');
        return [];
      }

      const url = `${this.baseUrl}/api/dataentities/AD/search`;
      
      const params = {
        _where: `accountId=${accountId}`,
        _fields: options.fields || 'addressName,userId,id,accountId,accountName,dataEntityId,postalCode,state,country,city,street,neighborhood,number,complement,receiverName,reference,geoCoordinate,addressType,addressLabel',
        _sort: options.sort || 'addressName ASC'
      };

      console.log(`🔍 Buscando endereços para accountId: ${accountId}`);

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
        timeout: options.timeout || 30000
      });

      const addresses = response.data || [];
      console.log(`✅ Encontrados ${addresses.length} endereços para accountId: ${accountId}`);

      return addresses;

    } catch (error) {
      console.error(`❌ Erro ao buscar endereços para accountId ${accountId}:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      // Retorna array vazio em caso de erro para não interromper o processo
      return [];
    }
  }

  /**
   * Busca endereços para múltiplos usuários em lote
   * @param {Array} userIds - Array de IDs de usuários
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Mapa de userId -> endereços
   */
  async fetchAddressesForMultipleUsers(userIds, options = {}) {
    try {
      console.log(`🚀 Iniciando busca de endereços para ${userIds.length} usuários...`);
      
      const addressMap = {};
      const batchSize = options.batchSize || 10; // Processa em lotes para não sobrecarregar
      const delay = options.delay || 100; // Pausa entre lotes
      
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        console.log(`📄 Processando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(userIds.length / batchSize)} (${batch.length} usuários)...`);
        
        // Processa o lote em paralelo
        const batchPromises = batch.map(async (userId) => {
          const addresses = await this.fetchAddressesByUserId(userId, options);
          return { userId, addresses };
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Adiciona ao mapa
        batchResults.forEach(({ userId, addresses }) => {
          addressMap[userId] = addresses;
        });
        
        // Pausa entre lotes
        if (i + batchSize < userIds.length) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      console.log(`✅ Busca de endereços concluída! Processados ${userIds.length} usuários`);
      
      return addressMap;
      
    } catch (error) {
      console.error('❌ Erro ao buscar endereços para múltiplos usuários:', error);
      throw error;
    }
  }

  /**
   * Busca todos os endereços da entidade AD (para análise/debug)
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Array>} Array com todos os endereços
   */
  async fetchAllAddresses(options = {}) {
    try {
      console.log('🚀 Iniciando busca de todos os endereços da entidade AD...');
      
      const allAddresses = [];
      const pageSize = options.size || 1000;
      let currentToken = '';
      let hasMoreRecords = true;
      let requestCount = 0;
      const maxRequests = options.maxRequests || 1000;
      const userLimit = options.userLimit; // Suporte ao limite de endereços
      
      if (userLimit) {
        console.log(`📊 Limite de endereços definido: ${userLimit} registros`);
      }
      
      // Primeira requisição
      console.log('🔄 Busca inicial...');
      const initialResponse = await this.fetchAddressesWithScroll('', pageSize, {
        ...options,
        maxRetries: 5,
        baseDelay: 3000
      });
      
      if (initialResponse && initialResponse.data && Array.isArray(initialResponse.data)) {
        // Adiciona endereços respeitando o limite
        const recordsToAdd = userLimit ? initialResponse.data.slice(0, userLimit) : initialResponse.data;
        allAddresses.push(...recordsToAdd);
        console.log(`✅ Página 1: ${recordsToAdd.length} endereços adicionados`);
        
        // Verifica se já atingiu o limite na primeira página
        if (userLimit && allAddresses.length >= userLimit) {
          console.log(`📊 Limite de endereços atingido na primeira página: ${userLimit} registros`);
          return allAddresses;
        }
        
        currentToken = initialResponse.headers?.['x-vtex-page-token'] || initialResponse.headers?.['x-vtex-md-token'] || '';
        console.log(`📄 Token inicial obtido: ${currentToken ? 'presente' : 'ausente'}`);
        if (currentToken) {
          console.log(`📄 Token preview: ${currentToken.substring(0, 50)}...`);
        }
        
        // Continua enquanto houver token e não atingiu o limite
        while (hasMoreRecords && currentToken && requestCount < maxRequests && (!userLimit || allAddresses.length < userLimit)) {
          requestCount++;
          console.log(`📄 Buscando página ${requestCount + 1} com token...`);
          
          try {
            const response = await this.fetchAddressesWithScroll(currentToken, pageSize, {
              ...options,
              maxRetries: 5,
              baseDelay: 3000
            });
            
            if (response && response.data && Array.isArray(response.data)) {
              if (response.data.length > 0) {
                // Adiciona endereços respeitando o limite
                const recordsToAdd = userLimit ? response.data.slice(0, userLimit - allAddresses.length) : response.data;
                allAddresses.push(...recordsToAdd);
                console.log(`✅ Página ${requestCount + 1}: ${recordsToAdd.length} endereços adicionados (Total: ${allAddresses.length})`);
                
                // Verifica se atingiu o limite
                if (userLimit && allAddresses.length >= userLimit) {
                  console.log(`📊 Limite de endereços atingido: ${userLimit} registros`);
                  hasMoreRecords = false;
                  break;
                }
                
                currentToken = response.headers?.['x-vtex-page-token'] || response.headers?.['x-vtex-md-token'] || '';
                
                if (!currentToken) {
                  console.log('📄 Nenhum token retornado, finalizando busca');
                  hasMoreRecords = false;
                }
              } else {
                console.log('📄 Nenhum endereço retornado, finalizando busca');
                hasMoreRecords = false;
              }
            } else {
              console.log('📄 Resposta vazia ou inválida, finalizando busca');
              hasMoreRecords = false;
            }
            
            // Pausa entre requisições (aumentada para evitar rate limiting)
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error) {
            console.error(`❌ Erro ao buscar página ${requestCount + 1}:`, error.message);
            hasMoreRecords = false;
          }
        }
        
        console.log(`🎉 Busca de endereços concluída! Total de ${allAddresses.length} endereços encontrados`);
        return allAddresses;
        
      } else {
        console.log('⚠️ Resposta inicial inválida');
        return [];
      }
      
    } catch (error) {
      console.error('❌ Erro ao buscar todos os endereços:', error);
      throw error;
    }
  }

  /**
   * Helper para buscar endereços usando scroll
   * @param {string} token - Token de paginação
   * @param {number} size - Tamanho da página
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Resposta da API
   */
    async fetchAddressesWithScroll(token = '', size = 1000, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const baseDelay = options.baseDelay || 2000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const url = `${this.baseUrl}/api/dataentities/AD/scroll`;
        
        const params = {
          _size: size,
          _fields: options.fields || 'addressName,userId,id,accountId,accountName,dataEntityId,postalCode,state,country,city,street,neighborhood,number,complement,receiverName,reference,geoCoordinate,addressType,addressLabel',
          _sort: options.sort || 'userId ASC'
        };
        
        // Suporte a filtros
        if (options.where) {
          params._where = options.where;
        }

        if (token) {
          params._token = token;
        }
        
        console.log(`🔗 Requisição de scroll AD (tentativa ${attempt}/${maxRetries}): ${url}`, {
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
          timeout: options.timeout || 30000
        });
        
        console.log(`📊 Resposta da API de scroll AD:`, {
          status: response.status,
          dataLength: response.data ? response.data.length : 0,
          hasNextToken: !!(response.headers?.['x-vtex-page-token'] || response.headers?.['x-vtex-md-token'])
        });
        
        return response;
        
      } catch (error) {
        console.error(`❌ Erro na requisição de scroll dos endereços (tentativa ${attempt}/${maxRetries}):`, {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data
        });
        
        // Se é o último retry, lança o erro
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Se é erro de rate limiting (400 com mensagem específica), faz retry com backoff exponencial
        if (error.response?.status === 400 && error.response?.data?.Message?.includes('Maximum simultaneous scrolls')) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.log(`⏳ Rate limiting detectado. Aguardando ${delay}ms antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Para outros erros, não faz retry
          throw error;
        }
      }
    }
  }

  /**
   * Busca endereços da AD via scroll filtrando por uma lista de userIds
   * Retorna um mapa userId -> endereço (primeiro encontrado)
   * @param {string[]} userIds
   * @param {Object} options
   * @returns {Promise<Object>} addressMap
   */
  async fetchAddressesByUserIdsViaScroll(userIds = [], options = {}) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return {};
    }
    
    const size = options.size || 1000;
    const fields = options.fields || 'userId,postalCode,state,country,city,street,neighborhood,number,complement,accountId';
    const maxBatch = options.maxBatch || 100; // Aumentado para maior eficiência
    const addressMap = {};

    console.log(`🚀 Buscando endereços para ${userIds.length} userIds em lotes de ${maxBatch}...`);

    const chunks = [];
    for (let i = 0; i < userIds.length; i += maxBatch) {
      chunks.push(userIds.slice(i, i + maxBatch));
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      console.log(`📄 Processando lote ${chunkIndex + 1}/${chunks.length} (${chunk.length} userIds)...`);
      
      const inList = chunk.map(id => `${id}`).join(',');
      const where = `userId=in=(${inList})`;

      // Scroll filtrado por este chunk
      let token = '';
      let hasMore = true;
      let guard = 0;
      let pageCount = 0;
      
      while (hasMore && guard < 100) {
        guard++;
        pageCount++;
        
        try {
          const resp = await this.fetchAddressesWithScroll(token, size, { where, fields });
          const data = Array.isArray(resp.data) ? resp.data : [];
          
          let foundInThisPage = 0;
          for (const addr of data) {
            if (addr && addr.userId && !addressMap[addr.userId]) {
              addressMap[addr.userId] = addr;
              foundInThisPage++;
            }
          }
          
          if (pageCount === 1) {
            console.log(`   ✅ Página ${pageCount}: ${foundInThisPage} endereços encontrados para o lote`);
          }
          
          const next = resp.headers?.['x-vtex-md-token'] || resp.headers?.['x-vtex-page-token'] || '';
          if (!next || data.length === 0) {
            hasMore = false;
          }
          token = next;
          
          // Pausa entre requests para evitar rate limit
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`❌ Erro ao buscar endereços para lote ${chunkIndex + 1}:`, error.message);
          hasMore = false;
        }
      }
    }

    console.log(`✅ Busca de endereços concluída: ${Object.keys(addressMap).length} endereços encontrados`);
    return addressMap;
  }

  /**
   * Busca endereços para múltiplos userIds usando busca em lote otimizada
   * @param {string[]} userIds - Array de IDs de usuários
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Mapa de userId -> endereço
   */
  async fetchAddressesByUserIdsInBatch(userIds = [], options = {}) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return {};
    }

    const size = options.size || 1000;
    const fields = options.fields || 'userId,accountId,postalCode,state,country,city,street,neighborhood,number,complement';
    const maxBatch = options.maxBatch || 100;
    const addressMap = {};

    console.log(`🚀 Buscando endereços para ${userIds.length} userIds em lotes de ${maxBatch}...`);

    const chunks = [];
    for (let i = 0; i < userIds.length; i += maxBatch) {
      chunks.push(userIds.slice(i, i + maxBatch));
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      console.log(`📄 Processando lote ${chunkIndex + 1}/${chunks.length} (${chunk.length} userIds)...`);
      
      // Filtra apenas userIds válidos (não vazios)
      const validUserIds = chunk.filter(id => id && id.trim() !== '');
      if (validUserIds.length === 0) {
        console.log(`   ⚠️ Lote ${chunkIndex + 1} não contém userIds válidos, pulando...`);
        continue;
      }
      
      const inList = validUserIds.map(id => `${id}`).join(',');
      const where = `userId=in=(${inList})`;

      try {
        // Busca direta com filtro (mais eficiente que scroll para lotes pequenos)
        const url = `${this.baseUrl}/api/dataentities/AD/search`;
        
        const response = await axios({
          method: 'GET',
          url: url,
          params: {
            _where: where,
            _fields: fields,
            _size: size
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

        const addresses = response.data || [];
        let foundInThisLote = 0;
        
        addresses.forEach(addr => {
          if (addr && addr.userId && !addressMap[addr.userId]) {
            addressMap[addr.userId] = addr;
            foundInThisLote++;
          }
        });
        
        console.log(`   ✅ Lote ${chunkIndex + 1}: ${foundInThisLote} endereços encontrados`);
        
        // Pausa entre lotes para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`❌ Erro ao buscar endereços para lote ${chunkIndex + 1}:`, error.message);
      }
    }

    console.log(`✅ Busca de endereços por userId concluída: ${Object.keys(addressMap).length} endereços encontrados`);
    return addressMap;
  }

  /**
   * Busca endereços para múltiplos accountIds usando busca em lote otimizada
   * @param {string[]} accountIds - Array de IDs de contas
   * @param {Object} options - Opções de configuração
   * @returns {Promise<Object>} Mapa de accountId -> endereço
   */
  async fetchAddressesByAccountIdsInBatch(accountIds = [], options = {}) {
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return {};
    }

    const size = options.size || 1000;
    const fields = options.fields || 'userId,accountId,postalCode,state,country,city,street,neighborhood,number,complement';
    const maxBatch = options.maxBatch || 100;
    const addressMap = {};

    console.log(`🚀 Buscando endereços para ${accountIds.length} accountIds em lotes de ${maxBatch}...`);

    const chunks = [];
    for (let i = 0; i < accountIds.length; i += maxBatch) {
      chunks.push(accountIds.slice(i, i + maxBatch));
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      console.log(`📄 Processando lote ${chunkIndex + 1}/${chunks.length} (${chunk.length} accountIds)...`);
      
      // Filtra apenas accountIds válidos (não vazios)
      const validAccountIds = chunk.filter(id => id && id.trim() !== '');
      if (validAccountIds.length === 0) {
        console.log(`   ⚠️ Lote ${chunkIndex + 1} não contém accountIds válidos, pulando...`);
        continue;
      }
      
      const inList = validAccountIds.map(id => `${id}`).join(',');
      const where = `accountId=in=(${inList})`;

      try {
        // Busca direta com filtro (mais eficiente que scroll para lotes pequenos)
        const url = `${this.baseUrl}/api/dataentities/AD/search`;
        
        const response = await axios({
          method: 'GET',
          url: url,
          params: {
            _where: where,
            _fields: fields,
            _size: size
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

        const addresses = response.data || [];
        let foundInThisLote = 0;
        
        addresses.forEach(addr => {
          if (addr && addr.accountId && !addressMap[addr.accountId]) {
            addressMap[addr.accountId] = addr;
            foundInThisLote++;
          }
        });
        
        console.log(`   ✅ Lote ${chunkIndex + 1}: ${foundInThisLote} endereços encontrados`);
        
        // Pausa entre lotes para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`❌ Erro ao buscar endereços para lote ${chunkIndex + 1}:`, error.message);
      }
    }

    console.log(`✅ Busca de endereços por accountId concluída: ${Object.keys(addressMap).length} endereços encontrados`);
    return addressMap;
  }

  /**
   * Testa a API de endereços para verificar campos disponíveis
   * @returns {Promise<Object>} Resultado do teste
   */
  async testAddressAPI() {
    try {
      console.log('🧪 Testando API de endereços...');
      
      const url = `${this.baseUrl}/api/dataentities/AD/search`;
      
      // Primeiro, vamos buscar SEM especificar campos para ver todos os campos disponíveis
      console.log('📄 Teste 1: Buscando TODOS os campos disponíveis...');
      const response1 = await axios({
        method: 'GET',
        url: url,
        params: {
          _size: 5,
          _sort: 'userId ASC'
        },
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
        },
        timeout: 30000
      });
      
      const addresses1 = response1.data || [];
      
      console.log('✅ Resposta 1 - Todos os campos:', {
        status: response1.status,
        dataLength: addresses1.length,
        contentRange: response1.headers?.['rest-content-range'],
        fields: addresses1.length > 0 ? Object.keys(addresses1[0]) : []
      });
      
      if (addresses1.length > 0) {
        console.log('📋 Campos disponíveis no primeiro registro:', Object.keys(addresses1[0]));
        console.log('📋 Exemplo de registro completo:', JSON.stringify(addresses1[0], null, 2));
      }
      
      // Agora vamos buscar com campos específicos de endereço
      console.log('📄 Teste 2: Buscando com campos específicos de endereço...');
      const response2 = await axios({
        method: 'GET',
        url: url,
        params: {
          _size: 5,
          _fields: 'addressName,userId,id,accountId,accountName,dataEntityId,postalCode,state,country,city,street,neighborhood,number,complement,receiverName,reference,geoCoordinate,addressType,addressLabel',
          _sort: 'userId ASC'
        },
        headers: {
          'Accept': 'application/vnd.vtex.ds.v10+json',
          'Content-Type': 'application/json',
          'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
          'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN
        },
        timeout: 30000
      });
      
      const addresses2 = response2.data || [];
      
      console.log('✅ Resposta 2 - Campos específicos:', {
        status: response2.status,
        dataLength: addresses2.length,
        contentRange: response2.headers?.['rest-content-range'],
        fields: addresses2.length > 0 ? Object.keys(addresses2[0]) : []
      });
      
      if (addresses2.length > 0) {
        console.log('📋 Campos retornados com query específica:', Object.keys(addresses2[0]));
        console.log('📋 Exemplo de registro com campos específicos:', JSON.stringify(addresses2[0], null, 2));
      }
      
      return {
        success: true,
        test1: {
          status: response1.status,
          dataLength: addresses1.length,
          contentRange: response1.headers?.['rest-content-range'],
          fields: addresses1.length > 0 ? Object.keys(addresses1[0]) : [],
          sampleRecord: addresses1.length > 0 ? addresses1[0] : null
        },
        test2: {
          status: response2.status,
          dataLength: addresses2.length,
          contentRange: response2.headers?.['rest-content-range'],
          fields: addresses2.length > 0 ? Object.keys(addresses2[0]) : [],
          sampleRecord: addresses2.length > 0 ? addresses2[0] : null
        }
      };
      
    } catch (error) {
      console.error('❌ Erro no teste da API de endereços:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Sanitiza campo de endereço para CSV
   * @param {*} value - Valor a ser sanitizado
   * @param {number} maxLength - Comprimento máximo
   * @returns {string} Valor sanitizado
   */
  sanitizeField(value, maxLength = 100) {
    if (value === null || value === undefined) return '';
    
    let cleanValue = String(value)
      .replace(/"/g, '')           // Remove aspas duplas
      .replace(/,/g, ' ')          // Substitui vírgulas por espaços
      .replace(/\r?\n/g, ' ')      // Remove quebras de linha
      .trim();                     // Remove espaços extras
    
    if (cleanValue.length > maxLength) {
      cleanValue = cleanValue.substring(0, maxLength);
    }
    
    return cleanValue;
  }
}

module.exports = AddressService;