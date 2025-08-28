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
const PORT = process.env.PORT;
const HOST = process.env.HOST;
const cronService = new CronService();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use('/api/emarsys', emarsysRoutes);
app.use('/api/vtex/products', vtexProductRoutes);
app.use('/api/emarsys/sales', emarsysSalesRoutes);
app.use('/api/emarsys/csv', emarsysCsvRoutes);
app.use('/api/integration', integrationRoutes);
app.use('/api/background', backgroundJobsRoutes);
app.use('/api/cron', cronJobsRoutes);
app.use('/api/cron-management', cronManagementRoutes);

app.get('/health', (req, res) => res.status(200).json({ ok: true }))

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Openflow - Emarsys - internal_error', detail: err.message });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Openflow - Emarsys - Route not found' });
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Up on ${HOST}:${PORT}`)
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
    app.set('cronService', cronService);
    
    cronService.startAll();
  });
}

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