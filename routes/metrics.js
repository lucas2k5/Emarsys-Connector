const express = require('express');
const router = express.Router();
const { getMetrics, getMetricsAsJSON } = require('../utils/metrics');
const { logger } = require('../utils/logger');

// Rota para métricas em formato Prometheus
router.get('/prometheus', async (req, res) => {
  try {
    const metrics = await getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (error) {
    logger.error('Erro ao obter métricas Prometheus:', error);
    res.status(500).json({ error: 'Erro ao obter métricas' });
  }
});

// Rota para métricas em formato JSON
router.get('/json', async (req, res) => {
  try {
    const metrics = await getMetricsAsJSON();
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Erro ao obter métricas JSON:', error);
    res.status(500).json({ error: 'Erro ao obter métricas' });
  }
});

// Dashboard básico de métricas
router.get('/dashboard', (req, res) => {
  const dashboardHTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard de Métricas - Emarsys Server</title>
    <link rel="icon" type="image/x-icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📊</text></svg>">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
        
        .header p {
            font-size: 1.1rem;
            opacity: 0.9;
        }
        
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .metric-card {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
        }
        
        .metric-card:hover {
            transform: translateY(-5px);
        }
        
        .metric-title {
            font-size: 1.2rem;
            font-weight: bold;
            color: #333;
            margin-bottom: 15px;
            border-bottom: 2px solid #667eea;
            padding-bottom: 5px;
        }
        
        .metric-value {
            font-size: 2rem;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 10px;
        }
        
        .metric-description {
            color: #666;
            font-size: 0.9rem;
        }
        
        .refresh-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1rem;
            margin: 10px;
            transition: background 0.3s ease;
        }
        
        .refresh-btn:hover {
            background: #5a6fd8;
        }
        
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .status-online {
            background: #4CAF50;
        }
        
        .status-offline {
            background: #f44336;
        }
        
        .loading {
            text-align: center;
            color: #666;
            font-style: italic;
        }
        
        .error {
            color: #f44336;
            background: #ffebee;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
        }
        
        .timestamp {
            text-align: center;
            color: white;
            opacity: 0.8;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Dashboard de Métricas</h1>
            <p>Monitoramento em tempo real do Emarsys Server</p>
            <div>
                <span class="status-indicator status-online"></span>
                <span>Servidor Online</span>
            </div>
        </div>
        
        <div style="text-align: center; margin-bottom: 20px;">
            <button class="refresh-btn" id="refreshBtn">🔄 Atualizar Métricas</button>
            <button class="refresh-btn" id="prometheusBtn">📈 Ver Métricas Prometheus</button>
        </div>
        
        <div class="metrics-grid" id="metricsGrid">
            <div class="loading">Carregando métricas...</div>
        </div>
        
        <div class="timestamp" id="timestamp"></div>
    </div>

    <script>
        // Função para carregar métricas
        async function loadMetrics() {
            const grid = document.getElementById('metricsGrid');
            const timestamp = document.getElementById('timestamp');
            
            try {
                grid.innerHTML = '<div class="loading">Carregando métricas...</div>';
                
                const response = await fetch('/api/metrics/json');
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                }
                
                const data = await response.json();
                
                if (data.success && data.data) {
                    displayMetrics(data.data);
                    timestamp.textContent = 'Última atualização: ' + new Date().toLocaleString('pt-BR');
                } else {
                    throw new Error(data.error || 'Erro ao carregar métricas');
                }
            } catch (error) {
                console.error('Erro ao carregar métricas:', error);
                grid.innerHTML = '<div class="error">Erro ao carregar métricas: ' + error.message + '</div>';
            }
        }
        
        function displayMetrics(metrics) {
            const grid = document.getElementById('metricsGrid');
            grid.innerHTML = '';
            
            // Agrupar métricas por tipo
            const groupedMetrics = {};
            
            metrics.forEach(metric => {
                const type = metric.name.split('_')[0];
                if (!groupedMetrics[type]) {
                    groupedMetrics[type] = [];
                }
                groupedMetrics[type].push(metric);
            });
            
            // Criar cards para cada tipo de métrica
            Object.keys(groupedMetrics).forEach(type => {
                const card = createMetricCard(type, groupedMetrics[type]);
                grid.appendChild(card);
            });
        }
        
        function createMetricCard(type, metrics) {
            const card = document.createElement('div');
            card.className = 'metric-card';
            
            let title = '';
            let description = '';
            let totalValue = 0;
            
            switch(type) {
                case 'http':
                    title = '🌐 Requisições HTTP';
                    description = 'Total de requisições processadas';
                    totalValue = metrics.reduce((sum, m) => sum + (m.values?.[0]?.value || 0), 0);
                    break;
                case 'contacts':
                    title = '👥 Contatos';
                    description = 'Contatos processados e importados';
                    totalValue = metrics.reduce((sum, m) => sum + (m.values?.[0]?.value || 0), 0);
                    break;
                case 'products':
                    title = '📦 Produtos';
                    description = 'Produtos sincronizados';
                    totalValue = metrics.reduce((sum, m) => sum + (m.values?.[0]?.value || 0), 0);
                    break;
                case 'integration':
                    title = '🔗 Integrações';
                    description = 'Chamadas para APIs externas';
                    totalValue = metrics.reduce((sum, m) => sum + (m.values?.[0]?.value || 0), 0);
                    break;
                case 'background':
                    title = '⚙️ Jobs Background';
                    description = 'Jobs em background executados';
                    totalValue = metrics.reduce((sum, m) => sum + (m.values?.[0]?.value || 0), 0);
                    break;
                case 'cron':
                    title = '⏰ Cron Jobs';
                    description = 'Jobs agendados executados';
                    totalValue = metrics.reduce((sum, m) => sum + (m.values?.[0]?.value || 0), 0);
                    break;
                case 'memory':
                    title = '💾 Memória';
                    description = 'Uso de memória do sistema';
                    const memoryMetric = metrics.find(m => m.name === 'memory_usage_bytes');
                    totalValue = memoryMetric ? memoryMetric.values?.[0]?.value || 0 : 0;
                    totalValue = Math.round(totalValue / 1024 / 1024); // Converter para MB
                    break;
                default:
                    title = '📊 ' + type.charAt(0).toUpperCase() + type.slice(1);
                    description = 'Métricas do sistema';
                    totalValue = metrics.reduce((sum, m) => sum + (m.values?.[0]?.value || 0), 0);
            }
            
            card.innerHTML = 
                '<div class="metric-title">' + title + '</div>' +
                '<div class="metric-value">' + totalValue.toLocaleString('pt-BR') + (type === 'memory' ? ' MB' : '') + '</div>' +
                '<div class="metric-description">' + description + '</div>';
            
            return card;
        }
        
        // Event listeners
        document.addEventListener('DOMContentLoaded', function() {
            const refreshBtn = document.getElementById('refreshBtn');
            const prometheusBtn = document.getElementById('prometheusBtn');
            
            refreshBtn.addEventListener('click', loadMetrics);
            prometheusBtn.addEventListener('click', function() {
                window.open('/api/metrics/prometheus', '_blank');
            });
            
            // Carregar métricas automaticamente
            loadMetrics();
            setInterval(loadMetrics, 30000);
        });
    </script>
</body>
</html>
  `;
  
  res.send(dashboardHTML);
});

// Rota para favicon
router.get('/favicon.ico', (req, res) => {
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="#667eea"/>
    <text x="50" y="60" font-size="50" text-anchor="middle" fill="white">📊</text>
  </svg>`;
  
  res.set('Content-Type', 'image/svg+xml');
  res.send(faviconSvg);
});

// Rota para health check detalhado
router.get('/health', async (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(uptime),
        human: formatUptime(uptime)
      },
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
      },
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      environment: process.env.NODE_ENV || 'development'
    };
    
    res.json(healthData);
  } catch (error) {
    logger.error('Erro no health check:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Função auxiliar para formatar uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

module.exports = router;
