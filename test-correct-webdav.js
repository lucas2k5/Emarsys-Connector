#!/usr/bin/env node

/**
 * Script para testar WebDAV com a URL correta do Emarsys
 * Uso: node test-correct-webdav.js
 */

require('dotenv').config();

async function testCorrectWebDAV() {
  console.log('🧪 Testando WebDAV com URL correta do Emarsys...\n');
  
  // URL correta do painel WebDAV
  const correctWebDAVUrl = 'https://suite60.emarsys.net/storage/piccadilly/';
  const webdavUser = process.env.WEBDAV_USER || 'openflow';
  const webdavPass = process.env.WEBDAV_PASS;
  
  console.log('📋 Configurações:');
  console.log(`   🌐 URL: ${correctWebDAVUrl}`);
  console.log(`   👤 User: ${webdavUser}`);
  console.log(`   🔐 Pass: ${webdavPass ? 'Configurado' : 'NÃO CONFIGURADO'}`);
  
  if (!webdavPass) {
    console.log('\n❌ Senha WebDAV não configurada!');
    console.log('📝 Configure WEBDAV_PASS no arquivo .env');
    console.log('💡 Use um dos usuários disponíveis: piccadilly, openflow');
    return;
  }
  
  try {
    // Cria cliente WebDAV com URL correta
    const { createClient } = await import('webdav');
    const client = createClient(correctWebDAVUrl, {
      username: webdavUser,
      password: webdavPass
    });
    
    console.log('\n🔗 Testando conexão...');
    
    // Testa listagem de diretórios
    const contents = await client.getDirectoryContents('/');
    
    console.log('✅ Conexão WebDAV estabelecida com sucesso!');
    console.log(`📁 Diretórios/arquivos encontrados: ${contents.length}`);
    
    if (contents.length > 0) {
      console.log('\n📄 Conteúdo do diretório:');
      contents.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.type === 'directory' ? '📁' : '📄'} ${item.filename}`);
      });
    }
    
    // Testa criação de arquivo de teste
    console.log('\n📤 Testando upload de arquivo de teste...');
    const testContent = 'Teste de conectividade WebDAV - ' + new Date().toISOString();
    const testFileName = `test-webdav-${Date.now()}.txt`;
    
    await client.putFileContents(`/export/${testFileName}`, testContent);
    console.log(`✅ Arquivo de teste criado: /export/${testFileName}`);
    
    // Remove arquivo de teste
    await client.deleteFile(`/export/${testFileName}`);
    console.log('🗑️ Arquivo de teste removido');
    
    console.log('\n🎉 WebDAV está funcionando corretamente!');
    console.log('📝 Agora você pode configurar no .env:');
    console.log(`   WEBDAV_SERVER=${correctWebDAVUrl}`);
    console.log(`   WEBDAV_USER=${webdavUser}`);
    console.log(`   WEBDAV_PASS=${webdavPass}`);
    
  } catch (error) {
    console.log('\n❌ Erro na conexão WebDAV:');
    console.log(`   📝 Erro: ${error.message}`);
    
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.log('\n🔧 Possíveis soluções:');
      console.log('   1. Verifique se a senha está correta');
      console.log('   2. Tente com o usuário "piccadilly" em vez de "openflow"');
      console.log('   3. Verifique se o usuário tem permissões de escrita');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.log('\n🔧 Possíveis soluções:');
      console.log('   1. Verifique sua conexão com a internet');
      console.log('   2. Verifique se há firewall bloqueando a conexão');
      console.log('   3. Confirme se a URL está correta');
    }
  }
}

// Executa o teste
testCorrectWebDAV().catch(console.error);
