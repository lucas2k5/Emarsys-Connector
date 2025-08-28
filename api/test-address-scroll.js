const AddressService = require('../services/addressService');

async function testAddressScroll() {
  try {
    console.log('🧪 Testando endpoint /scroll para entidade AD...');
    
    const addressService = new AddressService();
    
    // Teste 1: Busca inicial sem token
    console.log('📄 Teste 1: Busca inicial sem token...');
    const response1 = await addressService.fetchAddressesWithScroll('', 10);
    
    console.log('✅ Resposta 1:', {
      status: response1.status,
      dataLength: response1.data ? response1.data.length : 0,
      hasToken: !!(response1.headers?.['x-vtex-page-token'] || response1.headers?.['x-vtex-md-token']),
      token: response1.headers?.['x-vtex-page-token'] || response1.headers?.['x-vtex-md-token'] || 'nenhum',
      contentRange: response1.headers?.['rest-content-range']
    });
    
    if (response1.data && response1.data.length > 0) {
      console.log('📋 Primeiro endereço:', JSON.stringify(response1.data[0], null, 2));
    }
    
    // Teste 2: Busca com token (se disponível)
    const token = response1.headers?.['x-vtex-page-token'] || response1.headers?.['x-vtex-md-token'];
    
    if (token) {
      console.log('📄 Teste 2: Busca com token...');
      const response2 = await addressService.fetchAddressesWithScroll(token, 10);
      
      console.log('✅ Resposta 2:', {
        status: response2.status,
        dataLength: response2.data ? response2.data.length : 0,
        hasToken: !!(response2.headers?.['x-vtex-page-token'] || response2.headers?.['x-vtex-md-token']),
        token: response2.headers?.['x-vtex-page-token'] || response2.headers?.['x-vtex-md-token'] || 'nenhum',
        contentRange: response2.headers?.['rest-content-range']
      });
      
      if (response2.data && response2.data.length > 0) {
        console.log('📋 Primeiro endereço da página 2:', JSON.stringify(response2.data[0], null, 2));
      }
    } else {
      console.log('⚠️ Nenhum token retornado, não é possível testar paginação');
    }
    
    // Teste 3: Busca usando endpoint /search para comparar
    console.log('📄 Teste 3: Comparando com endpoint /search...');
    const searchResponse = await addressService.fetchAddressesByUserId('00004c80-bcc0-11ec-835d-0261dabd451b');
    
    console.log('✅ Resposta /search:', {
      dataLength: searchResponse.length,
      sampleAddress: searchResponse.length > 0 ? searchResponse[0] : null
    });
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
}

testAddressScroll();
