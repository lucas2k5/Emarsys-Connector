#!/usr/bin/env node

/**
 * Script para testar a rota específica na VPS
 * Execute este script na VPS para testar a conectividade
 */

const http = require('http');

const VPS_IP = '177.93.135.200';
const PORT = 3000;

console.log('🧪 TESTE DE ROTA VPS');
console.log('====================\n');

// Função para testar HTTP
function testRoute(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: VPS_IP,
      port: PORT,
      path: path,
      method: method,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      const postData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        console.log(`✅ ${method} ${path} - Status: ${res.statusCode}`);
        console.log(`📄 Response: ${responseData}`);
        resolve({ status: res.statusCode, data: responseData });
      });
    });

    req.on('error', (err) => {
      console.log(`❌ ${method} ${path} - Error: ${err.message}`);
      reject(err);
    });

    req.on('timeout', () => {
      console.log(`⏰ ${method} ${path} - Timeout`);
      req.destroy();
      reject(new Error('Timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Executar testes
async function runTests() {
  try {
    console.log(`🌐 Testando conexão com ${VPS_IP}:${PORT}\n`);
    
    // Teste 1: Health check
    console.log('1️⃣ Testando endpoint /health...');
    await testRoute('GET', '/health');
    console.log('');
    
    // Teste 2: Rota específica com dados válidos
    console.log('2️⃣ Testando endpoint /api/emarsys/contacts/create-single...');
    const testData = {
      nome: "Teste VPS",
      email: "teste@vps.com",
      phone: "+5577999999999",
      birth_of_date: "1990-01-01"
    };
    await testRoute('POST', '/api/emarsys/contacts/create-single', testData);
    console.log('');
    
    // Teste 3: Rota específica sem dados (deve retornar erro de validação)
    console.log('3️⃣ Testando endpoint /api/emarsys/contacts/create-single sem dados...');
    await testRoute('POST', '/api/emarsys/contacts/create-single', {});
    console.log('');
    
    // Teste 4: Rota inexistente (deve retornar 404)
    console.log('4️⃣ Testando rota inexistente...');
    await testRoute('POST', '/api/emarsys/contacts/rota-inexistente', {});
    console.log('');
    
    console.log('✅ Todos os testes concluídos!');
    
  } catch (error) {
    console.log(`❌ Erro nos testes: ${error.message}`);
    console.log('\n🔧 Possíveis soluções:');
    console.log('1. Verificar se a aplicação está rodando: pm2 status');
    console.log('2. Verificar logs: pm2 logs emarsys-server');
    console.log('3. Reiniciar aplicação: pm2 restart emarsys-server');
    console.log('4. Verificar firewall: ufw status');
    console.log('5. Verificar se a porta 3000 está aberta: netstat -tlnp | grep 3000');
  }
}

runTests();

