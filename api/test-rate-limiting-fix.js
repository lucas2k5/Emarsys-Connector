const AddressService = require('../services/addressService');

async function testRateLimitingFix() {
  try {
    console.log('🧪 Testando correções de rate limiting...');
    
    const addressService = new AddressService();
    
    // Teste 1: Buscar alguns endereços com as novas configurações
    console.log('📄 Teste 1: Buscando endereços com rate limiting corrigido...');
    const addresses = await addressService.fetchAllAddresses({
      size: 1000,
      maxRequests: 5 // Apenas 5 páginas para teste
    });
    
    console.log('✅ Resultado:', {
      totalAddresses: addresses.length,
      sampleAddresses: addresses.slice(0, 3).map(addr => ({
        userId: addr.userId,
        accountId: addr.accountId,
        city: addr.city,
        state: addr.state
      }))
    });
    
    // Teste 2: Verificar se há diferentes accountIds
    const uniqueAccountIds = [...new Set(addresses.map(addr => addr.accountId))];
    console.log('📊 AccountIds únicos encontrados:', uniqueAccountIds.length);
    console.log('📊 AccountIds:', uniqueAccountIds);
    
    // Teste 3: Verificar se há diferentes userIds
    const uniqueUserIds = [...new Set(addresses.map(addr => addr.userId))];
    console.log('📊 UserIds únicos encontrados:', uniqueUserIds.length);
    console.log('📊 Primeiros 5 userIds:', uniqueUserIds.slice(0, 5));
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

testRateLimitingFix();
