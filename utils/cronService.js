const cron = require('cron');
const axios = require('axios');
const moment = require('moment');

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
      console.log('🚀 [CRON] Iniciando sincronização de produtos...');
      try {
        const response = await axios.get(`${this.baseUrl}/api/vtex/products/sync`, {
          timeout: 30000
        });
        console.log('✅ [CRON] Sincronização de produtos concluída:', response.status);
      } catch (error) {
        console.error('❌ [CRON] Erro na sincronização de produtos:', error.message);
      }
    }, null, true, 'America/Sao_Paulo');

    this.jobs.set('products-sync', job);
    console.log('🕐 Cron de produtos configurado: a cada 8 horas');
  }

  /**
   * Configura o cron para sincronização de orders a cada 5 horas
   */
  setupOrdersSync() {
    // Cron expression: 0 */5 * * * (a cada 5 horas)
    const job = new cron.CronJob('0 */5 * * *', async () => {
      console.log('🚀 [CRON] Iniciando sincronização de orders...');
      try {
        // Calcula o período das últimas 5 horas
        const now = moment().utc();
        const fiveHoursAgo = moment().utc().subtract(5, 'hours').add(1, 'second');
        
        const startDate = fiveHoursAgo.toISOString();
        const toDate = now.toISOString();
        
        const url = `${this.baseUrl}/api/integration/orders-extract-all?batching=true&startDate=${encodeURIComponent(startDate)}&toDate=${encodeURIComponent(toDate)}`;
        
        console.log(`📅 [CRON] Período: ${startDate} até ${toDate}`);
        
        const response = await axios.get(url, {
          timeout: 300000 // 5 minutos de timeout para orders
        });
        
        console.log('✅ [CRON] Sincronização de orders concluída:', response.status);
      } catch (error) {
        console.error('❌ [CRON] Erro na sincronização de orders:', error.message);
      }
    }, null, true, 'America/Sao_Paulo');

    this.jobs.set('orders-sync', job);
    console.log('🕐 Cron de orders configurado: a cada 5 horas');
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
