const express = require('express');
const router = express.Router();
const { inngest } = require('../lib/inngest');

// Armazenamento temporário para status dos jobs (em produção, usar Redis ou banco)
const jobStatus = new Map();

// Middleware para log de requisições
router.use((req, res, next) => {
  console.log(`🔄 [Background Jobs] ${req.method} ${req.path}`);
  next();
});

// POST /api/background/sync-products
// Inicia sincronização de produtos em background
router.post('/sync-products', async (req, res) => {
  try {
    const { maxProducts = 0, forceRefresh = false, batchSize = 50 } = req.body;
    
    console.log(`🚀 [Background] Iniciando sync de produtos: maxProducts=${maxProducts}`);
    
    // Gerar ID único para o job
    const jobId = `sync-products-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Inicializar status do job
    jobStatus.set(jobId, {
      id: jobId,
      type: 'sync-products',
      status: 'starting',
      progress: 0,
      startTime: new Date().toISOString(),
      config: { maxProducts, forceRefresh, batchSize }
    });
    
    // Enviar evento para Inngest
    await inngest.send({
      name: "vtex.sync.start",
      data: { 
        maxProducts, 
        forceRefresh, 
        batchSize,
        jobId 
      }
    });
    
    // Atualizar status para running
    jobStatus.set(jobId, {
      ...jobStatus.get(jobId),
      status: 'running',
      progress: 5
    });
    
    res.json({
      success: true,
      jobId,
      message: 'Sincronização de produtos iniciada em background',
      checkStatus: `/api/background/status/${jobId}`,
      config: { maxProducts, forceRefresh, batchSize }
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao iniciar sync de produtos: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/background/sync-orders
// Inicia sincronização de pedidos em background
router.post('/sync-orders', async (req, res) => {
  try {
    const { maxOrders = 0, dateFrom, dateTo } = req.body;
    
    console.log(`🚀 [Background] Iniciando sync de pedidos: maxOrders=${maxOrders}`);
    
    // Gerar ID único para o job
    const jobId = `sync-orders-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Inicializar status do job
    jobStatus.set(jobId, {
      id: jobId,
      type: 'sync-orders',
      status: 'starting',
      progress: 0,
      startTime: new Date().toISOString(),
      config: { maxOrders, dateFrom, dateTo }
    });
    
    // Enviar evento para Inngest
    await inngest.send({
      name: "vtex.orders.sync",
      data: { 
        maxOrders, 
        dateFrom, 
        dateTo,
        jobId 
      }
    });
    
    // Atualizar status para running
    jobStatus.set(jobId, {
      ...jobStatus.get(jobId),
      status: 'running',
      progress: 5
    });
    
    res.json({
      success: true,
      jobId,
      message: 'Sincronização de pedidos iniciada em background',
      checkStatus: `/api/background/status/${jobId}`,
      config: { maxOrders, dateFrom, dateTo }
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao iniciar sync de pedidos: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/background/sync-complete
// Inicia sincronização completa (produtos + pedidos) em background
router.post('/sync-complete', async (req, res) => {
  try {
    const { maxProducts = 0, maxOrders = 0 } = req.body;
    
    console.log(`🚀 [Background] Iniciando sync completo: maxProducts=${maxProducts}, maxOrders=${maxOrders}`);
    
    // Gerar ID único para o job
    const jobId = `sync-complete-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Inicializar status do job
    jobStatus.set(jobId, {
      id: jobId,
      type: 'sync-complete',
      status: 'starting',
      progress: 0,
      startTime: new Date().toISOString(),
      config: { maxProducts, maxOrders }
    });
    
    // Enviar evento para Inngest
    await inngest.send({
      name: "vtex.sync.complete",
      data: { 
        maxProducts, 
        maxOrders,
        jobId 
      }
    });
    
    // Atualizar status para running
    jobStatus.set(jobId, {
      ...jobStatus.get(jobId),
      status: 'running',
      progress: 5
    });
    
    res.json({
      success: true,
      jobId,
      message: 'Sincronização completa iniciada em background',
      checkStatus: `/api/background/status/${jobId}`,
      config: { maxProducts, maxOrders }
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao iniciar sync completo: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/background/status/:jobId
// Verifica o status de um job específico
router.get('/status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = jobStatus.get(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job não encontrado'
      });
    }
    
    // Calcular tempo de execução
    const startTime = new Date(job.startTime);
    const now = new Date();
    const duration = Math.round((now - startTime) / 1000); // segundos
    
    res.json({
      success: true,
      job: {
        ...job,
        duration,
        durationFormatted: `${Math.floor(duration / 60)}m ${duration % 60}s`
      }
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao verificar status: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/background/jobs
// Lista todos os jobs
router.get('/jobs', (req, res) => {
  try {
    const { status, type, limit = 50 } = req.query;
    
    let jobs = Array.from(jobStatus.values());
    
    // Filtrar por status
    if (status) {
      jobs = jobs.filter(job => job.status === status);
    }
    
    // Filtrar por tipo
    if (type) {
      jobs = jobs.filter(job => job.type === type);
    }
    
    // Ordenar por data de início (mais recentes primeiro)
    jobs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    // Limitar resultados
    jobs = jobs.slice(0, parseInt(limit));
    
    // Calcular estatísticas
    const stats = {
      total: jobStatus.size,
      running: jobs.filter(job => job.status === 'running').length,
      completed: jobs.filter(job => job.status === 'completed').length,
      failed: jobs.filter(job => job.status === 'failed').length
    };
    
    res.json({
      success: true,
      jobs,
      stats,
      total: jobs.length
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao listar jobs: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/background/jobs/:jobId
// Remove um job do histórico
router.delete('/jobs/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = jobStatus.get(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job não encontrado'
      });
    }
    
    // Só permite remover jobs finalizados
    if (job.status === 'running' || job.status === 'starting') {
      return res.status(400).json({
        success: false,
        error: 'Não é possível remover um job em execução'
      });
    }
    
    jobStatus.delete(jobId);
    
    res.json({
      success: true,
      message: 'Job removido com sucesso'
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao remover job: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/background/update-status
// Endpoint interno para atualizar status dos jobs (chamado pelo Inngest)
router.post('/update-status', (req, res) => {
  try {
    const { jobId, status, progress, result, error } = req.body;
    
    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'jobId é obrigatório'
      });
    }
    
    const job = jobStatus.get(jobId);
    
    if (!job) {
      console.warn(`⚠️ [Background] Tentativa de atualizar job inexistente: ${jobId}`);
      return res.status(404).json({
        success: false,
        error: 'Job não encontrado'
      });
    }
    
    // Atualizar status
    const updatedJob = {
      ...job,
      status: status || job.status,
      progress: progress !== undefined ? progress : job.progress,
      endTime: status === 'completed' || status === 'failed' ? new Date().toISOString() : job.endTime,
      result: result || job.result,
      error: error || job.error
    };
    
    jobStatus.set(jobId, updatedJob);
    
    console.log(`✅ [Background] Status atualizado: ${jobId} -> ${status} (${progress}%)`);
    
    res.json({
      success: true,
      job: updatedJob
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro ao atualizar status: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/background/health
// Health check para background jobs
router.get('/health', (req, res) => {
  try {
    const stats = {
      totalJobs: jobStatus.size,
      runningJobs: Array.from(jobStatus.values()).filter(job => job.status === 'running').length,
      completedJobs: Array.from(jobStatus.values()).filter(job => job.status === 'completed').length,
      failedJobs: Array.from(jobStatus.values()).filter(job => job.status === 'failed').length,
      inngestConnected: !!inngest
    };
    
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      stats
    });
    
  } catch (error) {
    console.error(`❌ [Background] Erro no health check: ${error.message}`);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

module.exports = router;
