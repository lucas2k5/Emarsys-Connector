/**
 * CONFIGURAÇÃO DE EXEMPLO DO SISTEMA DE MONITORAMENTO
 * 
 * Copie este arquivo para config/monitoring.js e ajuste conforme necessário
 */

module.exports = {
  // Configuração de Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    maxFiles: 30, // dias
    maxSize: '20m',
    datePattern: 'YYYY-MM-DD',
    
    // Diretórios de log
    directories: {
      logs: 'logs',
      data: 'data'
    },
    
    // Configuração de transportes
    transports: {
      console: {
        enabled: true,
        level: process.env.LOG_LEVEL || 'info'
      },
      file: {
        enabled: true,
        level: 'info',
        filename: 'logs/application-%DATE%.log'
      },
      error: {
        enabled: true,
        level: 'error',
        filename: 'logs/error-%DATE%.log',
        maxFiles: 30
      },
      http: {
        enabled: true,
        level: 'http',
        filename: 'logs/http-%DATE%.log',
        maxFiles: 7
      },
      metrics: {
        enabled: true,
        level: 'info',
        filename: 'logs/metrics-%DATE%.log',
        maxFiles: 30
      },
      audit: {
        enabled: true,
        level: 'info',
        filename: 'logs/audit-%DATE%.log',
        maxFiles: 90
      }
    }
  },

  // Configuração de Métricas
  metrics: {
    // Intervalo de atualização das métricas de memória (ms)
    memoryUpdateInterval: 30000,
    
    // Buckets para histogramas
    buckets: {
      http: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
      integration: [0.1, 0.5, 1, 2, 5, 10, 30],
      background: [1, 5, 10, 30, 60, 300, 600],
      file: [1024, 10240, 102400, 1048576, 10485760, 104857600]
    }
  },

  // Configuração de Alertas
  alerts: {
    // Thresholds para alertas automáticos
    thresholds: {
      errorRate: parseFloat(process.env.ALERT_ERROR_RATE) || 0.1, // 10%
      responseTime: parseInt(process.env.ALERT_RESPONSE_TIME) || 5000, // 5s
      memoryUsage: parseFloat(process.env.ALERT_MEMORY_USAGE) || 0.9, // 90%
      diskSpace: 0.9, // 90%
      consecutiveErrors: parseInt(process.env.ALERT_CONSECUTIVE_ERRORS) || 5
    },
    
    // Configuração de retenção
    retention: {
      maxHistorySize: 1000,
      cleanupDays: 30
    },
    
    // Configuração de notificações (futuro)
    notifications: {
      email: {
        enabled: false,
        smtp: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        },
        from: process.env.SMTP_FROM,
        to: process.env.SMTP_TO
      },
      slack: {
        enabled: false,
        webhook: process.env.SLACK_WEBHOOK_URL,
        channel: process.env.SLACK_CHANNEL || '#alerts'
      }
    }
  },

  // Configuração de Dashboards
  dashboards: {
    metrics: {
      refreshInterval: 30000, // 30s
      maxDataPoints: 100
    },
    alerts: {
      refreshInterval: 30000, // 30s
      autoRefresh: true
    }
  },

  // Configuração de Monitoramento
  monitoring: {
    // Middleware de monitoramento
    middleware: {
      enabled: true,
      skipPaths: ['/health', '/api/metrics/prometheus']
    },
    
    // Monitoramento de operações assíncronas
    asyncOperations: {
      enabled: true,
      logSlowOperations: true,
      slowOperationThreshold: 5000 // 5s
    },
    
    // Monitoramento de integrações
    integrations: {
      enabled: true,
      timeout: 30000, // 30s
      retryAttempts: 3
    }
  }
};
