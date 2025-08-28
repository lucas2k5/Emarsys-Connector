const AddressService = require('../services/addressService');

async function testSimpleAddress() {
  try {
    console.log('🧪 Teste simples da API de endereços...');
    
    const addressService = new AddressService();
    
    // Teste 1: Verificar API
    console.log('📄 Teste 1: Verificando API...');
    const testResult = await addressService.testAddressAPI();
    
    if (!testResult.success) {
      console.log('❌ API não funcionando:', testResult.error);
      return;
    }
    
    console.log('✅ API funcionando!');
    console.log(`📊 Total de endereços: ${testResult.addresses.length}`);
    
    // Teste 2: Buscar endereços para um userId específico
    if (testResult.addresses.length > 0) {
      const sampleUserId = testResult.addresses[0].userId;
      console.log(`📄 Teste 2: Buscando endereços para userId: ${sampleUserId}`);
      
      const addresses = await addressService.fetchAddressesByUserId(sampleUserId);
      console.log(`✅ Encontrados ${addresses.length} endereços para o usuário`);
      
      if (addresses.length > 0) {
        console.log('📋 Primeiro endereço:', JSON.stringify(addresses[0], null, 2));
      }
    }
    
    console.log('🎉 Teste concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

testSimpleAddress();
