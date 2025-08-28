const ContactService = require('../services/contactService');
const AddressService = require('../services/addressService');

async function testAddressIntegration() {
  try {
    console.log('🚀 Iniciando teste da integração com endereços...');
    console.log('');
    
    // Teste 1: Verificar API de endereços
    console.log('🧪 TESTE 1: Verificando API de endereços...');
    const addressService = new AddressService();
    const addressTest = await addressService.testAddressAPI();
    
    if (addressTest.success) {
      console.log('✅ API de endereços funcionando!');
      console.log(`📋 Campos disponíveis: ${addressTest.test2.fields.join(', ')}`);
      if (addressTest.test2.sampleRecord) {
        console.log('📋 Exemplo de endereço:', JSON.stringify(addressTest.test2.sampleRecord, null, 2));
      }
    } else {
      console.log('❌ API de endereços com problema:', addressTest.error);
      return;
    }
    
    console.log('');
    
    // Teste 2: Buscar alguns registros da CL
    console.log('🧪 TESTE 2: Buscando registros da CL...');
    const contactService = new ContactService();
    
    // Busca apenas 100 registros para teste
    const records = await contactService.fetchAllCLRecordsWithVTEXScroll({
      size: 1000,
      maxRequests: 1, // Apenas 1 página para teste
      maxRetries: 3,
      baseDelay: 2000
    });
    
    console.log(`✅ Encontrados ${records.length} registros da CL`);
    
    if (records.length === 0) {
      console.log('❌ Nenhum registro encontrado, abortando teste');
      return;
    }
    
    console.log('');
    
    // Teste 2.5: Verificar relação entre userId e accountId
    console.log('🧪 TESTE 2.5: Verificando relação entre userId e accountId...');
    console.log('📊 Primeiros 5 registros da CL:');
    records.slice(0, 5).forEach((record, index) => {
      console.log(`  ${index + 1}. accountId: ${record.accountId}, email: ${record.email}`);
    });
    
    // Buscar alguns endereços para ver os userIds disponíveis
    console.log('📊 Buscando alguns endereços para ver userIds disponíveis...');
    const someAddresses = await addressService.fetchAllAddresses({
      size: 10,
      maxRequests: 1
    });
    
    console.log('📊 Primeiros 5 endereços da AD:');
    someAddresses.slice(0, 5).forEach((address, index) => {
      console.log(`  ${index + 1}. userId: ${address.userId}, accountId: ${address.accountId}, city: ${address.city || 'N/A'}`);
    });
    
    console.log('');
    
    // Teste 3: Buscar endereços para alguns usuários
    console.log('🧪 TESTE 3: Buscando endereços para alguns usuários...');
    
    // Vamos usar os userIds reais dos endereços, não os accountIds da CL
    const realUserIds = someAddresses.slice(0, 5).map(address => address.userId).filter(id => id);
    console.log(`📊 Testando com ${realUserIds.length} userIds reais:`, realUserIds);
    
    const addressMap = await addressService.fetchAddressesForMultipleUsers(realUserIds, {
      batchSize: 5,
      delay: 100
    });
    
    console.log('✅ Busca de endereços concluída!');
    console.log('📊 Resultados:');
    Object.keys(addressMap).forEach(userId => {
      const addresses = addressMap[userId];
      console.log(`  - userId ${userId}: ${addresses.length} endereços`);
      if (addresses.length > 0) {
        console.log(`    Primeiro endereço: ${addresses[0].city || 'N/A'}, ${addresses[0].state || 'N/A'}`);
      }
    });
    
    console.log('');
    
    // Teste 4: Gerar CSV de teste com endereços
    console.log('🧪 TESTE 4: Gerando CSV de teste com endereços...');
    const csvResult = await contactService.generateCLCSVWithAddresses(records.slice(0, 10), {
      addressBatchSize: 5,
      addressDelay: 100
    });
    
    if (csvResult.success) {
      console.log('✅ CSV gerado com sucesso!');
      console.log(`📁 Arquivo: ${csvResult.filename}`);
      console.log(`📊 Registros processados: ${csvResult.totalRecords}`);
      console.log(`🏠 Endereços encontrados: ${csvResult.totalAddressesFound}`);
    } else {
      console.log('❌ Erro ao gerar CSV:', csvResult.error);
    }
    
    console.log('');
    console.log('🎉 TESTE DE INTEGRAÇÃO CONCLUÍDO!');
    
  } catch (error) {
    console.error('❌ Erro no teste de integração:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Executa o teste
testAddressIntegration();
