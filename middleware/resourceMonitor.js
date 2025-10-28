/**
 * Middleware para monitoramento de recursos em tempo real
 * Captura falhas por recursos físicos durante requisições
 */

const { logHelpers } = require('../utils/logger');
const { getBrazilianTimestamp } = require('../utils/dateUtils');

class ResourceMonitor {
  constructor() {
    this.requestCount = 0;
    this.errorCount = 0;
    this.startTime = Date.now();
  }

  /**
   * Middleware para monitorar recursos durante requisições
   */
  monitorResources() {
    return (req, res, next) => {
      const startTime = Date.now();
      const startMemory = process.memoryUsage();
      
      this.requestCount++;

      // Intercepta a resposta para capturar métricas
      const originalSend = res.send;
      res.send = function(data) {
        const endTime = Date.now();
        const endMemory = process.memoryUsage();
        const responseTime = endTime - startTime;
        
        // Calcula uso de memória durante a requisição
        const memoryDelta = {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          external: endMemory.external - startMemory.external,
          rss: endMemory.rss - startMemory.rss
        };

        // Log de performance se a requisição for lenta
        if (responseTime > 5000) { // Mais de 5 segundos
          logHelpers.logAlert('slow-request', 'warning', 
            `Requisição lenta detectada: ${responseTime}ms`, {
              method: req.method,
              url: req.originalUrl,
              responseTime,
              memoryDelta,
              statusCode: res.statusCode
            });
        }

        // Log de uso excessivo de memória
        if (memoryDelta.heapUsed > 50 * 1024 * 1024) { // Mais de 50MB
          logHelpers.logAlert('high-memory-request', 'warning', 
            `Alto uso de memória na requisição: ${(memoryDelta.heapUsed / 1024 / 1024).toFixed(1)}MB`, {
              method: req.method,
              url: req.originalUrl,
              memoryDelta,
              responseTime
            });
        }

        // Chama o método original
        return originalSend.call(this, data);
      };

      // Intercepta erros
      const originalJson = res.json;
      res.json = function(data) {
        if (res.statusCode >= 400) {
          // Não contar 404 como erro crítico - são rotas não encontradas normais
          if (res.statusCode === 404) {
            // Log como info para rota não encontrada
            console.log('ℹ️ Rota não encontrada:', req.originalUrl);
          } else if (res.statusCode >= 500) {
            // Apenas erros 5xx são considerados falhas críticas
            ResourceMonitor.prototype.errorCount++;
            
            logHelpers.logFailure('request-error', new Error(`HTTP ${res.statusCode}`), {
              method: req.method,
              url: req.originalUrl,
              headers: req.headers,
              body: req.body,
              query: req.query
            }, {
              responseTime: Date.now() - startTime,
              memoryUsage: process.memoryUsage(),
              requestCount: ResourceMonitor.prototype.requestCount,
              errorCount: ResourceMonitor.prototype.errorCount
            });
          } else {
            // Log de erro 4xx como warning, não como falha crítica
            logHelpers.logAlert('client-error', 'warning', `Erro do cliente: HTTP ${res.statusCode}`, {
              method: req.method,
              url: req.originalUrl,
              statusCode: res.statusCode,
              responseTime: Date.now() - startTime
            });
          }
        }
        
        return originalJson.call(this, data);
      };

      next();
    };
  }

  /**
   * Middleware para capturar erros não tratados
   */
  errorHandler() {
    return (error, req, res, next) => {
      this.errorCount++;

      // Log detalhado do erro com contexto de recursos
      logHelpers.logFailure('unhandled-error', error, {
        method: req.method,
        url: req.originalUrl,
        headers: req.headers,
        body: req.body,
        query: req.query,
        params: req.params
      }, {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        requestCount: this.requestCount,
        errorCount: this.errorCount,
        timestamp: getBrazilianTimestamp()
      });

      // Resposta de erro
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        timestamp: getBrazilianTimestamp(),
        requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      });
    };
  }

  /**
   * Middleware para detectar falhas por recursos físicos
   */
  resourceFailureDetector() {
    return (req, res, next) => {
      const memoryUsage = process.memoryUsage();
      const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      
      // Se heap estiver muito alta, pode indicar vazamento de memória (reduzido de 90% para 80%)
      if (heapUsagePercent > 80) {
        logHelpers.logAlert('heap-critical', 'critical', 
          `Heap crítica detectada: ${heapUsagePercent.toFixed(1)}%`, {
            heapUsed: memoryUsage.heapUsed,
            heapTotal: memoryUsage.heapTotal,
            external: memoryUsage.external,
            rss: memoryUsage.rss,
            method: req.method,
            url: req.originalUrl
          });
      }

      // Se RSS estiver muito alto, pode indicar problema de memória (reduzido de 1GB para 800MB)
      if (memoryUsage.rss > 800 * 1024 * 1024) { // Mais de 800MB
        logHelpers.logAlert('rss-high', 'warning', 
          `RSS alto: ${(memoryUsage.rss / 1024 / 1024).toFixed(1)}MB`, {
            rss: memoryUsage.rss,
            heapUsed: memoryUsage.heapUsed,
            method: req.method,
            url: req.originalUrl
          });
      }

      next();
    };
  }

  /**
   * Obtém estatísticas de requisições
   */
  getStats() {
    const uptime = Date.now() - this.startTime;
    const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;
    
    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: errorRate.toFixed(2),
      uptime: uptime,
      requestsPerMinute: this.requestCount / (uptime / 60000),
      memoryUsage: process.memoryUsage(),
      processUptime: process.uptime()
    };
  }
}

module.exports = ResourceMonitor;
