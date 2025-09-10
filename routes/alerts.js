const express = require('express');
const router = express.Router();
const alertManager = require('../utils/alerts');
const { logger } = require('../utils/logger');

// Rota para listar alertas ativos
router.get('/active', (req, res) => {
  try {
    const activeAlerts = alertManager.getActiveAlerts();
    
    res.json({
      success: true,
      data: {
        total: activeAlerts.length,
        alerts: activeAlerts
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao obter alertas ativos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter alertas ativos',
      detail: error.message
    });
  }
});

// Rota para obter histórico de alertas
router.get('/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = alertManager.getAlertHistory(limit);
    
    res.json({
      success: true,
      data: {
        total: history.length,
        alerts: history
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao obter histórico de alertas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter histórico de alertas',
      detail: error.message
    });
  }
});

// Rota para obter estatísticas de alertas
router.get('/stats', (req, res) => {
  try {
    const stats = alertManager.getAlertStats();
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas de alertas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter estatísticas de alertas',
      detail: error.message
    });
  }
});

// Rota para resolver um alerta
router.post('/:alertId/resolve', (req, res) => {
  try {
    const { alertId } = req.params;
    const { resolution = '' } = req.body;
    
    const resolved = alertManager.resolveAlert(alertId, resolution);
    
    if (resolved) {
      res.json({
        success: true,
        message: 'Alerta resolvido com sucesso',
        alertId,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Alerta não encontrado',
        alertId
      });
    }
  } catch (error) {
    logger.error('Erro ao resolver alerta:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao resolver alerta',
      detail: error.message
    });
  }
});

// Rota para criar um alerta manual
router.post('/', (req, res) => {
  try {
    const { type, severity, message, metadata = {} } = req.body;
    
    if (!type || !severity || !message) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: type, severity, message'
      });
    }
    
    const validSeverities = ['low', 'medium', 'high', 'critical'];
    if (!validSeverities.includes(severity)) {
      return res.status(400).json({
        success: false,
        error: 'Severidade deve ser: low, medium, high ou critical'
      });
    }
    
    const alertId = alertManager.registerAlert(type, severity, message, metadata);
    
    res.status(201).json({
      success: true,
      message: 'Alerta criado com sucesso',
      data: {
        alertId,
        type,
        severity,
        message,
        metadata
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao criar alerta:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao criar alerta',
      detail: error.message
    });
  }
});

// Rota para limpar alertas antigos
router.post('/cleanup', (req, res) => {
  try {
    const { daysOld = 30 } = req.body;
    
    alertManager.cleanupOldAlerts(daysOld);
    
    res.json({
      success: true,
      message: `Limpeza de alertas concluída (${daysOld} dias)`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao limpar alertas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao limpar alertas',
      detail: error.message
    });
  }
});

// Dashboard de alertas
router.get('/dashboard', (req, res) => {
  const dashboardHTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard de Alertas - Emarsys Server</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            color: white;
            margin-bottom: 30px;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: white;
            border-radius: 10px;
            padding: 20px;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 5px;
        }
        
        .stat-label {
            color: #666;
            font-size: 0.9rem;
        }
        
        .alerts-section {
            background: white;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        
        .alert-item {
            border-left: 4px solid #ddd;
            padding: 15px;
            margin-bottom: 10px;
            background: #f9f9f9;
            border-radius: 0 5px 5px 0;
        }
        
        .alert-item.critical {
            border-left-color: #e74c3c;
            background: #fdf2f2;
        }
        
        .alert-item.high {
            border-left-color: #f39c12;
            background: #fef9e7;
        }
        
        .alert-item.medium {
            border-left-color: #f1c40f;
            background: #fffbf0;
        }
        
        .alert-item.low {
            border-left-color: #3498db;
            background: #f0f8ff;
        }
        
        .alert-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .alert-type {
            font-weight: bold;
            color: #333;
        }
        
        .alert-severity {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: bold;
            text-transform: uppercase;
        }
        
        .severity-critical {
            background: #e74c3c;
            color: white;
        }
        
        .severity-high {
            background: #f39c12;
            color: white;
        }
        
        .severity-medium {
            background: #f1c40f;
            color: #333;
        }
        
        .severity-low {
            background: #3498db;
            color: white;
        }
        
        .alert-message {
            color: #666;
            margin-bottom: 10px;
        }
        
        .alert-meta {
            font-size: 0.8rem;
            color: #999;
        }
        
        .resolve-btn {
            background: #27ae60;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 0.8rem;
        }
        
        .resolve-btn:hover {
            background: #229954;
        }
        
        .refresh-btn {
            background: #3498db;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1rem;
            margin: 10px;
        }
        
        .refresh-btn:hover {
            background: #2980b9;
        }
        
        .loading {
            text-align: center;
            color: #666;
            font-style: italic;
        }
        
        .no-alerts {
            text-align: center;
            color: #27ae60;
            font-size: 1.2rem;
            padding: 40px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 Dashboard de Alertas</h1>
            <p>Monitoramento de alertas em tempo real</p>
        </div>
        
        <div style="text-align: center; margin-bottom: 20px;">
            <button class="refresh-btn" onclick="loadAlerts()">🔄 Atualizar</button>
        </div>
        
        <div class="stats-grid" id="statsGrid">
            <div class="loading">Carregando estatísticas...</div>
        </div>
        
        <div class="alerts-section">
            <h2>Alertas Ativos</h2>
            <div id="alertsList">
                <div class="loading">Carregando alertas...</div>
            </div>
        </div>
    </div>

    <script>
        async function loadAlerts() {
            try {
                // Carregar estatísticas
                const statsResponse = await fetch('/api/alerts/stats');
                const statsData = await statsResponse.json();
                
                if (statsData.success) {
                    displayStats(statsData.data);
                }
                
                // Carregar alertas ativos
                const alertsResponse = await fetch('/api/alerts/active');
                const alertsData = await alertsResponse.json();
                
                if (alertsData.success) {
                    displayAlerts(alertsData.data.alerts);
                }
            } catch (error) {
                console.error('Erro ao carregar alertas:', error);
                document.getElementById('alertsList').innerHTML = 
                    '<div class="error">Erro ao carregar alertas: ' + error.message + '</div>';
            }
        }
        
        function displayStats(stats) {
            const grid = document.getElementById('statsGrid');
            grid.innerHTML = \`
                <div class="stat-card">
                    <div class="stat-value">\${stats.total}</div>
                    <div class="stat-label">Total de Alertas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">\${stats.active}</div>
                    <div class="stat-label">Alertas Ativos</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">\${stats.resolved}</div>
                    <div class="stat-label">Resolvidos</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">\${stats.last24h}</div>
                    <div class="stat-label">Últimas 24h</div>
                </div>
            \`;
        }
        
        function displayAlerts(alerts) {
            const container = document.getElementById('alertsList');
            
            if (alerts.length === 0) {
                container.innerHTML = '<div class="no-alerts">✅ Nenhum alerta ativo</div>';
                return;
            }
            
            container.innerHTML = alerts.map(alert => \`
                <div class="alert-item \${alert.severity}">
                    <div class="alert-header">
                        <span class="alert-type">\${alert.type}</span>
                        <span class="alert-severity severity-\${alert.severity}">\${alert.severity}</span>
                    </div>
                    <div class="alert-message">\${alert.message}</div>
                    <div class="alert-meta">
                        ID: \${alert.id} | \${new Date(alert.timestamp).toLocaleString('pt-BR')}
                    </div>
                    <button class="resolve-btn" onclick="resolveAlert('\${alert.id}')">Resolver</button>
                </div>
            \`).join('');
        }
        
        async function resolveAlert(alertId) {
            try {
                const response = await fetch(\`/api/alerts/\${alertId}/resolve\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        resolution: 'Resolvido via dashboard'
                    })
                });
                
                if (response.ok) {
                    loadAlerts(); // Recarregar alertas
                } else {
                    alert('Erro ao resolver alerta');
                }
            } catch (error) {
                console.error('Erro ao resolver alerta:', error);
                alert('Erro ao resolver alerta: ' + error.message);
            }
        }
        
        // Carregar alertas automaticamente a cada 30 segundos
        loadAlerts();
        setInterval(loadAlerts, 30000);
    </script>
</body>
</html>
  `;
  
  res.send(dashboardHTML);
});

module.exports = router;
