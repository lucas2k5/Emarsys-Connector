const ContactService = require('../services/contactService');

async function testCLScrollImproved() {
  try {
    console.log('🚀 Iniciando teste da busca de CL com melhorias...');
    console.log('📊 Configurações:');
    console.log('   - Timeout: 120 segundos');
    console.log('   - Retry: 3 tentativas com backoff exponencial');
    console.log('   - Pausa entre requisições: 500ms');
    console.log('   - Tamanho da página: 1000 registros');
    console.log('');
    
    const contactService = new ContactService();
    
    const startTime = Date.now();
    
    // Busca usando scroll com melhorias
    const records = await contactService.fetchAllCLRecordsWithVTEXScroll({
      size: 1000,
      maxRequests: 5000,
      maxRetries: 3,
      baseDelay: 2000
    });
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('');
    console.log('🎉 TESTE CONCLUÍDO!');
    console.log(`📊 Total de registros encontrados: ${records.length.toLocaleString()}`);
    console.log(`⏱️ Tempo total: ${duration.toFixed(2)} segundos`);
    console.log(`📈 Taxa: ${(records.length / duration).toFixed(0)} registros/segundo`);
    
    if (records.length > 0) {
      console.log('');
      console.log('📋 Exemplo de registros:');
      console.log(JSON.stringify(records[0], null, 2));
    }
    
    // Verifica se encontrou um número razoável de registros
    if (records.length >= 300000) {
      console.log('✅ SUCESSO: Encontrou mais de 300k registros!');
    } else if (records.length >= 200000) {
      console.log('⚠️ PARCIAL: Encontrou entre 200k-300k registros');
    } else {
      console.log('❌ PROBLEMA: Encontrou menos de 200k registros');
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Executa o teste
testCLScrollImproved();
