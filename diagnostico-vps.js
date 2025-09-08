#!/usr/bin/env node

/**
 * Script de diagnóstico para VPS
 * Este script deve ser executado na VPS para identificar o problema
 */

console.log('🔍 DIAGNÓSTICO VPS - Emarsys Server');
console.log('=====================================\n');

// 1. Verificar variáveis de ambiente
console.log('1️⃣ Variáveis de Ambiente:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
console.log(`   PORT: ${process.env.PORT || 'undefined'}`);
console.log(`   HOST: ${process.env.HOST || 'undefined'}`);
console.log('');

// 2. Verificar se o arquivo .env existe e está sendo carregado
console.log('2️⃣ Verificação do arquivo .env:');
try {
  require('dotenv').config();
  console.log('   ✅ dotenv carregado com sucesso');
  console.log(`   NODE_ENV após dotenv: ${process.env.NODE_ENV}`);
  console.log(`   HOST após dotenv: ${process.env.HOST}`);
  console.log(`   PORT após dotenv: ${process.env.PORT}`);
} catch (error) {
  console.log('   ❌ Erro ao carregar dotenv:', error.message);
}
console.log('');

// 3. Verificar se as rotas estão sendo carregadas
console.log('3️⃣ Verificação das rotas:');
try {
  const emarsysContactsRoutes = require('./routes/emarsysContacts');
  console.log('   ✅ Rotas emarsysContacts carregadas');
  
  // Verificar se o router tem a rota create-single
  const router = emarsysContactsRoutes;
  if (router && router.stack) {
    let createSingleFound = false;
    router.stack.forEach((layer) => {
      if (layer.route && layer.route.path === '/create-single') {
        const methods = Object.keys(layer.route.methods);
        if (methods.includes('post')) {
          console.log('   ✅ Rota POST /create-single encontrada no router');
          createSingleFound = true;
        }
      }
    });
    
    if (!createSingleFound) {
      console.log('   ❌ Rota POST /create-single NÃO encontrada no router');
    }
  }
} catch (error) {
  console.log('   ❌ Erro ao carregar rotas:', error.message);
}
console.log('');

// 4. Verificar se o servidor está configurado corretamente
console.log('4️⃣ Verificação do servidor:');
try {
  const express = require('express');
  const app = express();
  
  // Middleware básico
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  
  // Carregar rotas
  const emarsysContactsRoutes = require('./routes/emarsysContacts');
  app.use('/api/emarsys/contacts', emarsysContactsRoutes);
  
  // Verificar se a rota está registrada
  let routeRegistered = false;
  app._router.stack.forEach((middleware) => {
    if (middleware.name === 'router' && middleware.regexp.toString().includes('emarsys/contacts')) {
      if (middleware.handle && middleware.handle.stack) {
        middleware.handle.stack.forEach((route) => {
          if (route.route && route.route.path === '/create-single') {
            const methods = Object.keys(route.route.methods);
            if (methods.includes('post')) {
              console.log('   ✅ Rota POST /api/emarsys/contacts/create-single registrada no servidor');
              routeRegistered = true;
            }
          }
        });
      }
    }
  });
  
  if (!routeRegistered) {
    console.log('   ❌ Rota POST /api/emarsys/contacts/create-single NÃO registrada no servidor');
  }
  
} catch (error) {
  console.log('   ❌ Erro ao configurar servidor:', error.message);
}
console.log('');

// 5. Verificar se há conflitos de rotas
console.log('5️⃣ Verificação de conflitos de rotas:');
try {
  const express = require('express');
  const app = express();
  
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  
  // Carregar todas as rotas como no server.js
  const emarsysRoutes = require('./routes/emarsys');
  const emarsysContactsRoutes = require('./routes/emarsysContacts');
  
  app.use('/api/emarsys', emarsysRoutes);
  app.use('/api/emarsys/contacts', emarsysContactsRoutes);
  
  // Verificar ordem das rotas
  console.log('   Ordem das rotas registradas:');
  app._router.stack.forEach((middleware, index) => {
    if (middleware.name === 'router') {
      console.log(`   ${index + 1}. ${middleware.regexp}`);
    }
  });
  
} catch (error) {
  console.log('   ❌ Erro ao verificar conflitos:', error.message);
}
console.log('');

// 6. Verificar se há algum middleware que possa estar interferindo
console.log('6️⃣ Verificação de middlewares:');
try {
  const express = require('express');
  const app = express();
  
  // Middleware exatamente como no server.js
  const cors = require('cors');
  const helmet = require('helmet');
  
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  
  console.log('   ✅ Middlewares carregados com sucesso');
  
} catch (error) {
  console.log('   ❌ Erro ao carregar middlewares:', error.message);
}
console.log('');

console.log('✅ Diagnóstico concluído!');
console.log('');
console.log('📝 Próximos passos:');
console.log('1. Execute este script na VPS: node diagnostico-vps.js');
console.log('2. Verifique os logs da aplicação: pm2 logs emarsys-server');
console.log('3. Verifique se a aplicação está rodando: pm2 status');
console.log('4. Reinicie a aplicação: pm2 restart emarsys-server');
