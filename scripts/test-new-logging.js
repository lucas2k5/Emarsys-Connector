#!/usr/bin/env node

/**
 * Script para testar a nova estrutura de logs
 */

const { 
  logger, 
  ordersLogger, 
  productsLogger, 
  clientsLogger,
  metricsLogger,
  auditLogger,
  logHelpers 
} = require('../utils/logger');

console.log('🧪 Testando nova estrutura de logs...\n');

// Teste 1: Logs gerais do sistema
console.log('1️⃣ Testando logs gerais do sistema...');
logger.info('🚀 Teste de log geral do sistema', {
  test: 'sistema',
  timestamp: new Date().toISOString()
});

// Teste 2: Logs de erro
console.log('2️⃣ Testando logs de erro...');
logger.error('❌ Teste de erro', {
  test: 'erro',
  error: 'Erro simulado para teste',
  stack: 'Stack trace simulado'
});

// Teste 3: Logs HTTP
console.log('3️⃣ Testando logs HTTP...');
logger.http('🌐 Teste de requisição HTTP', {
  test: 'http',
  method: 'GET',
  url: '/api/test',
  statusCode: 200,
  responseTime: '150ms'
});

// Teste 4: Logs de sincronização
console.log('4️⃣ Testando logs de sincronização...');
logger.log('sync', '🔄 Teste de sincronização', {
  test: 'sync',
  operation: 'sync_test',
  recordsProcessed: 100
});

// Teste 5: Logs de reprocessamento
console.log('5️⃣ Testando logs de reprocessamento...');
logger.log('retry', '🔄 Teste de reprocessamento', {
  test: 'retry',
  attempt: 1,
  maxAttempts: 3
});

// Teste 6: Logs de alertas
console.log('6️⃣ Testando logs de alertas...');
logger.log('alert', '🚨 Teste de alerta', {
  test: 'alert',
  severity: 'warning',
  message: 'Alerta simulado para teste'
});

// Teste 7: Logs de métricas
console.log('7️⃣ Testando logs de métricas...');
logHelpers.logMetric('test_metric', 123, { 
  test: 'metrics',
  category: 'performance' 
});

// Teste 8: Logs de auditoria
console.log('8️⃣ Testando logs de auditoria...');
logHelpers.logAudit('test_action', 'test_user', {
  test: 'audit',
  resource: 'test_resource',
  action: 'read'
});

// Teste 9: Logs específicos de pedidos
console.log('9️⃣ Testando logs de pedidos...');
ordersLogger.info('📦 Teste de log de pedidos', {
  test: 'orders',
  orderId: 'TEST-123',
  status: 'processed'
});

// Teste 10: Logs específicos de produtos
console.log('🔟 Testando logs de produtos...');
productsLogger.info('🏷️ Teste de log de produtos', {
  test: 'products',
  productId: 'PROD-456',
  action: 'updated'
});

// Teste 11: Logs específicos de clientes
console.log('1️⃣1️⃣ Testando logs de clientes...');
clientsLogger.info('👤 Teste de log de clientes', {
  test: 'clients',
  clientId: 'CLIENT-789',
  action: 'created'
});

console.log('\n✅ Todos os testes de log foram executados!');
console.log('📁 Verifique a pasta logs/ para ver os novos arquivos gerados.');
console.log('🎯 Os logs agora seguem o padrão: tipo-DD-MM-YYYY.log');
