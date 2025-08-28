// Status endpoint para background jobs
// Verifica o status de jobs em execução
// @vercel/node maxDuration=10

module.exports = async function handler(req) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId');
    
    if (!jobId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'jobId é obrigatório'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Aqui você consultaria um banco de dados, KV store, ou cache
    // Por enquanto, simulamos um status
    
    const mockStatus = {
      jobId,
      status: 'completed', // ou 'running', 'failed'
      progress: 100,
      startTime: new Date(Date.now() - 300000).toISOString(), // 5 min atrás
      endTime: new Date().toISOString(),
      result: {
        totalProducts: 1250,
        duration: 180000, // 3 minutos
        success: true
      }
    };
    
    // Calcular duração
    const startTime = new Date(mockStatus.startTime);
    const endTime = new Date(mockStatus.endTime);
    const duration = Math.round((endTime - startTime) / 1000);
    
    return new Response(JSON.stringify({
      success: true,
      job: {
        ...mockStatus,
        duration,
        durationFormatted: `${Math.floor(duration / 60)}m ${duration % 60}s`
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ [Edge] Erro ao verificar status:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
