const cron = require('cron');
const axios = require('axios');
const moment = require('moment-timezone');
const crashProtection = require('./crashProtection');
const { logHelpers } = require('./logger');
const contactRetryService = require('../services/contactRetryService');

class CronService {
  constructor() {
    this.jobs = new Map();
    // Em produção, usar a URL correta ao invés de localhost
    const isProduction = process.env.NODE_ENV === 'production';
    this.baseUrl = isProduction && process.env.BASE_URL 
      ? process.env.BASE_URL 
      : `http://localhost:${process.env.PORT || 3000}`;
    
    // Configurações de cron jobs via variáveis de ambiente
    // Trim para remover espaços em branco e validar se não está vazio
    const productsSyncCronRaw = process.env.PRODUCTS_SYNC_CRON;
    const ordersSyncCronRaw = process.env.ORDERS_SYNC_CRON;
    
    this.productsSyncCron = productsSyncCronRaw && productsSyncCronRaw.trim() 
      ? productsSyncCronRaw.trim() 
      : null;
    this.ordersSyncCron = ordersSyncCronRaw && ordersSyncCronRaw.trim() 
      ? ordersSyncCronRaw.trim() 
      : null;
    
    this.cronTimezone = process.env.CRON_TIMEZONE || 'America/Sao_Paulo';
    
    // Debug: Log das variáveis lidas (sem mostrar valores completos por segurança)
    if (this.productsSyncCron) {
      console.log(`✅ [CRON] PRODUCTS_SYNC_CRON carregado: ${this.productsSyncCron.substring(0, 20)}...`);
    } else {
      console.log(`⚠️ [CRON] PRODUCTS_SYNC_CRON não encontrado ou vazio. Valor raw: "${productsSyncCronRaw}"`);
    }
    
    if (this.ordersSyncCron) {
      console.log(`✅ [CRON] ORDERS_SYNC_CRON carregado: ${this.ordersSyncCron.substring(0, 20)}...`);
    } else {
      console.log(`⚠️ [CRON] ORDERS_SYNC_CRON não encontrado ou vazio. Valor raw: "${ordersSyncCronRaw}"`);
    }
    
    // Configurações de timeout otimizadas
    this.productsTimeout = parseInt(process.env.PRODUCTS_TIMEOUT_MS) || 600000; // 10 minutos
    this.ordersTimeout = parseInt(process.env.ORDERS_TIMEOUT_MS) || 900000; // 15 minutos
  }

  /**
   * Inicia todos os cron jobs
   */
  startAll() {
    let configuredCount = 0;
    
    if (this.productsSyncCron) {
      this.setupProductsSync();
      configuredCount++;
    } else {
      console.log('⚠️ [CRON] PRODUCTS_SYNC_CRON não definido - cron de produtos desabilitado');
    }
    
    if (this.ordersSyncCron) {
      this.setupOrdersSync();
      configuredCount++;
    } else {
      console.log('⚠️ [CRON] ORDERS_SYNC_CRON não definido - cron de orders desabilitado');
    }

    // Retry de contatos com falha — sempre ativo
    this.setupContactsRetry();
    configuredCount++;

    if (configuredCount > 0) {
      console.log(`🕐 ${configuredCount} cron job(s) configurado(s) e iniciado(s)`);
    } else {
      console.log('ℹ️ [CRON] Nenhum cron job configurado (variáveis de ambiente não definidas)');
    }
  }

  /**
   * Configura o cron para sincronização de produtos
   */
  setupProductsSync() {
    // Validar se a expressão cron está definida
    if (!this.productsSyncCron) {
      console.warn('⚠️ [CRON] PRODUCTS_SYNC_CRON não definido, pulando configuração de produtos');
      return;
    }
    
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
      
      const { fetchAllProductRows, fetchAllProductRowsResort } = require('../services/vtexProductService');
      const { generateCsv } = require('../helpers/csvHelper');
      const { uploadToSftp, uploadToSftpResort } = require('../helpers/sftpHelper');

      // Sync Hope (sempre)
      try {
        logHelpers.logProducts('info', '🚀 [hope] Iniciando sync direto VTEX → CSV → SFTP');
        const startedAt = Date.now();
        const rows = await fetchAllProductRows();
        const { filePath, fileName } = generateCsv(rows);
        await uploadToSftp(filePath, fileName);
        const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
        logHelpers.logProducts('info', `✅ [hope] Concluído em ${duration}s — ${rows.length} SKUs exportados`);
      } catch (error) {
        logHelpers.logProductsError(error, { serviceName, store: 'hope', cronExpression: this.productsSyncCron });
        crashProtection.recordCrash(serviceName, error);
        return;
      }

      // Sync Resort (somente se as credenciais estiverem configuradas)
      if (process.env.RESORT_VTEX_BASE_URL && process.env.RESORT_VTEX_APP_KEY) {
        try {
          logHelpers.logProducts('info', '🚀 [resort] Iniciando sync direto VTEX → CSV → SFTP');
          const startedAt = Date.now();
          const rows = await fetchAllProductRowsResort();
          const { filePath, fileName } = generateCsv(rows, 'product_resort.csv');
          await uploadToSftpResort(filePath, fileName);
          const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
          logHelpers.logProducts('info', `✅ [resort] Concluído em ${duration}s — ${rows.length} SKUs exportados`);
        } catch (resortError) {
          logHelpers.logProductsError(resortError, { serviceName: 'products-sync-resort', store: 'resort', cronExpression: this.productsSyncCron });
        }
      } else {
        logHelpers.logProducts('info', '⏭️ [resort] Sync Resort ignorado — RESORT_VTEX_BASE_URL ou RESORT_VTEX_APP_KEY não configurados');
      }

      crashProtection.resetCrashCount(serviceName);
    }, null, true, this.cronTimezone);

    this.jobs.set('products-sync', job);
    console.log(`🕐 Cron de produtos configurado: ${this.productsSyncCron} (${this.cronTimezone})`);
  }

  /**
   * Configura o cron para sincronização de orders usando o fluxo cron-orders (SQLite)
   * Usa a rota de background job para evitar timeout de 504
   */
  setupOrdersSync() {
    // Validar se a expressão cron está definida
    if (!this.ordersSyncCron) {
      console.warn('⚠️ [CRON] ORDERS_SYNC_CRON não definido, pulando configuração de orders');
      return;
    }
    
    // Cron expression configurável via variável de ambiente
    const job = new cron.CronJob(this.ordersSyncCron, async () => {
      const serviceName = 'orders-sync';
      
      // Verificar se o cron está desabilitado via variável de ambiente
      // Se ORDERS_SYNC_ENABLED=true, o cron é desativado/pulado
      const ordersSyncEnabledValue = process.env.ORDERS_SYNC_ENABLED;
      const ordersSyncDisabled = ordersSyncEnabledValue === 'true' || ordersSyncEnabledValue === true || ordersSyncEnabledValue === '1';
      if (ordersSyncDisabled) {
        console.log(`⏸️ [CRON] Sincronização de orders está desativada (ORDERS_SYNC_ENABLED=${ordersSyncEnabledValue})`);
        logHelpers.logOrders('info', '⏸️ [CRON] Sincronização de orders desativada', {
          reason: `ORDERS_SYNC_ENABLED=${ordersSyncEnabledValue}`,
          cronExpression: this.ordersSyncCron
        });
        return;
      }
      
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
        const timeout = 10000; // timeout curto pois a rota responde imediatamente

        // Hope (sempre)
        const hopeResponse = await axios.post(url, { ...payload, store: 'hope' }, {
          timeout,
          headers: { 'Content-Type': 'application/json' }
        });

        if (hopeResponse.data && hopeResponse.data.success) {
          const jobId = hopeResponse.data.jobId;
          logHelpers.logOrders('info', '✅ [hope] Job de sincronização de orders criado com sucesso', {
            jobId,
            checkStatusUrl: hopeResponse.data.checkStatus,
            status: hopeResponse.status,
            store: 'hope'
          });

          console.log(`✅ [CRON][hope] Job criado: ${jobId}`);
          console.log(`   📊 Acompanhe em: ${this.baseUrl}${hopeResponse.data.checkStatus}`);

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

        // Resort (só se credenciais VTEX de pedidos estiverem configuradas)
        if (process.env.VTEX_BASE_URL_RESORT_ORDERS && process.env.VTEX_APP_KEY_RESORT_ORDERS) {
          logHelpers.logOrders('info', '🚀 [resort] Iniciando sincronização de orders via CRON', {
            endpoint: url,
            store: 'resort'
          });

          try {
            const resortResponse = await axios.post(url, { ...payload, store: 'resort' }, {
              timeout,
              headers: { 'Content-Type': 'application/json' }
            });

            if (resortResponse.data && resortResponse.data.success) {
              logHelpers.logOrders('info', '✅ [resort] Job de sincronização de orders criado com sucesso', {
                jobId: resortResponse.data.jobId,
                checkStatusUrl: resortResponse.data.checkStatus,
                status: resortResponse.status,
                store: 'resort'
              });
              console.log(`✅ [CRON][resort] Job criado: ${resortResponse.data.jobId}`);
            }
          } catch (resortError) {
            logHelpers.logOrdersError(resortError, {
              serviceName: 'orders-sync-resort',
              store: 'resort',
              endpoint: url,
              cronExpression: this.ordersSyncCron
            });
          }
        } else {
          logHelpers.logOrders('info', '⏭️ [resort] Sync Resort de orders ignorado — VTEX_BASE_URL_RESORT_ORDERS ou VTEX_APP_KEY_RESORT_ORDERS não configurados');
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
    const ordersSyncEnabledValue = process.env.ORDERS_SYNC_ENABLED;
    const ordersSyncDisabled = ordersSyncEnabledValue === 'true' || ordersSyncEnabledValue === true || ordersSyncEnabledValue === '1';
    const status = ordersSyncDisabled ? '⏸️ DESATIVADO' : '▶️ ATIVO';
    console.log(`🕐 Cron de orders configurado: ${this.ordersSyncCron} (${this.cronTimezone}) [modo: background-job] [status: ${status}] [ORDERS_SYNC_ENABLED=${ordersSyncEnabledValue}]`);
  }

  /**
   * Configura o cron para retry de contatos com falha (a cada 5 minutos)
   */
  setupContactsRetry() {
    const contactsRetryCron = process.env.CONTACTS_RETRY_CRON || '*/5 * * * *';

    const job = new cron.CronJob(contactsRetryCron, async () => {
      const serviceName = 'contacts-retry';

      if (!crashProtection.canExecute(serviceName)) {
        console.warn('🚫 [CRON] Retry de contatos bloqueado por proteção contra crashes');
        return;
      }

      logHelpers.logClients('info', '🔄 [CRON] Iniciando retry de contatos com falha', {
        cronExpression: contactsRetryCron
      });

      try {
        const result = await contactRetryService.processFailedContacts();

        logHelpers.logClients('info', '✅ [CRON] Retry de contatos concluído', result);
        crashProtection.resetCrashCount(serviceName);
      } catch (error) {
        logHelpers.logClientsError(error, {
          serviceName,
          cronExpression: contactsRetryCron
        });
        crashProtection.recordCrash(serviceName, error);
      }
    }, null, true, this.cronTimezone);

    this.jobs.set('contacts-retry', job);
    console.log(`🕐 Cron de retry de contatos configurado: ${contactsRetryCron} (${this.cronTimezone})`);
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
