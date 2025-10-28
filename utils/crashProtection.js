/**
 * Sistema de proteção contra crashes e loops infinitos
 */

class CrashProtection {
  constructor() {
    this.crashCount = new Map();
    this.lastCrashTime = new Map();
    this.maxCrashesPerHour = 5;
    this.crashWindow = 60 * 60 * 1000; // 1 hora
  }

  /**
   * Verifica se um serviço pode executar (não está em loop de crash)
   * @param {string} serviceName - Nome do serviço
   * @returns {boolean} - true se pode executar, false se deve ser bloqueado
   */
  canExecute(serviceName) {
    const now = Date.now();
    const lastCrash = this.lastCrashTime.get(serviceName) || 0;
    const crashCount = this.crashCount.get(serviceName) || 0;

    // Se passou mais de 1 hora desde o último crash, resetar contador
    if (now - lastCrash > this.crashWindow) {
      this.crashCount.set(serviceName, 0);
      return true;
    }

    // Se excedeu o limite de crashes por hora, bloquear
    if (crashCount >= this.maxCrashesPerHour) {
      console.warn(`🚫 [CrashProtection] Serviço ${serviceName} bloqueado por excesso de crashes (${crashCount} em 1h)`);
      return false;
    }

    return true;
  }

  /**
   * Registra um crash de um serviço
   * @param {string} serviceName - Nome do serviço
   * @param {Error} error - Erro que causou o crash
   */
  recordCrash(serviceName, error) {
    const now = Date.now();
    const crashCount = this.crashCount.get(serviceName) || 0;
    
    this.crashCount.set(serviceName, crashCount + 1);
    this.lastCrashTime.set(serviceName, now);

    console.error(`💥 [CrashProtection] Crash registrado para ${serviceName}:`, {
      serviceName,
      crashCount: crashCount + 1,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Se excedeu o limite, log de alerta
    if (crashCount + 1 >= this.maxCrashesPerHour) {
      console.error(`🚨 [CrashProtection] ALERTA: Serviço ${serviceName} será bloqueado por 1 hora devido a ${crashCount + 1} crashes`);
    }
  }

  /**
   * Reseta o contador de crashes de um serviço
   * @param {string} serviceName - Nome do serviço
   */
  resetCrashCount(serviceName) {
    this.crashCount.set(serviceName, 0);
    this.lastCrashTime.set(serviceName, 0);
    console.log(`✅ [CrashProtection] Contador de crashes resetado para ${serviceName}`);
  }

  /**
   * Obtém estatísticas de crashes
   * @returns {Object} - Estatísticas de crashes
   */
  getStats() {
    const stats = {};
    for (const [serviceName, crashCount] of this.crashCount) {
      const lastCrash = this.lastCrashTime.get(serviceName);
      stats[serviceName] = {
        crashCount,
        lastCrash: lastCrash ? new Date(lastCrash).toISOString() : null,
        isBlocked: !this.canExecute(serviceName)
      };
    }
    return stats;
  }
}

// Instância global
const crashProtection = new CrashProtection();

module.exports = crashProtection;
