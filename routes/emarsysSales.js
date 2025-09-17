const express = require('express');
const router = express.Router();
const axios = require('axios');
const emarsysSalesService = require('../services/emarsysSalesService');
const VtexOrdersService = require('../services/vtexOrdersService');

/**
 * @route GET /api/emarsys/sales/test
 * @desc Testa a conexão com a API de vendas da Emarsys
 * @access Public
 */
// Teste de conexão com a API da Emarsys
router.get('/test', async (req, res) => {
  try {
    console.log('🔍 [ROUTE] Iniciando teste de conexão com Emarsys...');
    const result = await emarsysSalesService.testConnection();
    console.log('✅ [ROUTE] Teste concluído:', result);
    res.json(result);
  } catch (error) {
    console.error('❌ [ROUTE] Erro no teste:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});



/**
 * @route POST /api/emarsys/sales/send-unsynced
 * @desc Envia apenas pedidos não sincronizados para a Emarsys
 * @access Public
 */
router.post('/send-unsynced', async (req, res) => {
  try {
    // Carrega pedidos salvos
    const vtexOrdersService = new VtexOrdersService();
    const ordersData = await vtexOrdersService.loadOrdersFromFile();
    
    if (!ordersData.success || !ordersData.data || ordersData.data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nenhum pedido encontrado para enviar'
      });
    }

    console.log(`📤 Enviando pedidos não sincronizados para Emarsys...`);
    
    const result = await emarsysSalesService.sendUnsyncedOrders(ordersData.data);
    
    res.json({
      success: true,
      message: 'Envio de pedidos não sincronizados concluído',
      result: result,
      totalOrders: ordersData.data.length
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/emarsys/sales/sync-status
 * @desc Obtém status da última sincronização com Emarsys
 * @access Public
 */
router.get('/sync-status', async (req, res) => {
  try {
    const vtexOrdersService = new VtexOrdersService();
    const syncInfo = await vtexOrdersService.getLastEmarsysSyncInfo();
    
    res.json({
      success: true,
      syncInfo: syncInfo
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/emarsys/sales/send-csv-file
 * @desc Envia arquivo CSV específico ou o mais recente para a Emarsys
 * @access Public
 * @body {filename?: string} - Nome do arquivo CSV (opcional, usa o mais recente se não informado)
 */
router.post('/send-csv-file', async (req, res) => {
  try {
    const { filename } = req.body || {};
    
    console.log(`📤 [ROUTE] Enviando arquivo CSV para Emarsys... 01/9`);
    if (filename) {
      console.log(`📄 Arquivo específico solicitado: ${filename}`);
    } else {
      console.log(`📄 Usando arquivo mais recente`);
    }
    
    const result = await emarsysSalesService.sendCsvFileToEmarsys(filename);
    
    let cleanupResult = null;
    
    // Se o envio foi bem-sucedido, executa limpeza da base de orders (se habilitada)
    if (result && result.success) {
      // Verifica se a limpeza está habilitada via variável de ambiente
      const cleanupEnabled = process.env.ENABLE_ORDER_CLEANUP !== 'false';
      
      if (!cleanupEnabled) {
        console.log('⏸️ Limpeza de orders pausada via ENABLE_ORDER_CLEANUP=false');
        cleanupResult = { success: false, skipped: true, message: 'Limpeza pausada por configuração' };
      } else {
        // Limpeza da base de orders
        try {
          console.log('🧹 Limpando base de orders após sincronização...');
        
        const baseUrlEnv = (process.env.VTEX_BASE_URL).replace(/\/$/, '');
        if (!baseUrlEnv) {
          console.warn('⚠️ BASE_URL/VTEX_BASE_URL não configurada; limpeza pós-envio não executada');
          cleanupResult = { success: false, error: 'BASE_URL não configurada' };
        } else {
          console.log(`🔗 URL da limpeza: ${baseUrlEnv}/_v/orders/all`);
          
          const cleanupResponse = await axios({
            method: 'DELETE',
            url: `${baseUrlEnv}/_v/orderss/all`,
            headers: {
              'Content-Type': 'application/json'
            },
            data: {
              confirm: 'DELETE_ALL_ORDERS'
            },
            timeout: 60000
          });
          
          console.log('🧹 Limpeza de orders retornou status:', cleanupResponse.status);
          
          if (cleanupResponse.status >= 200 && cleanupResponse.status < 300) {
            console.log('✅ Base de orders limpa com sucesso');
            cleanupResult = { success: true, status: cleanupResponse.status };
          } else {
            console.warn(`⚠️ Limpeza de orders retornou status inesperado: ${cleanupResponse.status}`);
            cleanupResult = { success: false, status: cleanupResponse.status };
          }
        }
      } catch (cleanupError) {
        const status = cleanupError?.response?.status;
        console.error('❌ Detalhes do erro de limpeza:', {
          message: cleanupError?.message,
          status: status,
          data: cleanupError?.response?.data,
          url: cleanupError?.config?.url
        });
        
        if (status === 504) {
          console.log('✅ Operação de limpeza iniciada. 504 indica execução em segundo plano. Verifique os logs.');
          cleanupResult = { success: true, status: 504, note: 'Executando em segundo plano' };
        } else if (status === 404) {
          console.warn('⚠️ Rota de limpeza não encontrada. Verifique se /_v/orders/all existe.');
          cleanupResult = { success: false, error: 'Rota de limpeza não encontrada', status: 404 };
        } else {
          console.error('❌ Erro ao limpar base de orders após envio:', cleanupError?.message || cleanupError);
          cleanupResult = { success: false, error: cleanupError?.message, status: status };
        }
      }
      }
    }
    
    // Finalmente: Retorna resposta completa ao Postman
    res.json({
      success: true,
      message: 'Fluxo executado: Envio → Limpeza',
      emarsysResult: result,
      cleanupResult: cleanupResult,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [ROUTE] Erro ao enviar CSV:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/emarsys/sales/latest-csv
 * @desc Obtém informações do último arquivo CSV de orders gerado
 * @access Public
 */
router.get('/latest-csv', async (req, res) => {
  try {
    const latestFile = await emarsysSalesService.getLatestOrdersCsvFile();
    
    if (!latestFile) {
      return res.status(404).json({
        success: false,
        message: 'Nenhum arquivo CSV de orders encontrado'
      });
    }
    
    res.json({
      success: true,
      message: 'Último arquivo CSV encontrado',
      file: {
        filename: latestFile.filename,
        size: latestFile.size,
        modified: latestFile.modified,
        filePath: latestFile.filePath
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router; 