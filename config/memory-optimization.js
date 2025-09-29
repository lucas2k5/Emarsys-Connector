/**
 * Configurações de otimização de memória para aplicação Emarsys
 * Ajustadas para servidor com 4GB de RAM
 */

module.exports = {
  // Configurações de memória Node.js
  nodeMemory: {
    maxOldSpaceSize: 3072, // 3GB (75% da RAM disponível)
    exposeGC: true,
    maxMemoryRestart: '3G'
  },

  // Configurações de processamento
  processing: {
    maxOrdersPerExecution: 200, // Limite de pedidos por execução
    batchSize: 50, // Tamanho do lote padrão
    batchDays: 3, // Dias por lote (reduzido de 7)
    processingDelay: 1000, // Delay entre requisições (ms)
    gcInterval: 10, // Executar GC a cada N pedidos
    maxConcurrentRequests: 3 // Máximo de requisições simultâneas
  },

  // Configurações de timeout
  timeouts: {
    requestTimeout: 30000, // 30 segundos
    processingTimeout: 300000, // 5 minutos para processamento completo
    retryDelay: 2000, // 2 segundos entre tentativas
    maxRetries: 3
  },

  // Configurações de monitoramento
  monitoring: {
    memoryThreshold: 0.8, // 80% de uso de memória
    heapThreshold: 0.9, // 90% de uso do heap
    alertInterval: 60000 // 1 minuto entre alertas
  },

  // Configurações de batching inteligente
  batching: {
    enableAutoBatching: true,
    smallPeriodThreshold: 7, // Dias (reduzido de 30)
    largePeriodThreshold: 30,
    maxBatchSize: 100,
    batchDelay: 2000 // 2 segundos entre lotes
  }
};
