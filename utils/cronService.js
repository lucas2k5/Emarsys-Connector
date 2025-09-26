const cron = require('cron');
const axios = require('axios');
const moment = require('moment-timezone');
const crashProtection = require('./crashProtection');
const { logHelpers } = require('./logger');

class CronService {
  constructor() {
    this.jobs = new Map();
    this.baseUrl = `http://localhost:${process.env.PORT || 3000}`;
    
    // Configurações de cron jobs via variáveis de ambiente
    this.productsSyncCron = process.env.PRODUCTS_SYNC_CRON || '0 */8 * * *';
    this.ordersSyncCron = process.env.ORDERS_SYNC_CRON || '*/8 * * * *';
    this.cronTimezone = process.env.CRON_TIMEZONE || 'America/Sao_Paulo';
    
    // Configurações de timeout otimizadas
    this.productsTimeout = parseInt(process.env.PRODUCTS_TIMEOUT_MS) || 600000; // 10 minutos
    this.ordersTimeout = parseInt(process.env.ORDERS_TIMEOUT_MS) || 900000; // 15 minutos
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
      
      logHelpers.logProducts('info', '🚀 Iniciando sincronização de produtos via CRON', {
        cronExpression: this.productsSyncCron,
        timeout: this.productsTimeout
      });
      
      try {
        // Timeout otimizado para operações de produtos
        const response = await axios.get(`${this.baseUrl}/api/vtex/products/sync`, {
          timeout: this.productsTimeout
        });
        
        logHelpers.logProducts('info', '✅ Sincronização de produtos concluída com sucesso', {
          status: response.status,
          statusText: response.statusText
        });
        
        // Resetar contador de crashes em caso de sucesso
        crashProtection.resetCrashCount(serviceName);
      } catch (error) {
        // Log específico para produtos com contexto detalhado
        logHelpers.logProductsError(error, {
          serviceName,
          endpoint: `${this.baseUrl}/api/vtex/products/sync`,
          timeout: this.productsTimeout,
          cronExpression: this.productsSyncCron
        });
        
        // Registrar crash para proteção
        crashProtection.recordCrash(serviceName, error);
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
      
      // Define período do dia anterior completo no fuso de São Paulo
      const now = moment().tz('America/Sao_Paulo');
      const yesterday = now.clone().subtract(1, 'day').format('YYYY-MM-DD');

      const url = `${this.baseUrl}/api/integration/orders-extract-all`;
      const params = { brazilianDate: yesterday, startTime: '00:00', endTime: '23:59', per_page: 100 };

      logHelpers.logOrders('info', '🚀 Iniciando sincronização de orders via CRON', {
        endpoint: url,
        params,
        cronExpression: this.ordersSyncCron,
        timeout: this.ordersTimeout
      });
      
      try {
        const response = await axios.get(url, { params, timeout: this.ordersTimeout });
        
        logHelpers.logOrders('info', '✅ Sincronização de orders concluída com sucesso', {
          status: response.status,
          statusText: response.statusText
        });
        
        // Log detalhado da resposta
        if (response.data && response.data.data) {
          const data = response.data.data;
          logHelpers.logOrders('info', '📊 Resumo da sincronização de orders', {
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
        // Log específico para orders com contexto detalhado
        logHelpers.logOrdersError(error, {
          serviceName,
          endpoint: url,
          params,
          timeout: this.ordersTimeout,
          cronExpression: this.ordersSyncCron
        });
        
        // Registrar crash para proteção
        crashProtection.recordCrash(serviceName, error);
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
