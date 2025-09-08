#!/usr/bin/env node

const express = require('express');
const app = express();

// Simular o mesmo setup do server.js
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Carregar as rotas
const emarsysContactsRoutes = require('./routes/emarsysContacts');

console.log('🔍 Testando carregamento das rotas...');

// Verificar se a rota está sendo registrada
app.use('/api/emarsys/contacts', emarsysContactsRoutes);

// Listar todas as rotas registradas
function listRoutes() {
  console.log('\n📋 Rotas registradas:');
  app._router.stack.forEach((middleware, index) => {
    if (middleware.route) {
      console.log(`  ${middleware.route.methods} ${middleware.route.path}`);
    } else if (middleware.name === 'router') {
      console.log(`  Router: ${middleware.regexp}`);
      if (middleware.handle && middleware.handle.stack) {
        middleware.handle.stack.forEach((route, routeIndex) => {
          if (route.route) {
            console.log(`    ${route.route.methods} ${route.route.path}`);
          }
        });
      }
    }
  });
}

// Testar a rota específica
app.post('/test-create-single', (req, res) => {
  console.log('✅ Rota de teste funcionando!');
  res.json({ success: true, message: 'Rota de teste OK' });
});

// Middleware de erro
app.use((err, req, res, next) => {
  console.error('❌ Erro:', err.stack);
  res.status(500).json({ error: 'Erro interno', detail: err.message });
});

// Middleware 404
app.use('*', (req, res) => {
  console.log(`❌ Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found' });
});

// Iniciar servidor de teste
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor de debug rodando na porta ${PORT}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
  
  listRoutes();
  
  console.log('\n🧪 Testando rotas:');
  console.log(`  GET  http://localhost:${PORT}/test-create-single`);
  console.log(`  POST http://localhost:${PORT}/api/emarsys/contacts/create-single`);
  
  console.log('\n📝 Para testar, execute:');
  console.log(`curl -X POST http://localhost:${PORT}/api/emarsys/contacts/create-single \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"nome": "Teste", "email": "teste@teste.com"}'`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Parando servidor de debug...');
  process.exit(0);
});

