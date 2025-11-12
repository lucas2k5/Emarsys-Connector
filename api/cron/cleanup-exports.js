/**
 * Endpoint de cron job para limpeza automática de exports
 * Deve ser chamado pelo sistema de cron todo domingo às 00:00
 * 
 * Configuração no crontab:
 * 0 0 * * 0 curl -X POST http://localhost:3000/api/cron/cleanup-exports
 * 
 * Ou via PM2:
 * Adicionar no ecosystem.config.js
 */

const ExportsCleanup = require('../../scripts/cleanup-old-exports');

module.exports = async (req, res) => {
  try {
    console.log('🕐 [Cron Job] Executando limpeza automática de exports...');
    
    const cleanup = new ExportsCleanup();
    const result = await cleanup.cleanup();
    
    // Log detalhado
    console.log('📊 Resultado da limpeza automática:', {
      filesDeleted: result.filesDeleted,
      spaceFreed: result.spaceFreedFormatted,
      period: result.period
    });
    
    res.status(200).json({
      success: result.success,
      message: 'Limpeza automática executada',
      ...result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro na limpeza automática:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

