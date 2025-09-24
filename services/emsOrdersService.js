const axios = require('axios');
const path = require('path');

class EmsOrdersService {
  constructor() {
    this.vtexBaseUrl = process.env.VTEX_BASE_URL;
    this.entity = 'emsOrdersV2';
    this.exportsDir = path.join(__dirname, '..', 'exports');
  }

  getVtexHeaders() {
    return {
      'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
      'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
      'Content-Type': 'application/json'
    };
  }


  /**
   * [DEPRECATED] Os registros já existem na base, não precisa inserir novos
   * Este método agora apenas retorna sucesso pois os pedidos já estão na base
   * @param {Array} orders - Array de pedidos (não usado mais)
   * @returns {Object} Resultado da operação
   */
  async upsertEmsOrdersV2(orders) {
    console.log('ℹ️ [INFO] Registros já existem na base - não é necessário inserir novos pedidos');
    console.log(`ℹ️ [INFO] ${orders ? orders.length : 0} pedidos recebidos para processamento`);
    
    // Simula sucesso pois os registros já existem
    const orderIds = orders ? orders.map(order => order.order || order.orderId).filter(Boolean) : [];
    
    return { 
      success: true, 
      message: 'Registros já existem na base - apenas controle de isSync será feito',
      upserts: orderIds,
      skipped: true
    };
  }

  /**
   * Lista pedidos pendentes de sincronização (isSync=false)
   * @returns {Array} Array de pedidos pendentes
   */
  async listEmsOrdersV2PendingSync() {
    try {
      const url = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/search`;
      const allResults = [];
      
      // Busca 1: isSync=false (sem OR para evitar problemas do Master Data V2)
      const params1 = {
        _where: 'isSync=false',
        _fields: 'id,order,item,quantity,timestamp,price,customer_email,isSync',
        _size: 1000,
        _sort: 'timestamp ASC'
      };
      
      console.log('🔍 Buscando pedidos pendentes via data entities (isSync=false)...');
      try {
        const response1 = await axios.get(url, { 
          params: params1, 
          headers: this.getVtexHeaders(), 
          timeout: 60000 
        });
        
        if (Array.isArray(response1.data)) {
          console.log(`✅ ${response1.data.length} pedidos pendentes encontrados (isSync=false)`);
          allResults.push(...response1.data);
        }
      } catch (error1) {
        console.warn('⚠️ Erro na busca 1 (isSync=false):', error1.message);
      }

      // Busca 2: isSync=null (busca separada para evitar problemas do Master Data V2)
      const params2 = {
        _where: 'isSync=null',
        _fields: 'id,order,item,quantity,timestamp,price,customer_email,isSync',
        _size: 1000,
        _sort: 'timestamp ASC'
      };
      
      console.log('🔍 Buscando pedidos pendentes via data entities (isSync=null)...');
      try {
        const response2 = await axios.get(url, { 
          params: params2, 
          headers: this.getVtexHeaders(), 
          timeout: 60000 
        });
        
        if (Array.isArray(response2.data)) {
          console.log(`✅ ${response2.data.length} pedidos pendentes encontrados (isSync=null)`);
          allResults.push(...response2.data);
        }
      } catch (error2) {
        console.warn('⚠️ Erro na busca 2 (isSync=null):', error2.message);
      }
      
      console.log(`✅ Total de ${allResults.length} pedidos pendentes encontrados via data entities`);
      return allResults;
      
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos pendentes via data entities:', error.message);
      return [];
    }
  }

  /**
   * Verifica se um registro já existe na emsOrdersV2 com filtros específicos
   * @param {string} order - ID do pedido
   * @param {string} item - ID do item
   * @param {string} status - Status do pedido (opcional)
   * @returns {Promise<Object|null>} Registro existente ou null
   */
  async checkExistingRecord(order, item, status = null) {
    try {
      const searchUrl = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/search`;
      
      // Busca 1: isSync=false (sem OR para evitar problemas do Master Data V2)
      let whereClause1 = `order="${order}" AND item="${item}" AND isSync=false`;
      if (status) {
        whereClause1 += ` AND order_status="${status}"`;
      }
      
      const params1 = {
        _where: whereClause1,
        _fields: 'id,order,item,isSync,order_status',
        _size: 100
      };

      console.log(`🔍 Verificando se registro existe: order=${order} + item=${item} + status=${status} + isSync=false...`);
      console.log(`🔍 WHERE clause 1: ${whereClause1}`);

      try {
        const searchRes1 = await axios.get(searchUrl, {
          params: params1,
          headers: this.getVtexHeaders(),
          timeout: 30000
        });

        if (Array.isArray(searchRes1.data) && searchRes1.data.length > 0) {
          const found = searchRes1.data[0];
          console.log(`✅ Registro encontrado (isSync=false): ${found.id} (isSync: ${found.isSync}, status: ${found.order_status})`);
          return found;
        }
      } catch (error1) {
        console.warn(`⚠️ Erro na busca 1 (isSync=false):`, error1.message);
      }

      // Busca 2: isSync=null (busca separada para evitar problemas do Master Data V2)
      let whereClause2 = `order="${order}" AND item="${item}" AND isSync=null`;
      if (status) {
        whereClause2 += ` AND order_status="${status}"`;
      }
      
      const params2 = {
        _where: whereClause2,
        _fields: 'id,order,item,isSync,order_status',
        _size: 100
      };

      console.log(`🔍 WHERE clause 2: ${whereClause2}`);

      try {
        const searchRes2 = await axios.get(searchUrl, {
          params: params2,
          headers: this.getVtexHeaders(),
          timeout: 30000
        });

        if (Array.isArray(searchRes2.data) && searchRes2.data.length > 0) {
          const found = searchRes2.data[0];
          console.log(`✅ Registro encontrado (isSync=null): ${found.id} (isSync: ${found.isSync}, status: ${found.order_status})`);
          return found;
        }
      } catch (error2) {
        console.warn(`⚠️ Erro na busca 2 (isSync=null):`, error2.message);
      }

      console.log(`ℹ️ Registro não encontrado: order=${order} + item=${item} + status=${status} + (isSync=false OR isSync=null)`);
      
      // Busca alternativa sem filtro de status para debug
      const debugParams = {
        _where: `order="${order}" AND item="${item}"`,
        _fields: 'id,order,item,isSync,order_status',
        _size: 10
      };
      
      try {
        const debugRes = await axios.get(searchUrl, {
          params: debugParams,
          headers: this.getVtexHeaders(),
          timeout: 30000
        });
        
        if (Array.isArray(debugRes.data) && debugRes.data.length > 0) {
          console.log(`🔍 Registros encontrados sem filtro de status:`, debugRes.data.map(r => ({
            id: r.id,
            order: r.order,
            item: r.item,
            isSync: r.isSync,
            status: r.order_status
          })));
        }
      } catch (debugError) {
        console.log(`🔍 Erro na busca de debug:`, debugError.message);
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Erro ao verificar registro existente:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        order: order,
        item: item,
        status: status,
        url: `${this.vtexBaseUrl}/api/dataentities/${this.entity}/search`
      });
      return null;
    }
  }

  /**
   * Marca pedidos como sincronizados (isSync=true)
   * @param {Array} records - Array de registros para marcar como sincronizados
   * @returns {Object} Resultado da operação
   */
  async markAsSynced(records) {
    let updated = 0;
    let errors = 0;
    
    console.log(`🔄 Marcando ${records.length} pedidos como sincronizados (isSync=true)...`);
    
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      
      if (!rec.order) {
        console.warn(`⚠️ Registro sem order, pulando:`, rec);
        continue;
      }

      // Pula pedidos de marketplace
      const marketplaceValidator = require('../utils/marketplaceValidator');
      
      if (marketplaceValidator.isMarketplaceOrder(rec.order)) {
        console.log(`🔄 Pulando pedido de marketplace: ${rec.order}`);
        continue;
      }
      
      // Delay entre itens para evitar rate limiting da API
      if (i > 0) {
        const delay = 500; // 500ms entre cada item (reduzido para melhor performance)
        console.log(`⏳ Aguardando ${delay}ms antes de processar próximo item...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      try {
        const documentsUrl = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/documents`;
        const updateBody = { isSync: true };

        // 1) Se veio id no registro, valida que existe via GET /documents/{id}
        let documentId = rec.id;
        if (documentId) {
          try {
            const getById = await axios.get(`${documentsUrl}/${documentId}`, {
              headers: this.getVtexHeaders(),
              timeout: 15000
            });
            if (!(getById.status >= 200 && getById.status < 300)) {
              documentId = undefined;
            }
          } catch (e) {
            documentId = undefined;
          }
        }

        // 2) Se ainda não temos id, busca todos os registros e filtra por order + item (com retry)
        if (!documentId) {
          const maxRetries = 3;
          let retryCount = 0;
          
          while (!documentId && retryCount < maxRetries) {
            try {
              const searchUrl = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/search`;
              const params = {
                _fields: 'id,order,item,order_status',
                _size: 1000
              };
              
              console.log(`🔍 Buscando documento (tentativa ${retryCount + 1}/${maxRetries}) para order=${rec.order} + item=${rec.item}...`);
              
              const searchRes = await axios.get(searchUrl, {
                params,
                headers: this.getVtexHeaders(),
                timeout: 20000
              });
              
              if (Array.isArray(searchRes.data)) {
                console.log(`📊 API retornou ${searchRes.data.length} registros na tentativa ${retryCount + 1}`);
                
                
                // Busca pela combinação order + item (chave única de negócio)
                // Não considera o id pois pode ser diferente para registros duplicados
                const found = searchRes.data.find(item => {
                  const orderMatch = item.order === rec.order;
                  const itemMatch = item.item === rec.item;
                  
                  // Busca sempre por order + item (chave única de negócio)
                  return orderMatch && itemMatch;
                });
                if (found) {
                  documentId = found.id;
                  console.log(`✅ Encontrado documento ${documentId} para order=${rec.order} + item=${rec.item} (tentativa ${retryCount + 1})`);
                  break;
                } else {
                  console.log(`⚠️ Documento não encontrado na tentativa ${retryCount + 1} para order=${rec.order} + item=${rec.item}`);
                  
                  // Busca parcial para debug - verifica se pelo menos o order existe
                  const orderExists = searchRes.data.find(item => item.order === rec.order);
                  if (orderExists) {
                    console.log(`🔍 Order ${rec.order} existe, mas com item/status diferentes:`, {
                      item: orderExists.item,
                      status: orderExists.order_status
                    });
                  } else {
                    console.log(`🔍 Order ${rec.order} não encontrado em nenhum registro`);
                  }
                  
                  // Busca parcial para debug - verifica se pelo menos o item existe
                  const itemExists = searchRes.data.find(item => item.item === rec.item);
                  if (itemExists) {
                    console.log(`🔍 Item ${rec.item} existe, mas com order/status diferentes:`, {
                      order: itemExists.order,
                      status: itemExists.order_status
                    });
                  } else {
                    console.log(`🔍 Item ${rec.item} não encontrado em nenhum registro`);
                  }
                }
              }
            } catch (e) {
              console.warn(`⚠️ Falha na tentativa ${retryCount + 1} ao buscar documentId:`, {
                order: rec.order,
                item: rec.item,
                status: e.response?.status,
                data: e.response?.data,
                message: e.message
              });
            }
            
            retryCount++;
            if (!documentId && retryCount < maxRetries) {
              // Backoff exponencial: 200ms, 400ms, 800ms (reduzido para melhor performance)
              const delay = Math.pow(2, retryCount - 1) * 200;
              console.log(`⏳ Aguardando ${delay}ms antes da próxima tentativa...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }

        if (!documentId) {
          console.warn(`⚠️ Não foi possível determinar o id para order=${rec.order} + item=${rec.item}. Registro não atualizado para evitar duplicação.`);
          errors += 1;
          continue;
        }

        // 4) Atualiza documento específico via PATCH /documents/{id} (com retry)
        console.log(`🔄 Atualizando isSync do documento ${documentId} (order=${rec.order})...`);
        
        const maxPatchRetries = 3;
        let patchRetryCount = 0;
        let patchSuccess = false;
        
        while (!patchSuccess && patchRetryCount < maxPatchRetries) {
          try {
            const response = await axios.patch(`${documentsUrl}/${documentId}`, updateBody, {
              headers: this.getVtexHeaders(),
              timeout: 20000
            });

            if (response.status >= 200 && response.status < 300) {
              updated += 1;
              patchSuccess = true;
              console.log(`✅ Pedido ${rec.order} (doc ${documentId}) marcado como sincronizado (status: ${response.status})`);
            } else {
              console.warn(`⚠️ Status inesperado ao marcar pedido ${rec.order} (doc ${documentId}): ${response.status}`);
              patchRetryCount++;
            }
          } catch (patchError) {
            console.warn(`⚠️ Erro na tentativa ${patchRetryCount + 1} ao atualizar documento ${documentId}:`, {
              error: patchError.message,
              status: patchError.response?.status,
              data: patchError.response?.data
            });
            patchRetryCount++;
          }
          
          if (!patchSuccess && patchRetryCount < maxPatchRetries) {
            // Backoff exponencial: 200ms, 400ms, 800ms (reduzido para melhor performance)
            const delay = Math.pow(2, patchRetryCount - 1) * 200;
            console.log(`⏳ Aguardando ${delay}ms antes da próxima tentativa de PATCH...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
        
        if (!patchSuccess) {
          console.error(`❌ Falha ao atualizar documento ${documentId} após ${maxPatchRetries} tentativas`);
          errors += 1;
        }
      } catch (err) {
        console.error(`❌ Erro ao marcar pedido ${rec.order || rec.id} como sincronizado:`, {
          error: err.message,
          status: err.response?.status,
          data: err.response?.data,
          order: rec.order,
          id: rec.id
        });
        errors += 1;
      }
    }
    
    console.log(`📊 Resultado da atualização: ${updated} atualizados, ${errors} erros de ${records.length} registros`);
    
    return { success: true, updated, errors, total: records.length };
  }

  /**
   * Processa pedidos pendentes e envia para Emarsys
   * @param {Object} options - Opções de processamento
   * @returns {Object} Resultado do processamento
   */
  async processPendingOrders(options = {}) {
    try {
      console.log('🔄 Iniciando processamento de pedidos pendentes...');
      
      // 1. Lista pedidos pendentes
      const pending = await this.listEmsOrdersV2PendingSync();
      if (!pending.length) {
        return { success: true, message: 'Sem pedidos pendentes para enviar', sent: 0 };
      }
      
      console.log(`📊 ${pending.length} pedidos pendentes encontrados`);
      
      // 2. Envia para Emarsys usando o serviço existente
      const emarsysSalesService = require('./emarsysSalesService');
      const result = await emarsysSalesService.sendUnsyncedOrders(pending);
      
      // 3. Se o envio foi bem-sucedido, marca como sincronizados
      if (result.success && result.total > 0) {
        await this.markAsSynced(pending);
        console.log(`✅ ${pending.length} pedidos marcados como sincronizados`);
      }
      
      return {
        success: result.success,
        sent: result.total || 0,
        failed: result.failed || 0,
        message: result.message || 'Processamento concluído',
        details: result
      };
      
    } catch (error) {
      console.error('❌ Erro ao processar pedidos pendentes:', error);
      return {
        success: false,
        error: error.message,
        sent: 0,
        failed: 0
      };
    }
  }

  /**
   * Reprocessa pedidos não enviados (força reprocessamento)
   * @param {Object} options - Opções de reprocessamento
   * @returns {Object} Resultado do reprocessamento
   */
  async reprocessUnsentOrders(options = {}) {
    try {
      console.log('🔄 Iniciando reprocessamento de pedidos não enviados...');
      
      // 1. Lista todos os pedidos com isSync=false
      const unsent = await this.listEmsOrdersV2PendingSync();
      if (!unsent.length) {
        return { success: true, message: 'Nenhum pedido não enviado encontrado', processed: 0 };
      }
      
      console.log(`📊 ${unsent.length} pedidos não enviados encontrados`);
      
      // 2. Envia para Emarsys
      const emarsysSalesService = require('./emarsysSalesService');
      const result = await emarsysSalesService.sendUnsyncedOrders(unsent);
      
      // 3. Marca como sincronizados se o envio foi bem-sucedido
      if (result.success && result.total > 0) {
        await this.markAsSynced(unsent);
        console.log(`✅ ${unsent.length} pedidos reprocessados e marcados como sincronizados`);
      }
      
      return {
        success: result.success,
        processed: result.total || 0,
        failed: result.failed || 0,
        message: result.message || 'Reprocessamento concluído',
        details: result
      };
      
    } catch (error) {
      console.error('❌ Erro ao reprocessar pedidos:', error);
      return {
        success: false,
        error: error.message,
        processed: 0,
        failed: 0
      };
    }
  }

  /**
   * Busca pedidos por período (registros já existem na base)
   * @param {string} startDate - Data inicial
   * @param {string} endDate - Data final
   * @returns {Object} Resultado da operação
   */
  async fetchAndStoreOrders(startDate, endDate) {
    try {
      console.log(`📅 Buscando pedidos de ${startDate} até ${endDate}...`);
      console.log('ℹ️ [INFO] Registros já existem na base - apenas listando pedidos pendentes');
      
      // Busca pedidos pendentes diretamente da base existente
      const pendingOrders = await this.listEmsOrdersV2PendingSync();
      
      console.log(`✅ ${pendingOrders.length} pedidos pendentes encontrados na base existente`);
      
      return {
        success: true,
        stored: pendingOrders.length,
        totalFound: pendingOrders.length,
        message: 'Pedidos já existem na base - listando pendentes',
        pendingOrders: pendingOrders.slice(0, 2) // Mostra apenas os primeiros 2 como exemplo
      };
      
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos:', error);
      return {
        success: false,
        error: error.message,
        stored: 0
      };
    }
  }
}

module.exports = new EmsOrdersService();
