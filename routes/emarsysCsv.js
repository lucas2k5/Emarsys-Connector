const express = require('express');
const router = express.Router();
const VtexOrdersService = require('../services/vtexOrdersService');


/**
 * @route GET /api/emarsys/csv/validate
 * @desc Valida todos os pedidos para geração de CSV
 * @access Public
 */
router.get('/validate', async (req, res) => {
  try {
    // Carrega pedidos salvos
    const vtexOrdersService = new VtexOrdersService();
    const ordersData = await vtexOrdersService.loadOrdersFromFile();
    
    if (!ordersData.success || !ordersData.data || ordersData.data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nenhum pedido encontrado para validar'
      });
    }

    console.log(`🔍 Validando ${ordersData.data.length} pedidos para CSV...`);
    
    const validationResult = vtexOrdersService.validateOrderDataForEmarsys(ordersData.data);
    
    res.json({
      success: true,
      message: 'Validação concluída',
      validation: validationResult,
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
 * @route GET /api/emarsys/csv/files
 * @desc Lista todos os arquivos CSV gerados
 * @access Public
 */
router.get('/files', async (req, res) => {
  try {
    console.log('📁 Listando arquivos CSV...');
    
    const path = require('path');
    const fs = require('fs').promises;
    
    const outputDir = process.env.EXPORTS_DIR || path.join(__dirname, '..', 'exports');
    
    try {
      const files = await fs.readdir(outputDir);
      const csvFiles = files.filter(file => file.endsWith('.csv'));
      
      const fileDetails = await Promise.all(
        csvFiles.map(async (filename) => {
          try {
            const filePath = path.join(outputDir, filename);
            const stats = await fs.stat(filePath);
            return {
              filename,
              size: stats.size,
              created: stats.birthtime,
              modified: stats.mtime
            };
          } catch (error) {
            return {
              filename,
              error: error.message
            };
          }
        })
      );
      
      res.json({
        success: true,
        message: 'Lista de arquivos CSV',
        result: {
          directory: outputDir,
          totalFiles: csvFiles.length,
          files: fileDetails
        }
      });
      
    } catch (error) {
      res.json({
        success: true,
        message: 'Diretório de exports não encontrado',
        result: {
          directory: outputDir,
          totalFiles: 0,
          files: []
        }
      });
    }
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/emarsys/csv/files/:filename
 * @desc Remove um arquivo CSV específico
 * @access Public
 */
router.delete('/files/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'Nome do arquivo é obrigatório'
      });
    }

    console.log(`🗑️ Removendo arquivo CSV: ${filename}`);
    
    const path = require('path');
    const fs = require('fs').promises;
    
    const outputDir = process.env.EXPORTS_DIR || path.join(__dirname, '..', 'exports');
    const filePath = path.join(outputDir, filename);

    try {
      await fs.unlink(filePath);
      
      res.json({
        success: true,
        message: 'Arquivo CSV removido com sucesso',
        result: {
          filename,
          deleted: true
        }
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        error: 'Arquivo não encontrado'
      });
    }
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/emarsys/csv/download/:filename
 * @desc Faz download de um arquivo CSV específico
 * @access Public
 */
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'Nome do arquivo é obrigatório'
      });
    }

    const path = require('path');
    const fs = require('fs').promises;
    
    const outputDir = process.env.EXPORTS_DIR || path.join(__dirname, '..', 'exports');
    const filePath = path.join(outputDir, filename);

    // Verifica se o arquivo existe
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Arquivo não encontrado'
      });
    }

    console.log(`📥 Download do arquivo: ${filename}`);
    
    // Define headers para download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Envia o arquivo
    res.sendFile(filePath);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/emarsys/csv/preview/:filename
 * @desc Mostra preview de um arquivo CSV (primeiras 10 linhas)
 * @access Public
 */
router.get('/preview/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const { lines = 10 } = req.query;
    
    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'Nome do arquivo é obrigatório'
      });
    }

    const path = require('path');
    const fs = require('fs').promises;
    
    const outputDir = process.env.EXPORTS_DIR || path.join(__dirname, '..', 'exports');
    const filePath = path.join(outputDir, filename);

    // Verifica se o arquivo existe
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Arquivo não encontrado'
      });
    }

    // Lê o arquivo
    const content = await fs.readFile(filePath, 'utf8');
    const linesArray = content.split('\n');
    
    // Pega apenas as primeiras linhas solicitadas
    const previewLines = linesArray.slice(0, parseInt(lines));
    
    console.log(`👁️ Preview do arquivo: ${filename} (${previewLines.length} linhas)`);
    
    res.json({
      success: true,
      filename: filename,
      totalLines: linesArray.length,
      previewLines: previewLines.length,
      content: previewLines
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router; 