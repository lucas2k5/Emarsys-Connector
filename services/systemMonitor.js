/**
 * Serviço de monitoramento de recursos do sistema
 * Monitora CPU, memória, disco e detecta falhas por recursos físicos
 */

const os = require('os');
const fs = require('fs-extra');
const path = require('path');
const { getBrazilianTimestamp } = require('../utils/dateUtils');
const { logHelpers } = require('../utils/logger');

class SystemMonitor {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data');
    this.monitorFile = path.join(this.dataDir, 'system-monitor.json');
    this.restartLogFile = path.join(this.dataDir, 'restart-log.json');
    
    // Thresholds de alerta
    this.thresholds = {
      memory: {
        warning: 80, // 80% de uso de memória
        critical: 90 // 90% de uso de memória
      },
      cpu: {
        warning: 80, // 80% de uso de CPU
        critical: 95 // 95% de uso de CPU
      },
      disk: {
        warning: 85, // 85% de uso de disco
        critical: 95 // 95% de uso de disco
      }
    };

    // Histórico de métricas
    this.metricsHistory = [];
    this.maxHistorySize = 100; // Manter últimas 100 medições

    this.initializeMonitoring();
  }

  /**
   * Inicializa o monitoramento
   */
  async initializeMonitoring() {
    try {
      await this.ensureDataDirectory();
      await this.logSystemRestart();
      this.startPeriodicMonitoring();
    } catch (error) {
      console.error('❌ Erro ao inicializar monitoramento:', error);
    }
  }

  /**
   * Log de reinicialização do sistema
   */
  async logSystemRestart() {
    try {
      const restartInfo = {
        timestamp: getBrazilianTimestamp(),
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        memoryUsage: process.memoryUsage(),
        systemInfo: {
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          cpus: os.cpus().length,
          loadAverage: os.loadavg(),
          hostname: os.hostname(),
          uptime: os.uptime()
        }
      };

      // Salva log de reinicialização
      let restartLog = [];
      if (await fs.pathExists(this.restartLogFile)) {
        restartLog = await fs.readJson(this.restartLogFile);
      }

      restartLog.push(restartInfo);
      
      // Mantém apenas os últimos 50 reinicializações
      if (restartLog.length > 50) {
        restartLog = restartLog.slice(-50);
      }

      await fs.writeJson(this.restartLogFile, restartLog, { spaces: 2 });

      // Log estruturado
      logHelpers.logAlert('system-restart', 'info', 'Sistema reinicializado', {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        systemUptime: os.uptime()
      });

      console.log('🔄 Sistema reinicializado - Log salvo');
    } catch (error) {
      console.error('❌ Erro ao logar reinicialização:', error);
    }
  }

  /**
   * Inicia monitoramento periódico
   */
  startPeriodicMonitoring() {
    // Monitora a cada 30 segundos
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Log de status a cada 5 minutos
    setInterval(() => {
      this.logSystemStatus();
    }, 300000);

    console.log('📊 Monitoramento de sistema iniciado');
  }

  /**
   * Coleta métricas do sistema
   */
  async collectSystemMetrics() {
    try {
      const metrics = {
        timestamp: getBrazilianTimestamp(),
        process: {
          pid: process.pid,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        },
        system: {
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          usedMemory: os.totalmem() - os.freemem(),
          memoryUsagePercent: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
          loadAverage: os.loadavg(),
          cpus: os.cpus().length,
          uptime: os.uptime()
        },
        disk: await this.getDiskUsage()
      };

      // Adiciona ao histórico
      this.metricsHistory.push(metrics);
      if (this.metricsHistory.length > this.maxHistorySize) {
        this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
      }

      // Verifica alertas
      await this.checkAlerts(metrics);

      // Salva métricas
      await this.saveMetrics(metrics);

    } catch (error) {
      console.error('❌ Erro ao coletar métricas:', error);
    }
  }

  /**
   * Obtém uso de disco
   */
  async getDiskUsage() {
    try {
      const stats = await fs.stat(this.dataDir);
      // Implementação simplificada - em produção usar biblioteca como 'node-disk-info'
      return {
        total: 0,
        free: 0,
        used: 0,
        usagePercent: 0
      };
    } catch (error) {
      return {
        total: 0,
        free: 0,
        used: 0,
        usagePercent: 0,
        error: error.message
      };
    }
  }

  /**
   * Verifica alertas de recursos
   */
  async checkAlerts(metrics) {
    const { memoryUsagePercent, loadAverage } = metrics.system;
    const { heapUsed, heapTotal } = metrics.process.memoryUsage;

    // Alerta de memória do sistema
    if (memoryUsagePercent >= this.thresholds.memory.critical) {
      logHelpers.logAlert('memory-critical', 'critical', 
        `Memória crítica: ${memoryUsagePercent.toFixed(1)}%`, {
          memoryUsagePercent,
          totalMemory: metrics.system.totalMemory,
          freeMemory: metrics.system.freeMemory
        });
    } else if (memoryUsagePercent >= this.thresholds.memory.warning) {
      logHelpers.logAlert('memory-warning', 'warning', 
        `Memória alta: ${memoryUsagePercent.toFixed(1)}%`, {
          memoryUsagePercent,
          totalMemory: metrics.system.totalMemory,
          freeMemory: metrics.system.freeMemory
        });
    }

    // Alerta de heap do processo
    const heapUsagePercent = (heapUsed / heapTotal) * 100;
    if (heapUsagePercent >= 90) {
      logHelpers.logAlert('heap-critical', 'critical', 
        `Heap crítica: ${heapUsagePercent.toFixed(1)}%`, {
          heapUsed,
          heapTotal,
          heapUsagePercent
        });
    }

    // Alerta de load average
    const load1min = loadAverage[0];
    const cpuCount = os.cpus().length;
    const loadPercent = (load1min / cpuCount) * 100;
    
    if (loadPercent >= 100) {
      logHelpers.logAlert('load-critical', 'critical', 
        `Load crítico: ${load1min.toFixed(2)} (${loadPercent.toFixed(1)}%)`, {
          load1min,
          load5min: loadAverage[1],
          load15min: loadAverage[2],
          cpuCount,
          loadPercent
        });
    }
  }

  /**
   * Salva métricas no arquivo
   */
  async saveMetrics(metrics) {
    try {
      let monitorData = { lastUpdate: getBrazilianTimestamp(), metrics: [] };
      
      if (await fs.pathExists(this.monitorFile)) {
        monitorData = await fs.readJson(this.monitorFile);
      }

      monitorData.metrics.push(metrics);
      
      // Mantém apenas as últimas 24 horas de métricas
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      monitorData.metrics = monitorData.metrics.filter(m => 
        new Date(m.timestamp) > cutoffTime
      );

      monitorData.lastUpdate = getBrazilianTimestamp();
      await fs.writeJson(this.monitorFile, monitorData, { spaces: 2 });

    } catch (error) {
      console.error('❌ Erro ao salvar métricas:', error);
    }
  }

  /**
   * Log de status do sistema
   */
  async logSystemStatus() {
    try {
      const currentMetrics = this.metricsHistory[this.metricsHistory.length - 1];
      if (!currentMetrics) return;

      const { memoryUsagePercent, loadAverage } = currentMetrics.system;
      const { heapUsed, heapTotal } = currentMetrics.process.memoryUsage;
      const heapUsagePercent = (heapUsed / heapTotal) * 100;

      logHelpers.logSync('system-status', 'info', {
        memoryUsage: `${memoryUsagePercent.toFixed(1)}%`,
        heapUsage: `${heapUsagePercent.toFixed(1)}%`,
        loadAverage: loadAverage[0].toFixed(2),
        uptime: `${Math.floor(currentMetrics.process.uptime / 3600)}h ${Math.floor((currentMetrics.process.uptime % 3600) / 60)}m`
      });

    } catch (error) {
      console.error('❌ Erro ao logar status:', error);
    }
  }

  /**
   * Obtém estatísticas do sistema
   */
  async getSystemStats() {
    try {
      const currentMetrics = this.metricsHistory[this.metricsHistory.length - 1];
      const restartLog = await fs.readJson(this.restartLogFile).catch(() => []);
      
      return {
        current: currentMetrics,
        history: this.metricsHistory.slice(-10), // Últimas 10 medições
        restarts: restartLog.slice(-5), // Últimos 5 reinicializações
        thresholds: this.thresholds,
        uptime: process.uptime(),
        systemUptime: os.uptime()
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error);
      return null;
    }
  }

  /**
   * Detecta falhas por recursos físicos
   */
  detectResourceFailure() {
    const currentMetrics = this.metricsHistory[this.metricsHistory.length - 1];
    if (!currentMetrics) return null;

    const { memoryUsagePercent, loadAverage } = currentMetrics.system;
    const { heapUsed, heapTotal } = currentMetrics.process.memoryUsage;
    const heapUsagePercent = (heapUsed / heapTotal) * 100;

    const failures = [];

    // Falha por memória
    if (memoryUsagePercent >= 95) {
      failures.push({
        type: 'memory-exhaustion',
        severity: 'critical',
        message: `Memória do sistema esgotada: ${memoryUsagePercent.toFixed(1)}%`,
        metrics: { memoryUsagePercent }
      });
    }

    // Falha por heap
    if (heapUsagePercent >= 95) {
      failures.push({
        type: 'heap-exhaustion',
        severity: 'critical',
        message: `Heap do processo esgotada: ${heapUsagePercent.toFixed(1)}%`,
        metrics: { heapUsagePercent, heapUsed, heapTotal }
      });
    }

    // Falha por load
    const load1min = loadAverage[0];
    const cpuCount = os.cpus().length;
    if (load1min > cpuCount * 2) {
      failures.push({
        type: 'cpu-overload',
        severity: 'critical',
        message: `CPU sobrecarregada: Load ${load1min.toFixed(2)} (${cpuCount} CPUs)`,
        metrics: { load1min, cpuCount }
      });
    }

    return failures.length > 0 ? failures : null;
  }

  /**
   * Garante que o diretório de dados existe
   */
  async ensureDataDirectory() {
    await fs.ensureDir(this.dataDir);
  }
}

module.exports = SystemMonitor;
