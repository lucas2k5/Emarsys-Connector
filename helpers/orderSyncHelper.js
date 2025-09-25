const axios = require('axios');
const { normalizeVtexBaseUrl } = require('../utils/urlUtils');
const { scrollOrders } = require('../utils/mdScroll');

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
   * Marca pedidos como sincronizados (isSync=true)
   * @param {Array} records - Array de registros para marcar como sincronizados
   * @returns {Object} Resultado da operação
   */
  async markAsSynced(records, headers) {
    let updated = 0;
    let errors = 0;
    
    console.log(`🔄 Marcando ${records.length} pedidos como sincronizados (isSync=true)...`);
    const pendingByKey = new Map();
    try {
      console.log('🔎 Buscando registros via util mdScrollAll (Master Data /scroll)...');
      const items = await scrollOrders(headers);
      // for (const it of items) {
      //   if (it && it.id && it.order && it.item) {
      //     const key = `${it.order}::${it.item}`;
      //     if (!pendingByKey.has(key)) pendingByKey.set(key, it);
      //   }
      // }
      console.log('🔎 items...------------------------', items);
      console.log(`✅ Índice montado via util: ${pendingByKey.size} registros (fetched=${items.length})`);
    } catch (idxErr) {
      console.warn('⚠️ Falha ao montar índice via util /scroll. Continuando com fallback por registro...', idxErr.message);
    }
    
    // for (let i = 0; i < records.length; i++) {
    //   const rec = records[i];
      
    //   if (!rec.order) {
    //     console.warn(`⚠️ Registro sem order, pulando:`, rec);
    //     continue;
    //   }
      
    //   if (i > 0) {
    //     const delay = 500; // 500ms entre cada item (reduzido para melhor performance)
    //     console.log(`⏳ Aguardando ${delay}ms antes de processar próximo item...`);
    //     await new Promise(resolve => setTimeout(resolve, delay));
    //   }
      
    //   try {
    //     const documentsUrl = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/documents`;
    //     const updateBody = { isSync: true };

    //     let documentId = rec.id;
    //     console.log(`🔎 documentId:`, documentId);
    //     if (!documentId) {
    //       if (!rec.order || !rec.item) {
    //         console.warn(`⚠️ Registro sem id e sem chaves suficientes (order/item) para buscar:`, { order: rec.order, item: rec.item });
    //         errors += 1;
    //         continue;
    //       }

    //       // Passo 2: Tentar obter id a partir do índice pré-carregado
    //       const key = `${rec.order}::${rec.item}`;
    //       const indexed = pendingByKey.get(key);
    //       if (indexed && indexed.id) {
    //         documentId = indexed.id;
    //         const statusInfo = typeof indexed.order_status !== 'undefined' ? ` (order_status=${indexed.order_status})` : '';
    //         console.log(`✅ id encontrado via índice: ${documentId} para order=${rec.order} + item=${rec.item}${statusInfo}`);
    //       } else {
    //         // Fallback pontual por registro
    //         try {
    //           const searchUrl = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/search`;
    //           const q = `order="${rec.order}" AND item="${rec.item}" AND (isSync=false OR isSync="false")`;
    //           const { data: found } = await axios.get(searchUrl, {
    //             params: {
    //               _where: q,
    //               _fields: 'id,order,item,order_status,isSync',
    //               _schema: this.entity,
    //               _page: 1,
    //               _perPage: 1
    //             },
    //             headers: this.getVtexHeaders(),
    //             timeout: 30000
    //           });
    //           if (Array.isArray(found) && found[0]?.id) {
    //             documentId = found[0].id;
    //             console.log(`🔁 id encontrado via fallback: ${documentId} para order=${rec.order} + item=${rec.item}`);
    //           }
    //         } catch (e) {
    //           console.warn('⚠️ Fallback de busca por id falhou:', e.message);
    //         }
    //       }

    //       if (!documentId) {
    //         console.warn(`⚠️ Não foi possível obter o id para order=${rec.order} + item=${rec.item}. Pulando atualização de isSync.`);
    //         errors += 1;
    //         continue;
    //       }
    //     }

    //     // Atualiza documento específico via PATCH /documents/{id} (com retry)
    //     console.log(`🔄 Atualizando isSync do documento ${documentId} (order=${rec.order})...`);
        
    //     const maxPatchRetries = 3;
    //     let patchRetryCount = 0;
    //     let patchSuccess = false;
        
    //     while (!patchSuccess && patchRetryCount < maxPatchRetries) {
    //       try {
    //         const response = await axios.patch(`${documentsUrl}/${documentId}`, updateBody, {
    //           headers: {
    //             ...this.getVtexHeaders(),
    //             'Content-Type': 'application/json',
    //             'Accept': 'application/json'
    //           },
    //           timeout: 60000,
    //           validateStatus: s => s < 500 || s === 502 || s === 503 || s === 504 || s === 429
    //         });

    //         if (response.status >= 200 && response.status < 300) {
    //           updated += 1;
    //           patchSuccess = true;
    //           console.log(`✅ Pedido ${rec.order} (doc ${documentId}) marcado como sincronizado (status: ${response.status})`);
    //         } else if (response.status === 429) {
    //           const delay = Math.pow(2, patchRetryCount) * 400;
    //           console.log(`⏳ 429 rate limit — aguardando ${delay}ms...`);
    //           await new Promise(r => setTimeout(r, delay));
    //           patchRetryCount++;
    //         } else if (response.status === 502 || response.status === 503 || response.status === 504) {
    //           console.warn(`⚠️ Erro transitório ${response.status} ao marcar pedido ${rec.order}. Retentando...`);
    //           patchRetryCount++;
    //         } else {
    //           console.warn(`⚠️ Status inesperado ao marcar pedido ${rec.order} (doc ${documentId}): ${response.status}`);
    //           patchRetryCount++;
    //         }
    //       } catch (patchError) {
    //         console.warn(`⚠️ Erro na tentativa ${patchRetryCount + 1} ao atualizar documento ${documentId}:`, {
    //           error: patchError.message,
    //           status: patchError.response?.status,
    //           data: patchError.response?.data
    //         });
    //         patchRetryCount++;
    //       }
          
    //       if (!patchSuccess && patchRetryCount < maxPatchRetries) {
    //         // Backoff exponencial: 200ms, 400ms, 800ms (reduzido para melhor performance)
    //         const delay = Math.pow(2, patchRetryCount - 1) * 200;
    //         console.log(`⏳ Aguardando ${delay}ms antes da próxima tentativa de PATCH...`);
    //         await new Promise(resolve => setTimeout(resolve, delay));
    //       }
    //     }
        
    //     if (!patchSuccess) {
    //       console.error(`❌ Falha ao atualizar documento ${documentId} após ${maxPatchRetries} tentativas`);
    //       errors += 1;
    //     }
    //   } catch (err) {
    //     console.error(`❌ Erro ao marcar pedido ${rec.order || rec.id} como sincronizado:`, {
    //       error: err.message,
    //       status: err.response?.status,
    //       data: err.response?.data,
    //       order: rec.order,
    //       id: rec.id
    //     });
    //     errors += 1;
    //   }
    // }
    
    console.log(`📊 Resultado da atualização: ${updated} atualizados, ${errors} erros de ${records.length} registros`);
    
    return { success: true, updated, errors, total: records.length };
  }
}

module.exports = OrderSyncHelper;
