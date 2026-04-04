'use strict';

require('dotenv').config();

const { logger } = require('./utils/logger');
const CronService = require('./utils/cronService');

console.log('[worker] Iniciando worker de cron jobs...');
console.log('[worker] Timezone:', process.env.CRON_TIMEZONE || 'America/Sao_Paulo');
console.log('[worker] NODE_ENV:', process.env.NODE_ENV || 'development');

const cronService = new CronService();
cronService.startAll();

console.log('[worker] Cron jobs registrados. Worker ativo.');

process.on('SIGTERM', () => {
  logger.info('🛑 [worker] Recebido SIGTERM, parando cron jobs...');
  console.log('🛑 [worker] Recebido SIGTERM, parando cron jobs...');
  cronService.stopAll();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('🛑 [worker] Recebido SIGINT, parando cron jobs...');
  console.log('🛑 [worker] Recebido SIGINT, parando cron jobs...');
  cronService.stopAll();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('❌ [worker] Erro não capturado:', error);
  console.error('❌ [worker] Erro não capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('❌ [worker] Promise rejeitada não tratada:', { reason });
  console.error('❌ [worker] Promise rejeitada não tratada:', reason);
});
