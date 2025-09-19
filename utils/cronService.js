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
   * Configura o cron para sincronização de orders a cada 2 horas
   */
  setupOrdersSync() {
    // Cron expression: 0 */2 * * * (a cada 2 horas)
    const job = new cron.CronJob('0 */2 * * *', async () => {
      console.log('🚀 [CRON] Iniciando sincronização de orders...');
      try {
        // Calcula o período das últimas 2 horas SEM sobreposição
        const now = moment().utc();
        
        // Busca última sincronização para evitar sobreposição
        let startDate;
        try {
          const lastSyncResponse = await axios.get(`${this.baseUrl}/api/integration/last-sync`, {
            timeout: 10000
          });
          
          if (lastSyncResponse.data && lastSyncResponse.data.data && lastSyncResponse.data.data.lastSync) {
            // Usa timestamp da última sincronização + 1 segundo para evitar duplicatas
            startDate = moment(lastSyncResponse.data.data.lastSync).utc().add(1, 'second').toISOString();
            console.log(`📅 [CRON] Usando último sync como base: ${startDate}`);
          } else {
            throw new Error('Nenhum sync anterior encontrado');
          }
        } catch (syncError) {
          console.warn('⚠️ [CRON] Não foi possível obter último sync, usando período de 2h:', syncError.message);
          // Fallback: últimas 2 horas
          startDate = now.clone().subtract(2, 'hours').toISOString();
        }
        
        const toDate = now.toISOString();
        
        const url = `${this.baseUrl}/api/integration/orders-extract-all?batching=true&startDate=${encodeURIComponent(startDate)}&toDate=${encodeURIComponent(toDate)}`;
        
        console.log(`📅 [CRON] Período sem sobreposição: ${startDate} até ${toDate}`);
        
        const response = await axios.get(url, {
          timeout: 300000 // 5 minutos de timeout para orders
        });
        
        console.log('✅ [CRON] Sincronização de orders concluída:', response.status);
      } catch (error) {
        console.error('❌ [CRON] Erro na sincronização de orders:', error.message);
      }
    }, null, true, 'America/Sao_Paulo');

    this.jobs.set('orders-sync', job);
    console.log('🕐 Cron de orders configurado: a cada 2 horas (sem sobreposição)');
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
