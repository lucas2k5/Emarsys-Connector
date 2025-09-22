const cron = require('cron');
const axios = require('axios');
const moment = require('moment');
const crashProtection = require('./crashProtection');

class CronService {
  constructor() {
    this.jobs = new Map();
    this.baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  }

  /**
   * Inicia todos os cron jobs
   */
  startAll() {
    this.setupProductsSync();
    this.setupOrdersSync();
    console.log('🕐 Todos os cron jobs foram configurados e iniciados');
  }

  /**
   * Configura o cron para sincronização de produtos a cada 8 horas
   */
  setupProductsSync() {
    // Cron expression: 0 */8 * * * (a cada 8 horas)
    const job = new cron.CronJob('0 */8 * * *', async () => {
      const serviceName = 'products-sync';
      
      // Verificar se o serviço pode executar (proteção contra loops)
      if (!crashProtection.canExecute(serviceName)) {
        console.warn(`🚫 [CRON] Sincronização de produtos bloqueada por proteção contra crashes`);
        return;
      }
      
      console.log('🚀 [CRON] Iniciando sincronização de produtos...');
      try {
        // Adicionar timeout mais longo para operações de produtos
        const response = await axios.get(`${this.baseUrl}/api/vtex/products/sync`, {
          timeout: 300000 // 5 minutos
        });
        console.log('✅ [CRON] Sincronização de produtos concluída:', response.status);
        
        // Resetar contador de crashes em caso de sucesso
        crashProtection.resetCrashCount(serviceName);
      } catch (error) {
        console.error('❌ [CRON] Erro na sincronização de produtos:', error.message);
        console.error('❌ [CRON] Stack trace:', error.stack);
        
        // Registrar crash para proteção
        crashProtection.recordCrash(serviceName, error);
        
        // Log adicional para debug em produção
        if (process.env.NODE_ENV === 'production') {
          console.error(`❌ [PRODUCTION CRON ERROR] Product sync failed:`, {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
          });
        }
      }
    }, null, true, 'America/Sao_Paulo');

    this.jobs.set('products-sync', job);
    console.log('🕐 Cron de produtos configurado: a cada 8 horas');
  }

  /**
   * Configura o cron para sincronização de orders a cada 1 hora usando nova base
   */
  setupOrdersSync() {
    // Cron expression: 0 */1 * * * (a cada 1 hora)
    const job = new cron.CronJob('0 */1 * * *', async () => {
      const serviceName = 'orders-sync';
      
      // Verificar se o serviço pode executar (proteção contra loops)
      if (!crashProtection.canExecute(serviceName)) {
        console.warn(`🚫 [CRON] Sincronização de orders bloqueada por proteção contra crashes`);
        return;
      }
      
      console.log('🚀 [CRON] Iniciando sincronização de orders...');
      try {
        // Usa nova base de dados
        const url = `${this.baseUrl}/api/integration/orders-sync-new-base`;
        
        console.log(`📡 [CRON] Usando nova base de dados: ${url}`);
        
        const response = await axios.get(url, {
          timeout: 300000 // 5 minutos de timeout para orders
        });
        
        console.log('✅ [CRON] Sincronização de orders concluída:', response.status);
        
        // Log detalhado da resposta
        if (response.data && response.data.data) {
          const data = response.data.data;
          console.log(`📊 [CRON] Resumo da sincronização:`, {
            totalOrders: data.totalOrders,
            transformedOrders: data.transformedOrders,
            csvGenerated: data.csvResult?.success,
            emarsysSent: data.emarsysSendResult?.success,
            duration: data.duration
          });
        }
        
        // Resetar contador de crashes em caso de sucesso
        crashProtection.resetCrashCount(serviceName);
        
      } catch (error) {
        console.error('❌ [CRON] Erro na sincronização de orders:', error.message);
        console.error('❌ [CRON] Stack trace:', error.stack);
        
        // Registrar crash para proteção
        crashProtection.recordCrash(serviceName, error);
        
        // Log adicional para debug em produção
        if (process.env.NODE_ENV === 'production') {
          console.error(`❌ [PRODUCTION CRON ERROR] Orders sync failed:`, {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
          });
        }
      }
    }, null, true, 'America/Sao_Paulo');

    this.jobs.set('orders-sync', job);
    console.log('🕐 Cron de orders configurado: a cada 1 hora');
  }

  /**
   * Para todos os cron jobs
   */
  stopAll() {
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`🛑 Cron job ${name} parado`);
    });
  }

  /**
   * Retorna status de todos os jobs
   */
  getStatus() {
    const status = {};
    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.running,
        nextDates: job.nextDates(5).map(date => date.toISOString())
      };
    });
    return status;
  }

  /**
   * Para um job específico
   */
  stopJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      console.log(`🛑 Cron job ${jobName} parado`);
      return true;
    }
    return false;
  }

  /**
   * Inicia um job específico
   */
  startJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.start();
      console.log(`▶️ Cron job ${jobName} iniciado`);
      return true;
    }
    return false;
  }
}

module.exports = CronService;
