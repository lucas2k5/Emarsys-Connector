const AddressService = require('../services/addressService');

async function testFetchAllAddresses() {
  try {
    console.log('🧪 Testando método fetchAllAddresses...');
    
    const addressService = new AddressService();
    
    // Teste com configuração específica
    console.log('📄 Buscando todos os endereços com maxRequests: 10...');
    const allAddresses = await addressService.fetchAllAddresses({
      size: 1000,
      maxRequests: 10 // Apenas 10 páginas para teste
    });
    
    console.log('✅ Resultado:', {
      totalAddresses: allAddresses.length,
      sampleAddresses: allAddresses.slice(0, 3).map(addr => ({
        userId: addr.userId,
        accountId: addr.accountId,
        city: addr.city,
        state: addr.state
      }))
    });
    
    // Verificar se há diferentes accountIds
    const uniqueAccountIds = [...new Set(allAddresses.map(addr => addr.accountId))];
    console.log('📊 AccountIds únicos encontrados:', uniqueAccountIds.length);
    console.log('📊 AccountIds:', uniqueAccountIds);
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

testFetchAllAddresses();
