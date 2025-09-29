const axios = require('axios');
const { normalizeVtexBaseUrl } = require('../utils/urlUtils');
const { searchOrders } = require('../utils/mdSearch');

/**
 * Helper para operações de sincronização de pedidos
 */
class OrderSyncHelper {
  
  /**
   * Codifica caracteres especiais na query _where para funcionar corretamente com a API
   * @param {string} whereClause - A cláusula where sem codificação
   * @returns {string} A cláusula where codificada
   */
  encodeWhereClause(whereClause) {
    return whereClause
      .replace(/=/g, '%3D')  // Codifica o caractere '=' para '%3D'
      .replace(/\(/g, '%28') // Codifica o caractere '(' para '%28'  
      .replace(/\)/g, '%29'); // Codifica o caractere ')' para '%29'
  }
  constructor(vtexBaseUrl, entity, getVtexHeaders) {
    this.vtexBaseUrl = normalizeVtexBaseUrl(vtexBaseUrl);
    this.entity = entity;
    this.getVtexHeaders = getVtexHeaders;
  }

  /**
   * Marca pedidos específicos como sincronizados (isSync=true) usando IDs fornecidos
   * @param {Array} records - Array de registros para marcar como sincronizados
   * @param {Object} headers - Headers para autenticação
   * @returns {Object} Resultado da operação
   */
  async markAsSynced(records, headers) {
    let updated = 0;
    let errors = 0;
    
    console.log(`🔄 Marcando ${records.length} pedidos específicos como sincronizados (isSync=true)...`);
    
    if (!records || records.length === 0) {
      console.log('✅ Nenhum registro fornecido para sincronizar');
      return { success: true, updated: 0, errors: 0, total: 0 };
    }

    try {
      // Processa cada registro individualmente usando o ID fornecido
      console.log(`🔄 Atualizando ${records.length} registros sequencialmente...`);
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        
        try {
          const recordId = record.id; // ID do registro fornecido
          if (!recordId) {
            console.warn('⚠️ Registro sem ID válido:', record);
            errors++;
            continue;
          }
          
          console.log(`🔄 Processando registro ${i + 1}/${records.length}: ${recordId}`);
          console.log(`📄 Dados do registro:`, JSON.stringify(record, null, 2));
          
          // Atualiza o registro para isSync=true usando o ID do registro
          const updateUrl = `${this.vtexBaseUrl}/_v/orders/${recordId}/sync`;
          const updateResponse = await axios.patch(updateUrl, 
            { isSync: true },
            {
              headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              timeout: 30000
            }
          );
          
          if (updateResponse.status >= 200 && updateResponse.status < 300) {
            console.log(`✅ Registro ${recordId} marcado como sincronizado`);
            updated++;
          } else {
            console.warn(`⚠️ Status inesperado para registro ${recordId}: ${updateResponse.status}`);
            errors++;
          }
          
        } catch (error) {
          console.error(`❌ Erro ao atualizar registro ${record.id}:`, error.message);
          errors++;
        }
        
        // Pausa entre registros para não sobrecarregar a API
        if (i < records.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
    } catch (error) {
      console.error('❌ Erro ao marcar pedidos como sincronizados:', error.message);
      errors = records.length;
    }
    
    console.log(`📊 Resultado da atualização: ${updated} atualizados, ${errors} erros de ${records.length} registros`);
    
    return { success: true, updated, errors, total: records.length };
  }


  /**
   * Testa sincronização com um registro específico
   * @param {string} orderId - ID do registro para testar
   * @param {Object} headers - Headers para autenticação
   * @returns {Object} Resultado do teste
   */
  async testSyncSpecificOrder(orderId, headers) {
    try {
      console.log(`🧪 Testando sincronização para registro específico: ${orderId}`);
      
      // 1. Busca o registro específico diretamente pelo ID
      console.log('🔎 Buscando registro específico...');
      const getUrl = `${this.vtexBaseUrl}/_v/orders/${orderId}`;

      const getResponse = await axios.get(getUrl, {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      const order = getResponse.data;
      console.log(`📋 Registro encontrado para ID ${orderId}`);
      console.log('📄 Dados do registro:', JSON.stringify(order, null, 2));

      // 2. Tenta atualizar o registro
      console.log(`🔄 Tentando atualizar registro ${orderId}...`);
      const updateUrl = `${this.vtexBaseUrl}/_v/orders/${orderId}/sync`;
      
      console.log('🔗 URL de atualização:', updateUrl);
      console.log('📤 Headers:', JSON.stringify({
        ...headers,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }, null, 2));
      
      const updateResponse = await axios.patch(updateUrl, 
        { isSync: true },
        {
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000
        }
      );
      
      console.log('📥 Resposta da atualização:', {
        status: updateResponse.status,
        statusText: updateResponse.statusText,
        data: updateResponse.data
      });

      if (updateResponse.status >= 200 && updateResponse.status < 300) {
        console.log(`✅ Registro ${orderId} marcado como sincronizado com sucesso!`);
        return { success: true, id: orderId, response: updateResponse.data };
      } else {
        console.warn(`⚠️ Status inesperado: ${updateResponse.status}`);
        return { success: false, id: orderId, error: `Status ${updateResponse.status}` };
      }
      
    } catch (error) {
      console.error(`❌ Erro no teste para registro ${orderId}:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers
        }
      });
      return { success: false, id: orderId, error: error.message };
    }
  }

  /**
   * Busca todos os registros com detalhes via scroll
   * @param {Object} headers - Headers para autenticação
   * @returns {Array} Array de registros com detalhes
   */
  async getAllRecordsWithDetails(headers) {
    try {
      console.log('🔎 Buscando todos os registros via scroll...[28-09]====>>>');
      
      const { searchOrders } = require('../utils/mdSearch');
      const items = await searchOrders(headers);
      console.log(`📋 ${Array.isArray(items) ? items.length : 0} registros encontrados via scroll`);
      
      if (!Array.isArray(items) || items.length === 0) {
        return [];
      }

      // Busca detalhes de todos os registros em lotes
      const allRecords = [];
      const batchSize = 20; // Processa em lotes de 20
      
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchPromises = batch.map(async (item) => {
          if (!item.id) return null;
          
          try {
            const { data } = await axios.get(
              `${this.vtexBaseUrl}/api/dataentities/${this.entity}/documents/${item.id}`,
              {
                params: { _fields: 'id,order,item,order_status,isSync' },
                headers: this.getVtexHeaders(),
                timeout: 30000
              }
            );
            return data;
          } catch (e) {
            console.warn(`⚠️ Falha ao buscar documento ${item.id}:`, e.message);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        allRecords.push(...batchResults.filter(Boolean));
        
        // Pequena pausa entre lotes
        if (i + batchSize < items.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`✅ ${allRecords.length} registros com detalhes obtidos`);
      return allRecords;
      
    } catch (error) {
      console.error('❌ Erro ao buscar registros via scroll:', error.message);
      return [];
    }
  }

  /**
   * Busca pedidos com isSync=false usando a API de listagem
   * @param {Object} headers - Headers para autenticação
   * @returns {Array} Array de pedidos que precisam ser sincronizados
   */
  async getOrdersWithIsSyncFalse(headers) {
    try {
      console.log('🔎 Buscando pedidos com isSync=false...');
      
      const listUrl = `${this.vtexBaseUrl}/_v/orders/list`;
      const params = {
        _where: this.encodeWhereClause('(isSync=false)'), // Codifica caracteres especiais para funcionar corretamente
        page: 1,
        pageSize: 1000
      };

      const response = await axios.get(listUrl, {
        params,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      });
      console.log('📥 Resposta da busca:', response.data);
      const orders = response.data || [];
      console.log(`📋 ${orders.length} pedidos encontrados com isSync=false`);
      
      return orders;
    } catch (error) {
      console.error('❌ Erro ao buscar pedidos com isSync=false:', error.message);
      return [];
    }
  }

  /**
   * Marca um pedido específico como sincronizado usando o endpoint de sync
   * @param {string} orderId - ID do pedido
   * @param {Object} headers - Headers para autenticação
   * @returns {Object} Resultado da operação
   */
  async syncOrder(orderId, headers) {
    try {
      const syncUrl = `${this.vtexBaseUrl}/_v/orders/${orderId}/sync`;
      
      const response = await axios.patch(syncUrl, 
        { isSync: true },
        {
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.status >= 200 && response.status < 300) {
        console.log(`✅ Pedido ${orderId} marcado como sincronizado`);
        return { success: true, id: orderId };
      } else {
        console.warn(`⚠️ Status inesperado para pedido ${orderId}: ${response.status}`);
        return { success: false, id: orderId, error: `Status ${response.status}` };
      }
    } catch (error) {
      console.error(`❌ Erro ao sincronizar pedido ${orderId}:`, error.message);
      return { success: false, id: orderId, error: error.message };
    }
  }

  /**
   * Processa sincronização completa: busca pedidos com isSync=false e os marca como sincronizados
   * @param {Object} headers - Headers para autenticação
   * @returns {Object} Resultado da operação
   */
  async processSyncFlow(headers) {
    let updated = 0;
    let errors = 0;
    
    try {
      console.log('🚀 Iniciando fluxo de sincronização...');
      
      // 1. Busca pedidos com isSync=false
      const ordersToSync = await this.getOrdersWithIsSyncFalse(headers);
      
      if (ordersToSync.length === 0) {
        console.log('✅ Nenhum pedido precisa ser sincronizado');
        return { success: true, updated: 0, errors: 0, total: 0 };
      }
      
      console.log(`📋 ${ordersToSync.length} pedidos serão processados`);
      
      // 2. Processa cada pedido individualmente
      const batchSize = 5; // Processa em lotes menores para evitar sobrecarga
      
      for (let i = 0; i < ordersToSync.length; i += batchSize) {
        const batch = ordersToSync.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (order) => {
          const registerId = order.id;
          if (!registerId) {
            console.warn('⚠️ Pedido sem ID válido:', order);
            return { success: false, id: registerId, error: 'ID inválido' };
          }
          
          return await this.syncOrder(registerId, headers);
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Conta resultados
        batchResults.forEach(result => {
          if (result.success) {
            updated++;
          } else {
            errors++;
          }
        });
        
        // Pausa entre lotes
        if (i + batchSize < ordersToSync.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      console.log(`📊 Sincronização concluída: ${updated} atualizados, ${errors} erros de ${ordersToSync.length} pedidos`);
      
      return { 
        success: true, 
        updated, 
        errors, 
        total: ordersToSync.length 
      };
      
    } catch (error) {
      console.error('❌ Erro no fluxo de sincronização:', error.message);
      return { 
        success: false, 
        updated, 
        errors: errors + 1, 
        total: updated + errors + 1 
      };
    }
  }

  /**
   * Atualiza registros em lote
   * @param {Array} records - Array de registros para atualizar
   * @param {Object} headers - Headers para autenticação
   * @returns {Object} Resultado da atualização
   */
  async batchUpdateRecords(records, headers) {
    let updated = 0;
    let errors = 0;
    
    console.log(`🔄 Atualizando ${records.length} registros em lote...`);
    
    const updateBody = { isSync: true };
    const documentsUrl = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/documents`;
    
    // Processa em lotes menores para evitar sobrecarga
    const batchSize = 10;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (record) => {
        try {
          const response = await axios.patch(`${documentsUrl}/${record.id}`, updateBody, {
            headers: {
              ...this.getVtexHeaders(),
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            timeout: 30000
          });
          
          if (response.status >= 200 && response.status < 300) {
            console.log(`✅ Registro ${record.id} (order=${record.order}) marcado como sincronizado`);
            return { success: true, id: record.id };
          } else {
            console.warn(`⚠️ Status inesperado para registro ${record.id}: ${response.status}`);
            return { success: false, id: record.id, error: `Status ${response.status}` };
          }
        } catch (error) {
          console.error(`❌ Erro ao atualizar registro ${record.id}:`, error.message);
          return { success: false, id: record.id, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Conta resultados
      batchResults.forEach(result => {
        if (result.success) {
          updated++;
        } else {
          errors++;
        }
      });
      
      // Pausa entre lotes
      if (i + batchSize < records.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`📊 Lote concluído: ${updated} atualizados, ${errors} erros`);
    return { updated, errors };
  }
}

module.exports = OrderSyncHelper;
