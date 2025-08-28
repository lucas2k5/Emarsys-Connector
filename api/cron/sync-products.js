// Vercel Cron Job para sincronização de produtos VTEX
// Executa automaticamente conforme agendamento no vercel.json
// @vercel/node maxDuration=600

module.exports = async function handler(req, res) {
  // Verificar se é uma requisição do cron job da Vercel
  if (req.headers['user-agent'] !== 'vercel-cron/1.0') {
    return res.status(401).json({ error: 'Unauthorized - Only Vercel Cron Jobs allowed' });
  }

  console.log('🕐 [Vercel Cron] Iniciando sincronização de produtos VTEX...');
  
  try {
    const startTime = Date.now();
    
    // Disparar evento para Inngest processar em background
    const { inngest } = require('../../lib/inngest');
    
    console.log('🔄 Disparando evento vtex.sync.start para Inngest...');
    
    await inngest.send({
      name: "vtex.sync.start",
      data: { 
        maxProducts: 0, // Sem limite
        forceRefresh: false,
        batchSize: parseInt(process.env.PRODUCTS_BATCH_SIZE) || 50,
        source: 'vercel-cron'
      }
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ Evento disparado para Inngest em ${duration}ms`);
    
    return res.json({
      success: true,
      mode: 'inngest-event',
      message: 'Evento vtex.sync.start disparado para Inngest',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      note: 'A sincronização será processada em background pelo Inngest'
    });
    
  } catch (error) {
    console.error('❌ Erro no cron job de produtos:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
