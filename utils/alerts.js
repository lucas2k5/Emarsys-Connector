const { logger } = require('./logger');
const fs = require('fs');
const path = require('path');

class AlertManager {
  constructor() {
    this.alerts = new Map();
    this.alertHistory = [];
    this.maxHistorySize = 1000;
    this.alertThresholds = {
      errorRate: 0.1, // 10% de taxa de erro
      responseTime: 5000, // 5 segundos
      memoryUsage: 0.9, // 90% de uso de memória
      diskSpace: 0.9, // 90% de uso de disco
      consecutiveErrors: 5, // 5 erros consecutivos
    };
    
    this.loadAlertHistory();
  }

  // Registrar um alerta
  registerAlert(alertType, severity, message, metadata = {}) {
    const alert = {
      id: this.generateAlertId(),
      type: alertType,
      severity, // 'low', 'medium', 'high', 'critical'
      message,
      metadata,
      timestamp: new Date().toISOString(),
      resolved: false,
    };

    this.alerts.set(alert.id, alert);
    this.alertHistory.push(alert);
    
    // Manter apenas os últimos N alertas
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(-this.maxHistorySize);
    }

    this.saveAlertHistory();
    this.processAlert(alert);
    
    return alert.id;
  }

  // Processar alerta baseado na severidade
  processAlert(alert) {
    const { severity, type, message, metadata } = alert;
    
    // Log do alerta
    logger.warn(`🚨 ALERTA [${severity.toUpperCase()}] ${type}: ${message}`, {
      alertId: alert.id,
      severity,
      type,
      metadata,
    });

    // Ações baseadas na severidade
    switch (severity) {
      case 'critical':
        this.handleCriticalAlert(alert);
        break;
      case 'high':
        this.handleHighAlert(alert);
        break;
      case 'medium':
        this.handleMediumAlert(alert);
        break;
      case 'low':
        this.handleLowAlert(alert);
        break;
    }
  }

  // Tratar alertas críticos
  handleCriticalAlert(alert) {
    // Log crítico
    logger.error(`🚨 ALERTA CRÍTICO: ${alert.message}`, {
      alertId: alert.id,
      metadata: alert.metadata,
    });

    // Aqui você pode adicionar notificações externas:
    // - Email
    // - Slack
    // - Discord
    // - Webhook
    // - SMS
    
    console.error(`🚨 ALERTA CRÍTICO: ${alert.message}`);
  }

  // Tratar alertas de alta prioridade
  handleHighAlert(alert) {
    logger.warn(`⚠️ ALERTA ALTO: ${alert.message}`, {
      alertId: alert.id,
      metadata: alert.metadata,
    });
    
    console.warn(`⚠️ ALERTA ALTO: ${alert.message}`);
  }

  // Tratar alertas médios
  handleMediumAlert(alert) {
    logger.info(`⚠️ ALERTA MÉDIO: ${alert.message}`, {
      alertId: alert.id,
      metadata: alert.metadata,
    });
  }

  // Tratar alertas baixos
  handleLowAlert(alert) {
    logger.info(`ℹ️ ALERTA BAIXO: ${alert.message}`, {
      alertId: alert.id,
      metadata: alert.metadata,
    });
  }

  // Verificar métricas e gerar alertas automáticos
  checkMetrics(metrics) {
    const { httpRequestErrors, httpRequestTotal, memoryUsage } = metrics;
    
    // Verificar taxa de erro
    if (httpRequestTotal > 0) {
      const errorRate = httpRequestErrors / httpRequestTotal;
      if (errorRate > this.alertThresholds.errorRate) {
        this.registerAlert(
          'high_error_rate',
          'high',
          `Taxa de erro alta: ${(errorRate * 100).toFixed(2)}%`,
          { errorRate, threshold: this.alertThresholds.errorRate }
        );
      }
    }

    // Verificar uso de memória
    if (memoryUsage > this.alertThresholds.memoryUsage) {
      this.registerAlert(
        'high_memory_usage',
        'critical',
        `Uso de memória alto: ${(memoryUsage * 100).toFixed(2)}%`,
        { memoryUsage, threshold: this.alertThresholds.memoryUsage }
      );
    }
  }

  // Verificar erros consecutivos
  checkConsecutiveErrors(errorCount) {
    if (errorCount >= this.alertThresholds.consecutiveErrors) {
      this.registerAlert(
        'consecutive_errors',
        'high',
        `${errorCount} erros consecutivos detectados`,
        { errorCount, threshold: this.alertThresholds.consecutiveErrors }
      );
    }
  }

  // Verificar tempo de resposta
  checkResponseTime(responseTime) {
    if (responseTime > this.alertThresholds.responseTime) {
      this.registerAlert(
        'slow_response',
        'medium',
        `Tempo de resposta lento: ${responseTime}ms`,
        { responseTime, threshold: this.alertThresholds.responseTime }
      );
    }
  }

  // Verificar espaço em disco
  checkDiskSpace() {
    try {
      const stats = fs.statSync(process.cwd());
      // Esta é uma implementação simplificada
      // Em produção, use uma biblioteca como 'diskusage'
      const diskUsage = 0.5; // Simulado
      
      if (diskUsage > this.alertThresholds.diskSpace) {
        this.registerAlert(
          'low_disk_space',
          'high',
          `Espaço em disco baixo: ${(diskUsage * 100).toFixed(2)}%`,
          { diskUsage, threshold: this.alertThresholds.diskSpace }
        );
      }
    } catch (error) {
      logger.error('Erro ao verificar espaço em disco:', error);
    }
  }

  // Resolver alerta
  resolveAlert(alertId, resolution = '') {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
      alert.resolution = resolution;
      
      logger.info(`✅ Alerta resolvido: ${alertId}`, {
        alertId,
        resolution,
        originalMessage: alert.message,
      });
      
      return true;
    }
    return false;
  }

  // Obter alertas ativos
  getActiveAlerts() {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  // Obter histórico de alertas
  getAlertHistory(limit = 50) {
    return this.alertHistory
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  // Obter estatísticas de alertas
  getAlertStats() {
    const total = this.alertHistory.length;
    const active = this.getActiveAlerts().length;
    const resolved = total - active;
    
    const bySeverity = this.alertHistory.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {});

    return {
      total,
      active,
      resolved,
      bySeverity,
      last24h: this.alertHistory.filter(alert => {
        const alertTime = new Date(alert.timestamp);
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return alertTime > dayAgo;
      }).length,
    };
  }

  // Gerar ID único para alerta
  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Salvar histórico de alertas
  saveAlertHistory() {
    try {
      const alertsDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(alertsDir)) {
        fs.mkdirSync(alertsDir, { recursive: true });
      }
      
      const filePath = path.join(alertsDir, 'alerts.json');
      fs.writeFileSync(filePath, JSON.stringify(this.alertHistory, null, 2));
    } catch (error) {
      logger.error('Erro ao salvar histórico de alertas:', error);
    }
  }

  // Carregar histórico de alertas
  loadAlertHistory() {
    try {
      const filePath = path.join(process.cwd(), 'data', 'alerts.json');
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        this.alertHistory = JSON.parse(data);
        
        // Reconstruir mapa de alertas ativos
        this.alertHistory.forEach(alert => {
          if (!alert.resolved) {
            this.alerts.set(alert.id, alert);
          }
        });
      }
    } catch (error) {
      logger.error('Erro ao carregar histórico de alertas:', error);
      this.alertHistory = [];
    }
  }

  // Limpar alertas antigos
  cleanupOldAlerts(daysOld = 30) {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const initialCount = this.alertHistory.length;
    
    this.alertHistory = this.alertHistory.filter(alert => {
      const alertDate = new Date(alert.timestamp);
      return alertDate > cutoffDate;
    });
    
    const removedCount = initialCount - this.alertHistory.length;
    if (removedCount > 0) {
      logger.info(`🧹 Limpeza de alertas: ${removedCount} alertas antigos removidos`);
      this.saveAlertHistory();
    }
  }
}

// Instância singleton
const alertManager = new AlertManager();

// Limpeza automática de alertas antigos a cada 24 horas
setInterval(() => {
  alertManager.cleanupOldAlerts(30);
}, 24 * 60 * 60 * 1000);

module.exports = alertManager;
