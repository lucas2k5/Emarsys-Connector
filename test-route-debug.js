#!/usr/bin/env node

// Simular ambiente de produção
process.env.NODE_ENV = 'production';

const express = require('express');
const app = express();

// Middleware básico
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

console.log('🔍 Testando carregamento das rotas em ambiente de produção...');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);

// Carregar as rotas
try {
  const emarsysContactsRoutes = require('./routes/emarsysContacts');
  console.log('✅ Rotas carregadas com sucesso');
  
  // Registrar as rotas
  app.use('/api/emarsys/contacts', emarsysContactsRoutes);
  console.log('✅ Rotas registradas com sucesso');
  
  // Função para listar rotas
  function listAllRoutes() {
    console.log('\n📋 Todas as rotas registradas:');
    
    app._router.stack.forEach((middleware, index) => {
      if (middleware.route) {
        // Rota direta
        const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
        console.log(`  ${methods} ${middleware.route.path}`);
      } else if (middleware.name === 'router') {
        // Router middleware
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
  
  // Testar se a rota específica existe
  console.log('\n🧪 Verificando rota específica /create-single...');
  
  let routeFound = false;
  app._router.stack.forEach((middleware) => {
    if (middleware.name === 'router' && middleware.handle && middleware.handle.stack) {
      middleware.handle.stack.forEach((route) => {
        if (route.route && route.route.path === '/create-single') {
          const methods = Object.keys(route.route.methods);
          if (methods.includes('post')) {
            console.log('✅ Rota POST /create-single encontrada!');
            routeFound = true;
          }
        }
      });
    }
  });
  
  if (!routeFound) {
    console.log('❌ Rota POST /create-single NÃO encontrada!');
  }
  
} catch (error) {
  console.error('❌ Erro ao carregar rotas:', error);
}

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

console.log('\n✅ Teste concluído!');
