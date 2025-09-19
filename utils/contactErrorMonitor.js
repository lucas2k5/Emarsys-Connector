const fs = require('fs').promises;
const path = require('path');

class ContactErrorMonitor {
  constructor() {
    this.errorLogPath = path.join(__dirname, '../data/contact-errors.json');
    this.statsPath = path.join(__dirname, '../data/contact-error-stats.json');
  }

  /**
   * Registra um erro de contato para análise
   * @param {Object} errorData - Dados do erro
   */
  async logContactError(errorData) {
    try {
      const errorLog = {
        timestamp: new Date().toISOString(),
        email: errorData.email ? this.maskEmail(errorData.email) : 'unknown',
        errorType: errorData.errorType || 'UNKNOWN',
        errorMessage: errorData.errorMessage || 'Unknown error',
        status: errorData.status,
        retryable: errorData.retryable || false,
        attempts: errorData.attempts || 1,
        payload: errorData.payload ? this.maskPayload(errorData.payload) : null,
        stack: errorData.stack || null
      };

      // Lê o arquivo de log existente
      let errors = [];
      try {
        const data = await fs.readFile(this.errorLogPath, 'utf8');
        errors = JSON.parse(data);
      } catch (err) {
        // Arquivo não existe ou está corrompido, começa com array vazio
        errors = [];
      }

      // Adiciona o novo erro
      errors.push(errorLog);

      // Mantém apenas os últimos 1000 erros para evitar arquivo muito grande
      if (errors.length > 1000) {
        errors = errors.slice(-1000);
      }

      // Salva o arquivo atualizado
      await fs.writeFile(this.errorLogPath, JSON.stringify(errors, null, 2));

      // Atualiza estatísticas
      await this.updateErrorStats(errorData);

    } catch (err) {
      console.error('❌ Erro ao registrar erro de contato:', err.message);
    }
  }

  /**
   * Atualiza estatísticas de erros
   * @param {Object} errorData - Dados do erro
   */
  async updateErrorStats(errorData) {
    try {
      let stats = {
        totalErrors: 0,
        errorsByType: {},
        errorsByHour: {},
        retryableErrors: 0,
        lastUpdated: new Date().toISOString()
      };

      // Lê estatísticas existentes
      try {
        const data = await fs.readFile(this.statsPath, 'utf8');
        stats = JSON.parse(data);
      } catch (err) {
        // Arquivo não existe, usa estatísticas padrão
      }

      // Atualiza contadores
      stats.totalErrors++;
      stats.lastUpdated = new Date().toISOString();

      // Conta por tipo de erro
      const errorType = errorData.errorType || 'UNKNOWN';
      stats.errorsByType[errorType] = (stats.errorsByType[errorType] || 0) + 1;

      // Conta por hora
      const hour = new Date().getHours();
      stats.errorsByHour[hour] = (stats.errorsByHour[hour] || 0) + 1;

      // Conta erros retryable
      if (errorData.retryable) {
        stats.retryableErrors++;
      }

      // Salva estatísticas atualizadas
      await fs.writeFile(this.statsPath, JSON.stringify(stats, null, 2));

    } catch (err) {
      console.error('❌ Erro ao atualizar estatísticas:', err.message);
    }
  }

  /**
   * Obtém estatísticas de erros
   * @returns {Object} Estatísticas de erros
   */
  async getErrorStats() {
    try {
      const data = await fs.readFile(this.statsPath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      return {
        totalErrors: 0,
        errorsByType: {},
        errorsByHour: {},
        retryableErrors: 0,
        lastUpdated: null
      };
    }
  }

  /**
   * Obtém erros recentes
   * @param {number} limit - Número máximo de erros a retornar
   * @returns {Array} Lista de erros recentes
   */
  async getRecentErrors(limit = 50) {
    try {
      const data = await fs.readFile(this.errorLogPath, 'utf8');
      const errors = JSON.parse(data);
      return errors.slice(-limit).reverse(); // Mais recentes primeiro
    } catch (err) {
      return [];
    }
  }

  /**
   * Analisa padrões de erro
   * @returns {Object} Análise de padrões
   */
  async analyzeErrorPatterns() {
    try {
      const stats = await this.getErrorStats();
      const recentErrors = await this.getRecentErrors(100);

      const analysis = {
        totalErrors: stats.totalErrors,
        retryableRate: stats.totalErrors > 0 ? (stats.retryableErrors / stats.totalErrors * 100).toFixed(2) : 0,
        topErrorTypes: Object.entries(stats.errorsByType)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([type, count]) => ({ type, count })),
        peakErrorHour: Object.entries(stats.errorsByHour)
          .sort(([,a], [,b]) => b - a)[0],
        recentTrend: this.calculateRecentTrend(recentErrors),
        recommendations: this.generateRecommendations(stats, recentErrors)
      };

      return analysis;
    } catch (err) {
      console.error('❌ Erro ao analisar padrões:', err.message);
      return null;
    }
  }

  /**
   * Calcula tendência recente de erros
   * @param {Array} recentErrors - Erros recentes
   * @returns {string} Tendência (increasing, decreasing, stable)
   */
  calculateRecentTrend(recentErrors) {
    if (recentErrors.length < 10) return 'insufficient_data';

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const lastHour = recentErrors.filter(e => new Date(e.timestamp) > oneHourAgo).length;
    const previousHour = recentErrors.filter(e => {
      const time = new Date(e.timestamp);
      return time > twoHoursAgo && time <= oneHourAgo;
    }).length;

    if (lastHour > previousHour * 1.2) return 'increasing';
    if (lastHour < previousHour * 0.8) return 'decreasing';
    return 'stable';
  }

  /**
   * Gera recomendações baseadas nos padrões de erro
   * @param {Object} stats - Estatísticas de erro
   * @param {Array} recentErrors - Erros recentes
   * @returns {Array} Lista de recomendações
   */
  generateRecommendations(stats, recentErrors) {
    const recommendations = [];

    // Alta taxa de erros retryable
    const retryableRate = stats.totalErrors > 0 ? (stats.retryableErrors / stats.totalErrors) : 0;
    if (retryableRate > 0.5) {
      recommendations.push({
        type: 'retry_optimization',
        priority: 'high',
        message: 'Alta taxa de erros retryable. Considere aumentar o delay entre tentativas ou implementar backoff exponencial.'
      });
    }

    // Muitos erros de validação
    if (stats.errorsByType.VALIDATION_ERROR > stats.totalErrors * 0.3) {
      recommendations.push({
        type: 'validation_improvement',
        priority: 'medium',
        message: 'Muitos erros de validação. Revise a validação de dados antes do envio.'
      });
    }

    // Muitos erros de rede
    if (stats.errorsByType.NETWORK_ERROR > stats.totalErrors * 0.2) {
      recommendations.push({
        type: 'network_optimization',
        priority: 'medium',
        message: 'Muitos erros de rede. Considere implementar circuit breaker ou aumentar timeouts.'
      });
    }

    // Tendência crescente
    const trend = this.calculateRecentTrend(recentErrors);
    if (trend === 'increasing') {
      recommendations.push({
        type: 'monitoring_alert',
        priority: 'high',
        message: 'Tendência crescente de erros. Monitore de perto e considere investigar a causa raiz.'
      });
    }

    return recommendations;
  }

  /**
   * Mascara email para privacidade
   * @param {string} email - Email original
   * @returns {string} Email mascarado
   */
  maskEmail(email) {
    if (!email || !email.includes('@')) return '***';
    const [user, domain] = email.split('@');
    return `${user.slice(0, 2)}***@${domain}`;
  }

  /**
   * Mascara payload para privacidade
   * @param {Object} payload - Payload original
   * @returns {Object} Payload mascarado
   */
  maskPayload(payload) {
    const masked = { ...payload };
    if (masked['3']) masked['3'] = this.maskEmail(masked['3']);
    if (masked['15']) masked['15'] = String(masked['15']).replace(/\d(?=\d{2})/g, '*');
    if (masked['37']) masked['37'] = String(masked['37']).replace(/\d(?=\d{2})/g, '*');
    if (masked['4']) masked['4'] = '****-**-**';
    if (masked['13']) masked['13'] = String(masked['13']).replace(/\d(?=\d{2})/g, '*');
    return masked;
  }

  /**
   * Limpa logs antigos
   * @param {number} daysToKeep - Número de dias para manter
   */
  async cleanupOldLogs(daysToKeep = 7) {
    try {
      const data = await fs.readFile(this.errorLogPath, 'utf8');
      const errors = JSON.parse(data);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const filteredErrors = errors.filter(error => 
        new Date(error.timestamp) > cutoffDate
      );
      
      await fs.writeFile(this.errorLogPath, JSON.stringify(filteredErrors, null, 2));
      console.log(`🧹 Limpeza de logs: ${errors.length - filteredErrors.length} erros antigos removidos`);
      
    } catch (err) {
      console.error('❌ Erro ao limpar logs antigos:', err.message);
    }
  }
}

module.exports = ContactErrorMonitor;
