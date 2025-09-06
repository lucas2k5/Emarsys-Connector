#!/usr/bin/env node

const http = require('http');
const https = require('https');

const VPS_IP = '177.93.135.200';
const PORT = 3000;

console.log('🔍 Verificando status do servidor...\n');

// Função para testar HTTP
function testHttp() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: VPS_IP,
      port: PORT,
      path: '/health',
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`✅ HTTP Status: ${res.statusCode}`);
        console.log(`📄 Response: ${data}`);
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', (err) => {
      console.log(`❌ HTTP Error: ${err.message}`);
      reject(err);
    });

    req.on('timeout', () => {
      console.log('⏰ HTTP Timeout');
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.end();
  });
}

// Função para testar a rota específica
function testCreateSingle() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      nome: "Teste VPS",
      email: "teste@vps.com",
      phone: "+5577999999999",
      birth_of_date: "1990-01-01"
    });

    const options = {
      hostname: VPS_IP,
      port: PORT,
      path: '/api/emarsys/contacts/create-single',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`✅ Create Single Status: ${res.statusCode}`);
        console.log(`📄 Response: ${data}`);
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', (err) => {
      console.log(`❌ Create Single Error: ${err.message}`);
      reject(err);
    });

    req.on('timeout', () => {
      console.log('⏰ Create Single Timeout');
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.write(postData);
    req.end();
  });
}

// Executar testes
async function runTests() {
  try {
    console.log(`🌐 Testando conexão com ${VPS_IP}:${PORT}\n`);
    
    // Teste 1: Health check
    console.log('1️⃣ Testando endpoint /health...');
    await testHttp();
    console.log('');
    
    // Teste 2: Rota específica
    console.log('2️⃣ Testando endpoint /api/emarsys/contacts/create-single...');
    await testCreateSingle();
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
