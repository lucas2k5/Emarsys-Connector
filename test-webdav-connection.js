#!/usr/bin/env node

/**
 * Script para testar a conectividade WebDAV com Emarsys
 * Uso: node test-webdav-connection.js
 */

require('dotenv').config();

async function testWebDAVConnection() {
  console.log('🧪 Testando conectividade WebDAV com Emarsys...\n');
  
  // Verifica variáveis de ambiente
  console.log('📋 Verificando configurações:');
  console.log(`   🌐 WEBDAV_SERVER: ${process.env.WEBDAV_SERVER ? '✅ Configurado' : '❌ NÃO CONFIGURADO'}`);
  console.log(`   🌐 WEBDAV_FOLDER: ${process.env.WEBDAV_FOLDER ? '✅ Configurado' : '❌ NÃO CONFIGURADO'}`);
  console.log(`   👤 WEBDAV_USER: ${process.env.WEBDAV_USER ? '✅ Configurado' : '❌ NÃO CONFIGURADO'}`);
  console.log(`   🔐 WEBDAV_PASS: ${process.env.WEBDAV_PASS ? '✅ Configurado' : '❌ NÃO CONFIGURADO'}`);
  
  const webdavUrl = process.env.WEBDAV_FOLDER || process.env.WEBDAV_SERVER;
  const webdavUser = process.env.WEBDAV_USER;
  const webdavPass = process.env.WEBDAV_PASS;
  
  if (!webdavUrl || !webdavUser || !webdavPass) {
    console.log('\n❌ Configurações WebDAV incompletas!');
    console.log('📝 Verifique o arquivo .env e adicione as variáveis necessárias:');
    console.log('   - WEBDAV_SERVER ou WEBDAV_FOLDER');
    console.log('   - WEBDAV_USER');
    console.log('   - WEBDAV_PASS');
    console.log('\n📄 Consulte o arquivo env-webdav-example.txt para exemplos');
    return;
  }
  
  console.log(`\n🌐 URL WebDAV: ${webdavUrl}`);
  console.log(`👤 Usuário: ${webdavUser}`);
  
  try {
    // Testa o serviço WebDAV
    const EmarsysWebdavService = require('./services/emarsysWebdavService');
    const webdavService = new EmarsysWebdavService();
    
    console.log('\n🔗 Testando conexão...');
    const result = await webdavService.testConnection();
    
    if (result.success) {
      console.log('\n✅ Conexão WebDAV estabelecida com sucesso!');
      console.log(`📁 Diretórios encontrados: ${result.directories}`);
      console.log(`🌐 URL: ${result.url}`);
      
      // Testa listagem de arquivos
      console.log('\n📋 Testando listagem de arquivos...');
      const listResult = await webdavService.listFiles('/');
      
      if (listResult.success) {
        console.log('✅ Listagem de arquivos funcionando');
        console.log(`📁 Arquivos/diretórios encontrados: ${listResult.data.length}`);
        
        // Mostra alguns exemplos
        if (listResult.data.length > 0) {
          console.log('\n📄 Exemplos de arquivos/diretórios:');
          listResult.data.slice(0, 5).forEach(item => {
            console.log(`   ${item.type === 'directory' ? '📁' : '📄'} ${item.filename}`);
          });
        }
      } else {
        console.log('⚠️ Erro na listagem de arquivos:', listResult.error);
      }
      
    } else {
      console.log('\n❌ Falha na conexão WebDAV:');
      console.log(`   📝 Erro: ${result.error}`);
      console.log(`   🌐 URL: ${result.url}`);
      
      console.log('\n🔧 Possíveis soluções:');
      console.log('   1. Verifique se as credenciais estão corretas');
      console.log('   2. Confirme se a URL do WebDAV está correta');
      console.log('   3. Verifique se há firewall bloqueando a conexão');
      console.log('   4. Entre em contato com o suporte Emarsys se necessário');
    }
    
  } catch (error) {
    console.log('\n❌ Erro inesperado:', error.message);
    console.log('\n🔧 Verifique:');
    console.log('   1. Se o pacote "webdav" está instalado (npm install webdav)');
    console.log('   2. Se as variáveis de ambiente estão corretas');
    console.log('   3. Se há problemas de rede');
  }
}

// Executa o teste
testWebDAVConnection().catch(console.error);
