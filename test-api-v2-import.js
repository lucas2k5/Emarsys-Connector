#!/usr/bin/env node

/**
 * Script para testar importação de contatos via API v2 com WSSE
 * Uso: node test-api-v2-import.js [nome_do_arquivo]
 */

require('dotenv').config();

async function testApiV2Import() {
  console.log('🧪 Testando importação de contatos via API v2 com WSSE...\n');
  
  const filename = process.argv[2]; // Nome do arquivo opcional
  
  try {
    const emarsysImportService = require('./services/emarsysContactImportService');
    
    // Testa conectividade primeiro
    console.log('🔗 Testando conectividade API v2...');
    const connectivityResult = await emarsysImportService.testConnection();
    
    console.log('\n📊 Status da API v2:');
    console.log(`   Configurado: ${connectivityResult.configured ? '✅ Sim' : '❌ Não'}`);
    console.log(`   Disponível: ${connectivityResult.available ? '✅ Sim' : '❌ Não'}`);
    console.log(`   Status: ${connectivityResult.status || 'N/A'}`);
    console.log(`   Campos disponíveis: ${connectivityResult.fieldsCount || 'N/A'}`);
    
    if (connectivityResult.error) {
      console.log(`   Erro: ${connectivityResult.error}`);
    }
    
    if (!connectivityResult.available) {
      console.log('\n❌ API v2 não está disponível. Verifique as configurações:');
      console.log('   - EMARSYS_USER');
      console.log('   - EMARSYS_SECRET');
      console.log('   - EMARSYS_ENDPOINT');
      return;
    }
    
    // Testa importação
    console.log('\n📤 Testando importação de contatos...');
    if (filename) {
      console.log(`📄 Usando arquivo específico: ${filename}`);
    } else {
      console.log('📄 Usando arquivo mais recente');
    }
    
    const importResult = await emarsysImportService.importContactsFromCsv(filename);
    
    if (importResult.success) {
      console.log('\n✅ Importação de contatos bem-sucedida!');
      console.log(`   📄 Arquivo: ${importResult.filename}`);
      console.log(`   📊 Tamanho: ${importResult.fileSizeFormatted}`);
      console.log(`   👥 Contatos encontrados: ${importResult.contactsFound}`);
      console.log(`   ✅ Contatos importados: ${importResult.importResults.successful}`);
      console.log(`   ❌ Contatos falharam: ${importResult.importResults.failed}`);
      console.log(`   📝 Mensagem: ${importResult.message}`);
      
      if (importResult.importResults.errors && importResult.importResults.errors.length > 0) {
        console.log('\n⚠️ Erros encontrados:');
        importResult.importResults.errors.slice(0, 5).forEach((error, index) => {
          console.log(`   ${index + 1}. ${error}`);
        });
        if (importResult.importResults.errors.length > 5) {
          console.log(`   ... e mais ${importResult.importResults.errors.length - 5} erros`);
        }
      }
    } else {
      console.log('\n❌ Falha na importação de contatos:');
      console.log(`   📝 Erro: ${importResult.error}`);
      console.log(`   📄 Arquivo: ${importResult.filename || 'N/A'}`);
      
      console.log('\n🔧 Possíveis soluções:');
      console.log('   1. Verifique as configurações WSSE no arquivo .env');
      console.log('   2. Confirme se o arquivo CSV está no formato correto');
      console.log('   3. Verifique se há arquivos CSV de contatos disponíveis');
      console.log('   4. Teste a conectividade da API v2 primeiro');
    }
    
  } catch (error) {
    console.log('\n❌ Erro inesperado:', error.message);
    console.log('\n🔧 Verifique:');
    console.log('   1. Se o arquivo .env está configurado corretamente');
    console.log('   2. Se o serviço emarsysContactImportService existe');
    console.log('   3. Se há problemas de rede');
  }
}

// Executa o teste
testApiV2Import().catch(console.error);

