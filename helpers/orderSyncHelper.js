const axios = require('axios');

/**
 * Helper para operações de sincronização de pedidos
 */
class OrderSyncHelper {
  constructor(vtexBaseUrl, entity, getVtexHeaders) {
    this.vtexBaseUrl = vtexBaseUrl;
    this.entity = entity;
    this.getVtexHeaders = getVtexHeaders;
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

        // 2) Se ainda não temos id, busca usando o método comum do emsOrdersService
        if (!documentId) {
          const maxRetries = 3;
          let retryCount = 0;
          
          while (!documentId && retryCount < maxRetries) {
            try {
              console.log(`🔍 Buscando documento (tentativa ${retryCount + 1}/${maxRetries}) para order=${rec.order} + item=${rec.item}...`);
              
              // Usa o mesmo método que funciona no checkExistingRecord
              const emsOrdersService = require('../services/emsOrdersService');
              const foundRecord = await emsOrdersService.checkExistingRecord(rec.order, rec.item);
              
              if (foundRecord && foundRecord.id) {
                documentId = foundRecord.id;
                console.log(`✅ Encontrado documento ${documentId} para order=${rec.order} + item=${rec.item} (isSync=false, tentativa ${retryCount + 1})`);
                break;
              } else {
                console.log(`⚠️ Documento não encontrado na tentativa ${retryCount + 1} para order=${rec.order} + item=${rec.item}`);
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
}

module.exports = OrderSyncHelper;
