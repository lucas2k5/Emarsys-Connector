const axios = require('axios');

/**
 * Helper para sincronizar pedidos marcando-os como sincronizados
 * @param {Object} listResp - Resposta da API com lista de pedidos
 * @returns {Object} - Resultado da sincronização com contadores
 */
async function syncOrders(listResp) {
  if (listResp.data && listResp.data.data && listResp.data.data.length > 0) {
    console.log(`📋 Encontrados ${listResp.data.data.length} pedidos para marcar como sincronizados`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Processa cada pedido individualmente
    for (const order of listResp.data.data) {
      try {
        // Segunda requisição: PATCH para ems--piccadilly.myvtex.com com o ID específico
        const patchUrl = `https://ems--piccadilly.myvtex.com/_v/orders/${order.id}/sync`;
        const patchResp = await axios.patch(patchUrl, {
          isSync: true
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 10000
        });
        
        if (patchResp.status === 200) {
          successCount++;
          console.log(`✅ Pedido ${order.id} marcado como sincronizado`);
        }
      } catch (patchErr) {
        errorCount++;
        console.error(`❌ Falha ao marcar pedido ${order.id} como sincronizado:`, patchErr.message);
      }
    }
    
    console.log(`📊 Resultado final: ${successCount} pedidos marcados com sucesso, ${errorCount} falharam`);
    
    return {
      success: true,
      successCount,
      errorCount,
      totalProcessed: listResp.data.data.length
    };
  } else {
    console.log('ℹ️ Nenhum pedido não sincronizado encontrado');
    return {
      success: true,
      successCount: 0,
      errorCount: 0,
      totalProcessed: 0
    };
  }
}

module.exports = {
  syncOrders
};