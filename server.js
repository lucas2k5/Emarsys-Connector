require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const emarsysRoutes = require('./routes/emarsys');
const vtexProductRoutes = require('./routes/vtexProducts');
const emarsysSalesRoutes = require('./routes/emarsysSales');
const emarsysCsvRoutes = require('./routes/emarsysCsv');

const integrationRoutes = require('./routes/integration');
const backgroundJobsRoutes = require('./routes/backgroundJobs');
const cronJobsRoutes = require('./routes/cronJobs');
const cronManagementRoutes = require('./routes/cronManagement');
const { generateOAuth2TokenFromEnv, getEmarsysSettings } = require('./utils/emarsysAuth');
const { getBrazilianTimestamp } = require('./utils/dateUtils');
const CronService = require('./utils/cronService');

const app = express();
const PORT = process.env.PORT || 3000;

// Instância do serviço de cron
const cronService = new CronService();

// Middleware
app.use(helmet());
app.use(cors());
// Body parsers com limites seguros para serverless
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Routes
app.use('/api/emarsys', emarsysRoutes);
app.use('/api/vtex/products', vtexProductRoutes);
app.use('/api/emarsys/sales', emarsysSalesRoutes);
app.use('/api/emarsys/csv', emarsysCsvRoutes);

app.use('/api/integration', integrationRoutes);
app.use('/api/background', backgroundJobsRoutes);
app.use('/api/cron', cronJobsRoutes);
app.use('/api/cron-management', cronManagementRoutes);

// Health check com configurações da Emarsys
app.get('/health', async (req, res) => {
  try {
    const healthData = {
      status: 'OK',
      timestamp: getBrazilianTimestamp(),
      server: {
        port: PORT,
        environment: process.env.NODE_ENV || 'development'
      }
    };

    // Tentar buscar configurações da Emarsys se as credenciais OAuth2 estiverem disponíveis
    if (process.env.EMARSYS_CLIENT_ID && process.env.EMARSYS_CLIENT_SECRET) {
      try {
        const tokenData = await generateOAuth2TokenFromEnv();
        const settings = await getEmarsysSettings(tokenData.access_token);
        
        healthData.emarsys = {
          status: 'connected',
          token_type: tokenData.token_type,
          expires_in: tokenData.expires_in,
          settings: settings
        };
      } catch (emarsysError) {
        healthData.emarsys = {
          status: 'error',
          error: emarsysError.message
        };
      }
    } else {
      healthData.emarsys = {
        status: 'not_configured',
        message: 'EMARSYS_CLIENT_ID e EMARSYS_CLIENT_SECRET não configurados'
      };
    }

    // Status dos cron jobs nativos
    healthData.vtex = {
      cron: {
        provider: 'Native Node.js Cron Jobs',
        status: 'active',
        schedules: {
          'products-sync': '0 */8 * * * (a cada 8 horas)',
          'orders-sync': '0 */5 * * * (a cada 5 horas)'
        },
        endpoints: {
          'products-sync': '/api/vtex/products/sync',
          'orders-sync': '/api/integration/orders-extract-all'
        },
        jobs: cronService.getStatus()
      },
      ordersUrl: process.env.VTEX_ORDERS_URL || 'https://ems--piccadilly.myvtex.com/_v/orders/list'
    };

    res.json(healthData);
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: getBrazilianTimestamp(),
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Exporta app para uso serverless
module.exports = app;

// Executa listen apenas em ambiente local
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Emarsys API: http://localhost:${PORT}/api/emarsys`);
    console.log(`VTEX API: http://localhost:${PORT}/api/vtex`);
    console.log(`VTEX Products API: http://localhost:${PORT}/api/vtex/products`);
    console.log(`Emarsys Sales API: http://localhost:${PORT}/api/emarsys/sales`);
    console.log(`Emarsys CSV API: http://localhost:${PORT}/api/emarsys/csv`);
    console.log(`Integration API: http://localhost:${PORT}/api/integration`);
    console.log(`Background Jobs API: http://localhost:${PORT}/api/background`);
    console.log(`Cron Jobs API: http://localhost:${PORT}/api/cron`);
    
    console.log('🚀 Iniciando cron jobs nativos para sincronização automática...');
    
    // Disponibiliza o cronService para as rotas
    app.set('cronService', cronService);
    
    // Inicia os cron jobs após o servidor estar rodando
    cronService.startAll();
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Recebido SIGTERM, parando cron jobs...');
  cronService.stopAll();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Recebido SIGINT, parando cron jobs...');
  cronService.stopAll();
  process.exit(0);
});