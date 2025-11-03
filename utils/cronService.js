const cron = require('cron');
const axios = require('axios');
const moment = require('moment-timezone');
const crashProtection = require('./crashProtection');
const { logHelpers } = require('./logger');

class CronService {
  constructor() {
    this.jobs = new Map();
    // Em produção, usar a URL correta ao invés de localhost
    const isProduction = process.env.NODE_ENV === 'production';
    this.baseUrl = isProduction && process.env.BASE_URL 
      ? process.env.BASE_URL 
      : `http://localhost:${process.env.PORT || 3000}`;
    
    // Configurações de cron jobs via variáveis de ambiente
    this.productsSyncCron = process.env.PRODUCTS_SYNC_CRON;
    this.ordersSyncCron = process.env.ORDERS_SYNC_CRON;
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
   * Usa a rota de background job para evitar timeout de 504
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
      
      // Calcula o período com base em ORDERS_SYNC_CRON (ex.: a cada 2h)
      // e envia explicitamente startDate/toDate para a rota.
      const { calculatePeriodFromCron, calculateNextExecution } = require('./cronPeriodCalculator');
      const moment = require('moment-timezone');
      
      console.log('📅 [CRON] Calculando período da extração...');
      console.log(`   🕐 Horário atual (São Paulo): ${moment().tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss')}`);
      console.log(`   🕐 Horário atual (UTC): ${moment().utc().format('DD/MM/YYYY HH:mm:ss')}`);
      console.log(`   ⚙️ Expressão do cron: ${this.ordersSyncCron}`);
      
      const period = calculatePeriodFromCron();
      const nextExecution = calculateNextExecution();
      
      if (period) {
        const startSP = moment(period.startDate).tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss');
        const endSP = moment(period.toDate).tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss');
        console.log('📅 [CRON] Período calculado:');
        console.log(`   🇧🇷 São Paulo: ${startSP} até ${endSP}`);
        console.log(`   🌍 UTC: ${period.startDate} até ${period.toDate}`);
        console.log(`   📝 Tipo: ${period.type}`);
      }
      
      logHelpers.logOrders('info', '🔗 [CRON] Período atual calculado', { period });
      logHelpers.logOrders('info', '🔗 [CRON] Próximo período calculado', { nextExecution });
      
      // NOVA ROTA: Usar /cron-orders que usa ordersSyncService (SQLite)
      const url = `${this.baseUrl}/api/background/cron-orders`;
      const payload = period
        ? { startDate: period.startDate, toDate: period.toDate, maxOrders: 100 }
        : { maxOrders: 100 };

      logHelpers.logOrders('info', '🚀 Iniciando sincronização de orders via CRON (cron-orders com SQLite)', {
        endpoint: url,
        payload,
        cronExpression: this.ordersSyncCron,
        mode: 'cron-orders-sqlite',
        service: 'ordersSyncService',
        maxOrders: 100
      });
      
      try {
        // POST para rota de background job (responde imediatamente com jobId)
        const response = await axios.post(url, payload, { 
          timeout: 10000, // timeout curto pois a rota responde imediatamente
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.data && response.data.success) {
          const jobId = response.data.jobId;
          logHelpers.logOrders('info', '✅ Job de sincronização de orders criado com sucesso', {
            jobId,
            checkStatusUrl: response.data.checkStatus,
            status: response.status
          });
          
          console.log(`✅ [CRON] Job criado: ${jobId}`);
          console.log(`   📊 Acompanhe em: ${this.baseUrl}${response.data.checkStatus}`);
          
          // Exibir previsão da próxima execução
          if (nextExecution) {
            const nextDate = moment(nextExecution.nextExecution).tz('America/Sao_Paulo');
            const nextDateFormatted = nextDate.format('DD/MM/YYYY [às] HH:mm:ss');
            
            console.log(`⏰ [CRON] O próximo cron de pedidos será executado dia ${nextDateFormatted}`);
            
            logHelpers.logOrders('info', '⏰ Previsão da próxima extração', {
              nextExecution: nextExecution.nextExecution,
              nextExecutionFormatted: nextDateFormatted,
              description: nextExecution.description,
              timeUntilNext: `${Math.floor(nextExecution.timeUntilNext / 60)}h ${nextExecution.timeUntilNext % 60}min`,
              interval: nextExecution.interval,
              cronExpression: this.ordersSyncCron,
              nextExecution: `Próxima execução em ${nextDateFormatted}`
            });
          }
        }
        
        // Resetar contador de crashes em caso de sucesso
        crashProtection.resetCrashCount(serviceName);
        
      } catch (error) {
        // Log específico para orders com contexto detalhado
        logHelpers.logOrdersError(error, {
          serviceName,
          endpoint: url,
          payload,
          timeout: 10000,
          cronExpression: this.ordersSyncCron,
          mode: 'background-job'
        });
        
        // Registrar crash para proteção
        crashProtection.recordCrash(serviceName, error);
      }
    }, null, true, this.cronTimezone);

    this.jobs.set('orders-sync', job);
    console.log(`🕐 Cron de orders configurado: ${this.ordersSyncCron} (${this.cronTimezone}) [modo: background-job]`);
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
