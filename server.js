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
const { generateOAuth2TokenFromEnv, getEmarsysSettings } = require('./utils/emarsysAuth');
const { getBrazilianTimestamp } = require('./utils/dateUtils');

const app = express();
const PORT = process.env.PORT || 3000;

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

    // Status dos cron jobs do Vercel
    healthData.vtex = {
      cron: {
        provider: 'Vercel Cron Jobs',
        status: 'active',
        schedules: {
          'sync-orders-batched': '0 */10 * * * (a cada 10 horas)',
          'sync-orders': '0 */12 * * * (a cada 12 horas)',
          'sync-products': '0 */14 * * * (a cada 14 horas)',
          'products-csv': '15 * * * * (a cada hora, 15 minutos)'
        },
        endpoints: {
          'sync-orders-batched': '/api/cron/sync-orders-batched',
          'sync-orders': '/api/cron/sync-orders',
          'sync-products': '/api/vtex/products/sync',
          'products-csv': '/api/cron/products-csv'
        }
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
    
    console.log('🚀 Usando Vercel Cron Jobs nativos para sincronização automática');
  });
}