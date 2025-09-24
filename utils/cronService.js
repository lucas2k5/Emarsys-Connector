const cron = require('cron');
const axios = require('axios');
const moment = require('moment-timezone');
const crashProtection = require('./crashProtection');

class CronService {
  constructor() {
    this.jobs = new Map();
    this.baseUrl = `http://localhost:${process.env.PORT || 3000}`;
    
    // Configurações de cron jobs via variáveis de ambiente
    this.productsSyncCron = process.env.PRODUCTS_SYNC_CRON || '0 */8 * * *';
    this.ordersSyncCron = process.env.ORDERS_SYNC_CRON || '*/8 * * * *';
    this.cronTimezone = process.env.CRON_TIMEZONE || 'America/Sao_Paulo';
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
   * Configura o cron para sincronização de produtos
   */
  setupProductsSync() {
    // Cron expression configurável via variável de ambiente
    const job = new cron.CronJob(this.productsSyncCron, async () => {
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
    }, null, true, this.cronTimezone);

    this.jobs.set('products-sync', job);
    console.log(`🕐 Cron de produtos configurado: ${this.productsSyncCron} (${this.cronTimezone})`);
  }

  /**
   * Configura o cron para sincronização de orders usando o fluxo orders-extract-all (dia anterior)
   */
  setupOrdersSync() {
    // Cron expression configurável via variável de ambiente
    const job = new cron.CronJob(this.ordersSyncCron, async () => {
      const serviceName = 'orders-sync';
      
      // Verificar se o serviço pode executar (proteção contra loops)
      if (!crashProtection.canExecute(serviceName)) {
        console.warn(`🚫 [CRON] Sincronização de orders bloqueada por proteção contra crashes`);
        return;
      }
      
      console.log('🚀 [CRON] Iniciando sincronização de orders (orders-extract-all)...');
      try {
        // Define período do dia anterior completo no fuso de São Paulo
        const now = moment().tz('America/Sao_Paulo');
        const yesterday = now.clone().subtract(1, 'day').format('YYYY-MM-DD');

        const url = `${this.baseUrl}/api/integration/orders-extract-all`;
        const params = { brazilianDate: yesterday, startTime: '00:00', endTime: '23:59', per_page: 100 };

        console.log(`📡 [CRON] Endpoint: ${url}`);
        console.log('🗓️ [CRON] Período (Brasil):', params);

        const response = await axios.get(url, { params, timeout: 300000 });
        
        console.log('✅ [CRON] Sincronização de orders concluída:', response.status);
        
        // Log detalhado da resposta
        if (response.data && response.data.data) {
          const data = response.data.data;
          console.log(`📊 [CRON] Resumo:`, {
            totalOrdersDetailed: data.totalOrdersDetailed,
            period: data.period,
            perPage: data.perPage,
            useBatching: data.useBatching,
            syncSuccess: data.summary?.syncSuccess
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
    }, null, true, this.cronTimezone);

    this.jobs.set('orders-sync', job);
    console.log(`🕐 Cron de orders configurado: ${this.ordersSyncCron} (${this.cronTimezone})`);
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
