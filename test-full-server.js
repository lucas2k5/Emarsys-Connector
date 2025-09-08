#!/usr/bin/env node

// Simular ambiente de produção
process.env.NODE_ENV = 'production';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Carregar todas as rotas como no server.js original
const emarsysRoutes = require('./routes/emarsys');
const vtexProductRoutes = require('./routes/vtexProducts');
const emarsysSalesRoutes = require('./routes/emarsysSales');
const emarsysCsvRoutes = require('./routes/emarsysCsv');
const emarsysContactsRoutes = require('./routes/emarsysContacts');
const emsClientsRoutes = require('./routes/emsClients');
const integrationRoutes = require('./routes/integration');
const backgroundJobsRoutes = require('./routes/backgroundJobs');
const cronJobsRoutes = require('./routes/cronJobs');
const cronManagementRoutes = require('./routes/cronManagement');

const app = express();
const PORT = 3002; // Porta diferente para não conflitar
const HOST = '0.0.0.0';

console.log('🔍 Testando servidor completo em ambiente de produção...');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`HOST: ${HOST}`);
console.log(`PORT: ${PORT}`);

// Middleware exatamente como no server.js
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Registrar todas as rotas exatamente como no server.js
app.use('/api/emarsys', emarsysRoutes);
app.use('/api/vtex/products', vtexProductRoutes);
app.use('/api/emarsys/sales', emarsysSalesRoutes);
app.use('/api/emarsys/csv', emarsysCsvRoutes);
app.use('/api/emarsys/contacts', emarsysContactsRoutes);
app.use('/api/emarsys/ems-clients', emsClientsRoutes);
app.use('/api/integration', integrationRoutes);
app.use('/api/background', backgroundJobsRoutes);
app.use('/api/cron', cronJobsRoutes);
app.use('/api/cron-management', cronManagementRoutes);

app.get('/health', (req, res) => res.status(200).json({ ok: true }));

// Middleware de erro
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Openflow - Emarsys - internal_error', detail: err.message });
});

// Middleware 404
app.use('*', (req, res) => {
  console.log(`❌ Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Openflow - Emarsys - Route not found' });
});

// Função para listar todas as rotas
function listAllRoutes() {
  console.log('\n📋 Todas as rotas registradas:');
  
  app._router.stack.forEach((middleware, index) => {
    if (middleware.route) {
      const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
      console.log(`  ${methods} ${middleware.route.path}`);
    } else if (middleware.name === 'router') {
      console.log(`\n🔗 Router: ${middleware.regexp}`);
      
      if (middleware.handle && middleware.handle.stack) {
        middleware.handle.stack.forEach((route, routeIndex) => {
          if (route.route) {
            const methods = Object.keys(route.route.methods).join(', ').toUpperCase();
            console.log(`    ${methods} ${route.route.path}`);
          }
        });
      }
    }
  });
}

// Listar rotas
listAllRoutes();

// Verificar especificamente a rota create-single
console.log('\n🧪 Verificando rota específica /api/emarsys/contacts/create-single...');

let routeFound = false;
app._router.stack.forEach((middleware) => {
  if (middleware.name === 'router' && middleware.regexp.toString().includes('emarsys/contacts')) {
    if (middleware.handle && middleware.handle.stack) {
      middleware.handle.stack.forEach((route) => {
        if (route.route && route.route.path === '/create-single') {
          const methods = Object.keys(route.route.methods);
          if (methods.includes('post')) {
            console.log('✅ Rota POST /api/emarsys/contacts/create-single encontrada!');
            routeFound = true;
          }
        }
      });
    }
  }
});

if (!routeFound) {
  console.log('❌ Rota POST /api/emarsys/contacts/create-single NÃO encontrada!');
}

// Iniciar servidor
app.listen(PORT, HOST, () => {
  console.log(`\n🚀 Servidor de teste rodando em ${HOST}:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Teste create-single: http://localhost:${PORT}/api/emarsys/contacts/create-single`);
  
  console.log('\n📝 Para testar, execute:');
  console.log(`curl -X POST http://localhost:${PORT}/api/emarsys/contacts/create-single \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"nome": "Teste", "email": "teste@teste.com"}'`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Parando servidor de teste...');
  process.exit(0);
});

