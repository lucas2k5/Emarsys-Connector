#!/usr/bin/env node

/**
 * Script para testar o envio de contatos via WebDAV
 * Uso: node test-contact-upload.js [nome_do_arquivo]
 */

require('dotenv').config();

async function testContactUpload() {
  console.log('🧪 Testando envio de contatos via WebDAV...\n');
  
  const filename = process.argv[2]; // Nome do arquivo opcional
  
  try {
    const emarsysContactsService = require('./services/emarsysContactsService');
    
    // Primeiro testa a conectividade
    console.log('🔗 Testando conectividade...');
    const connectivityResult = await emarsysContactsService.testConnectivity();
    
    console.log('\n📊 Status dos serviços:');
    console.log(`   WebDAV: ${connectivityResult.webdav.configured ? '✅ Configurado' : '❌ Não configurado'} ${connectivityResult.webdav.available ? '(Disponível)' : '(Indisponível)'}`);
    console.log(`   API v2 WSSE: ${connectivityResult.api_v2_wsse.configured ? '✅ Configurado' : '❌ Não configurado'} ${connectivityResult.api_v2_wsse.available ? '(Disponível)' : '(Indisponível)'}`);
    console.log(`   API Direta: ${connectivityResult.api_direct.configured ? '✅ Configurado' : '❌ Não configurado'} ${connectivityResult.api_direct.available ? '(Disponível)' : '(Indisponível)'}`);
    
    if (connectivityResult.webdav.error) {
      console.log(`   WebDAV Erro: ${connectivityResult.webdav.error}`);
    }
    
    // Lista arquivos disponíveis
    console.log('\n📋 Arquivos de contatos disponíveis:');
    const files = await emarsysContactsService.listContactsCsvFiles();
    
    if (files.length === 0) {
      console.log('❌ Nenhum arquivo CSV de contatos encontrado');
      console.log('📝 Gere um arquivo de contatos primeiro usando a API de extração');
      return;
    }
    
    files.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file.filename} (${file.sizeFormatted}) - ${file.modifiedFormatted}`);
    });
    
    // Testa o envio
    console.log('\n📤 Testando envio de contatos...');
    if (filename) {
      console.log(`📄 Usando arquivo específico: ${filename}`);
    } else {
      console.log('📄 Usando arquivo mais recente');
    }
    
    const uploadResult = await emarsysContactsService.sendContactsCsvViaWebDAV(filename);
    
    if (uploadResult.success) {
      console.log('\n✅ Upload de contatos bem-sucedido!');
      console.log(`   📄 Arquivo: ${uploadResult.filename}`);
      console.log(`   📊 Tamanho: ${uploadResult.fileSizeFormatted}`);
      console.log(`   📂 Caminho remoto: ${uploadResult.remotePath}`);
      console.log(`   🔧 Método: ${uploadResult.method}`);
    } else {
      console.log('\n❌ Falha no upload de contatos:');
      console.log(`   📝 Erro: ${uploadResult.error}`);
      console.log(`   📄 Arquivo: ${uploadResult.filename || 'N/A'}`);
      console.log(`   🔧 Método: ${uploadResult.method}`);
      
      console.log('\n🔧 Possíveis soluções:');
      console.log('   1. Verifique as configurações WebDAV no arquivo .env');
      console.log('   2. Confirme se o arquivo CSV está no formato correto');
      console.log('   3. Verifique se o arquivo não excede 64MB');
      console.log('   4. Teste a conectividade WebDAV primeiro');
    }
    
  } catch (error) {
    console.log('\n❌ Erro inesperado:', error.message);
    console.log('\n🔧 Verifique:');
    console.log('   1. Se o arquivo .env está configurado corretamente');
    console.log('   2. Se há arquivos CSV de contatos disponíveis');
    console.log('   3. Se os serviços estão funcionando');
  }
}

// Executa o teste
testContactUpload().catch(console.error);
