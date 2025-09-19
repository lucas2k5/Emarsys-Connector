/**
 * Utilitário para otimização de memória
 * Fornece ferramentas para monitoramento e limpeza de memória
 */

class MemoryOptimizer {
  constructor() {
    this.lastMemoryCheck = Date.now();
    this.memoryThreshold = 0.85; // 85% da memória disponível
  }

  /**
   * Obtém informações atuais de memória
   * @returns {Object} Informações de memória
   */
  getMemoryInfo() {
    const usage = process.memoryUsage();
    const total = require('os').totalmem();
    const free = require('os').freemem();
    const used = total - free;
    
    return {
      heap: {
        used: Math.round(usage.heapUsed / 1024 / 1024), // MB
        total: Math.round(usage.heapTotal / 1024 / 1024), // MB
        percentage: Math.round((usage.heapUsed / usage.heapTotal) * 100)
      },
      system: {
        used: Math.round(used / 1024 / 1024), // MB
        total: Math.round(total / 1024 / 1024), // MB
        free: Math.round(free / 1024 / 1024), // MB
        percentage: Math.round((used / total) * 100)
      },
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024) // MB
    };
  }

  /**
   * Verifica se a memória está próxima do limite
   * @returns {boolean} True se a memória está alta
   */
  isMemoryHigh() {
    const info = this.getMemoryInfo();
    return info.system.percentage > (this.memoryThreshold * 100);
  }

  /**
   * Força garbage collection se disponível
   */
  forceGarbageCollection() {
    if (global.gc) {
      console.log('🧹 Executando garbage collection manual...');
      const beforeMem = this.getMemoryInfo();
      global.gc();
      const afterMem = this.getMemoryInfo();
      
      const heapFreed = beforeMem.heap.used - afterMem.heap.used;
      console.log(`   📊 Memória heap liberada: ${heapFreed}MB`);
      console.log(`   📊 Heap atual: ${afterMem.heap.used}MB / ${afterMem.heap.total}MB (${afterMem.heap.percentage}%)`);
      
      return heapFreed;
    } else {
      console.warn('⚠️ Garbage collection não está disponível. Execute com --expose-gc');
      return 0;
    }
  }

  /**
   * Monitora memória e executa GC se necessário
   */
  checkAndOptimize() {
    const info = this.getMemoryInfo();
    
    console.log(`📊 Memória atual: Heap ${info.heap.used}MB/${info.heap.total}MB (${info.heap.percentage}%) | Sistema ${info.system.used}MB/${info.system.total}MB (${info.system.percentage}%)`);
    
    if (this.isMemoryHigh()) {
      console.log('⚠️ Uso de memória alto detectado, executando otimização...');
      this.forceGarbageCollection();
      
      // Verifica novamente após GC
      const newInfo = this.getMemoryInfo();
      if (newInfo.system.percentage > (this.memoryThreshold * 100)) {
        console.warn('🚨 ALERTA: Memória ainda alta após garbage collection!');
        console.warn(`   Sistema: ${newInfo.system.percentage}% (limite: ${this.memoryThreshold * 100}%)`);
      }
    }
  }

  /**
   * Inicia monitoramento automático de memória
   * @param {number} intervalMs - Intervalo em milissegundos (padrão: 30 segundos)
   */
  startMonitoring(intervalMs = 30000) {
    console.log(`🔍 Iniciando monitoramento de memória (intervalo: ${intervalMs/1000}s)`);
    
    this.monitoringInterval = setInterval(() => {
      this.checkAndOptimize();
    }, intervalMs);
  }

  /**
   * Para o monitoramento automático
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('🛑 Monitoramento de memória parado');
    }
  }

  /**
   * Otimiza memória durante processamento de lotes
   * @param {number} currentBatch - Lote atual
   * @param {number} totalBatches - Total de lotes
   * @param {number} gcInterval - Intervalo para executar GC (padrão: a cada 10 lotes)
   */
  optimizeBatchProcessing(currentBatch, totalBatches, gcInterval = 10) {
    if (currentBatch > 0 && currentBatch % gcInterval === 0) {
      console.log(`🔄 Lote ${currentBatch}/${totalBatches} - Executando otimização de memória...`);
      this.forceGarbageCollection();
    }
  }

  /**
   * Cria um wrapper para funções que consomem muita memória
   * @param {Function} fn - Função a ser executada
   * @param {string} name - Nome da operação (para logs)
   * @returns {Function} Função com otimização de memória
   */
  wrapMemoryIntensive(fn, name = 'Operação') {
    return async (...args) => {
      console.log(`🚀 Iniciando ${name} com otimização de memória...`);
      const beforeMem = this.getMemoryInfo();
      
      try {
        const result = await fn(...args);
        
        const afterMem = this.getMemoryInfo();
        const memoryIncrease = afterMem.heap.used - beforeMem.heap.used;
        
        console.log(`✅ ${name} concluída`);
        console.log(`   📊 Memória utilizada: +${memoryIncrease}MB`);
        
        // Executa GC se houve aumento significativo de memória
        if (memoryIncrease > 100) { // Mais de 100MB
          console.log('🧹 Aumento significativo de memória detectado, executando GC...');
          this.forceGarbageCollection();
        }
        
        return result;
      } catch (error) {
        console.error(`❌ Erro em ${name}:`, error.message);
        // Executa GC mesmo em caso de erro para liberar memória
        this.forceGarbageCollection();
        throw error;
      }
    };
  }
}

module.exports = MemoryOptimizer;
