// Vercel Cron Job para geração de CSV de produtos
// Executa automaticamente conforme agendamento no vercel.json
// @vercel/node maxDuration=600

module.exports = async function handler(req, res) {
  // Verificar se é uma requisição do cron job da Vercel
  if (req.headers['user-agent'] !== 'vercel-cron/1.0') {
    return res.status(401).json({ error: 'Unauthorized - Only Vercel Cron Jobs allowed' });
  }

  console.log('🕐 [Vercel Cron] Iniciando geração de CSV de produtos...');
  
  try {
    const startTime = Date.now();
    
    // Chamar diretamente o serviço de geração de CSV
    const syncService = require('../../utils/syncService');
    const result = await syncService.generateProductsCsv();
    
    const duration = Date.now() - startTime;
    console.log(`✅ Geração de CSV concluída em ${duration}ms`);
    
    return res.json({
      success: true,
      mode: 'direct-execution',
      ...result,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro no cron job:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
