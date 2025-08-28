const express = require('express');
const router = express.Router();
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
    
    console.log(`📤 [ROUTE] Enviando arquivo CSV para Emarsys...`);
    if (filename) {
      console.log(`📄 Arquivo específico solicitado: ${filename}`);
    } else {
      console.log(`📄 Usando arquivo mais recente`);
    }
    
    const result = await emarsysSalesService.sendCsvFileToEmarsys(filename);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Arquivo CSV enviado para Emarsys',
        result: result
      });
    } else {
      // Se não foi bem-sucedido, retorna o erro
      res.status(400).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }
    
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