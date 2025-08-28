const ContactService = require('../services/contactService');
const AddressService = require('../services/addressService');

async function testMultipleAddresses() {
  try {
    console.log('🧪 Testando sistema com múltiplos endereços...');
    
    const contactService = new ContactService();
    const addressService = new AddressService();
    
    // Teste 1: Buscar alguns registros da CL para ver se há diferentes accountIds
    console.log('📄 Teste 1: Verificando accountIds únicos na CL...');
    const clRecords = await contactService.fetchAllCLRecordsWithVTEXScroll({
      size: 100,
      maxRequests: 1
    });
    
    const uniqueAccountIds = [...new Set(clRecords.map(record => record.accountId))];
    console.log(`📊 AccountIds únicos encontrados: ${uniqueAccountIds.length}`);
    console.log('📊 AccountIds:', uniqueAccountIds);
    
    // Teste 2: Buscar alguns endereços para ver se há diferentes accountIds
    console.log('📄 Teste 2: Verificando accountIds únicos na AD...');
    const addresses = await addressService.fetchAllAddresses({
      size: 1000,
      maxRequests: 10
    });
    
    const uniqueAddressAccountIds = [...new Set(addresses.map(addr => addr.accountId))];
    console.log(`📊 AccountIds únicos nos endereços: ${uniqueAddressAccountIds.length}`);
    console.log('📊 AccountIds nos endereços:', uniqueAddressAccountIds);
    
    // Teste 3: Verificar se há diferentes userIds para o mesmo accountId
    console.log('📄 Teste 3: Verificando userIds únicos para o mesmo accountId...');
    const addressesForSameAccount = addresses.filter(addr => addr.accountId === uniqueAccountIds[0]);
    const uniqueUserIds = [...new Set(addressesForSameAccount.map(addr => addr.userId))];
    console.log(`📊 UserIds únicos para accountId ${uniqueAccountIds[0]}: ${uniqueUserIds.length}`);
    console.log('📊 Primeiros 5 userIds:', uniqueUserIds.slice(0, 5));
    
    // Teste 4: Gerar CSV com uma amostra pequena para verificar se os endereços estão sendo distribuídos
    console.log('📄 Teste 4: Gerando CSV de teste com amostra pequena...');
    const sampleRecords = clRecords.slice(0, 5);
    const csvResult = await contactService.generateCLCSVWithAddresses(sampleRecords, {
      filename: 'test-multiple-addresses.csv'
    });
    
    console.log('✅ Resultado do CSV:', {
      success: csvResult.success,
      totalRecords: csvResult.totalRecords,
      totalAddressesFound: csvResult.totalAddressesFound
    });
    
    // Teste 5: Verificar se o sistema está usando userIds diferentes
    console.log('📄 Teste 5: Verificando se o sistema está usando userIds diferentes...');
    const addressMap = {};
    addresses.forEach(address => {
      const accountId = address.accountId;
      if (accountId) {
        if (!addressMap[accountId]) {
          addressMap[accountId] = [];
        }
        addressMap[accountId].push(address);
      }
    });
    
    console.log('📊 Mapa de endereços por accountId:');
    Object.keys(addressMap).forEach(accountId => {
      console.log(`  - AccountId ${accountId}: ${addressMap[accountId].length} endereços`);
      console.log(`    UserIds: ${addressMap[accountId].slice(0, 3).map(addr => addr.userId).join(', ')}...`);
    });
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

testMultipleAddresses();
