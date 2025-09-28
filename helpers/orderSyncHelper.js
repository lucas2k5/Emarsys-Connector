const axios = require('axios');
const { normalizeVtexBaseUrl } = require('../utils/urlUtils');
const { searchOrders } = require('../utils/mdSearch');

/**
 * Helper para operações de sincronização de pedidos
 */
class OrderSyncHelper {
  constructor(vtexBaseUrl, entity, getVtexHeaders) {
    this.vtexBaseUrl = normalizeVtexBaseUrl(vtexBaseUrl);
    this.entity = entity;
    this.getVtexHeaders = getVtexHeaders;
  }

  /**
   * Marca pedidos como sincronizados (isSync=true) - implementação centralizada
   * @param {Array} records - Array de registros para marcar como sincronizados
   * @param {Object} headers - Headers para autenticação
   * @returns {Object} Resultado da operação
   */
  async markAsSynced(records, headers) {
    let updated = 0;
    let errors = 0;
    
    console.log(`🔄 Marcando ${records.length} pedidos como sincronizados (isSync=true)...`);
    
    try {
      console.log('🔎 Buscando todos os registros via scroll...');
      
      // Busca todos os registros de uma vez
      const allRecords = await this.getAllRecordsWithDetails(headers);
      console.log(`✅ ${allRecords.length} registros encontrados via scroll`);
      
      // Filtra apenas os que precisam ser atualizados (isSync=false)
      const recordsToUpdate = allRecords.filter(record => 
        record.isSync === false || record.isSync === null || record.isSync === undefined
      );
      
      console.log(`📋 ${recordsToUpdate.length} registros precisam ser atualizados`);
      
      if (recordsToUpdate.length === 0) {
        console.log('✅ Nenhum registro precisa ser atualizado');
        return { success: true, updated: 0, errors: 0, total: records.length };
      }
      
      // Atualiza em lote
      const updateResults = await this.batchUpdateRecords(recordsToUpdate, headers);
      updated = updateResults.updated;
      errors = updateResults.errors;
      
    } catch (error) {
      console.error('❌ Erro ao marcar pedidos como sincronizados:', error.message);
      errors = records.length;
    }
    
    console.log(`📊 Resultado da atualização: ${updated} atualizados, ${errors} erros de ${records.length} registros`);
    
    return { success: true, updated, errors, total: records.length };
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
