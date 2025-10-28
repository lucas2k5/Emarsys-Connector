/**
 * Exemplo de uso da funcionalidade de período automático baseado no cron
 * 
 * Esta funcionalidade permite que a rota /api/integration/orders-extract-all
 * calcule automaticamente o período de sincronização baseado na configuração
 * do ORDERS_SYNC_CRON quando nenhum parâmetro é fornecido.
 */

const axios = require('axios');

// Configurações de exemplo
const baseUrl = 'http://localhost:3000';

/**
 * Exemplo 1: Chamada sem parâmetros (usa período do cron)
 */
async function exemplo1_SemParametros() {
  console.log('📋 Exemplo 1: Chamada sem parâmetros (usa período do cron)');
  
  try {
    const response = await axios.get(`${baseUrl}/api/integration/orders-extract-all`);
    
    console.log('✅ Resposta:', {
      success: response.data.success,
      message: response.data.message,
      period: response.data.data?.period,
      totalOrders: response.data.data?.totalOrdersDetailed
    });
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
  }
}

/**
 * Exemplo 2: Chamada com data brasileira (sobrescreve o cron)
 */
async function exemplo2_ComDataBrasileira() {
  console.log('\n📋 Exemplo 2: Chamada com data brasileira (sobrescreve o cron)');
  
  try {
    const response = await axios.get(`${baseUrl}/api/integration/orders-extract-all`, {
      params: {
        brazilianDate: '2025-09-28',
        startTime: '08:00',
        endTime: '18:00'
      }
    });
    
    console.log('✅ Resposta:', {
      success: response.data.success,
      message: response.data.message,
      period: response.data.data?.period,
      totalOrders: response.data.data?.totalOrdersDetailed
    });
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
  }
}

/**
 * Exemplo 3: Chamada com datas UTC (sobrescreve o cron)
 */
async function exemplo3_ComDatasUTC() {
  console.log('\n📋 Exemplo 3: Chamada com datas UTC (sobrescreve o cron)');
  
  try {
    const response = await axios.get(`${baseUrl}/api/integration/orders-extract-all`, {
      params: {
        startDate: '2025-09-28T00:00:00.000Z',
        toDate: '2025-09-28T23:59:59.999Z'
      }
    });
    
    console.log('✅ Resposta:', {
      success: response.data.success,
      message: response.data.message,
      period: response.data.data?.period,
      totalOrders: response.data.data?.totalOrdersDetailed
    });
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
  }
}

/**
 * Demonstração de diferentes configurações de cron
 */
function demonstrarConfiguracoesCron() {
  console.log('\n🕐 Configurações de cron suportadas:');
  
  const configs = [
    {
      cron: '*/30 * * * *',
      descricao: 'A cada 30 minutos',
      periodo: 'Último intervalo de 30 minutos até agora'
    },
    {
      cron: '0 */2 * * *',
      descricao: 'A cada 2 horas',
      periodo: 'Último intervalo de 2 horas até agora'
    },
    {
      cron: '0 0 * * *',
      descricao: 'Diariamente à meia-noite',
      periodo: 'Dia anterior (se antes das 6h) ou dia atual'
    },
    {
      cron: '0 8 * * *',
      descricao: 'Diariamente às 8h',
      periodo: 'Dia anterior (se antes das 8h) ou dia atual'
    },
    {
      cron: '0 0 * * 1',
      descricao: 'Segunda-feira à meia-noite',
      periodo: 'Semana anterior (se não for segunda) ou semana atual'
    }
  ];
  
  configs.forEach((config, index) => {
    console.log(`\n${index + 1}. ${config.descricao}`);
    console.log(`   Cron: ${config.cron}`);
    console.log(`   Período: ${config.periodo}`);
  });
}

/**
 * Executa todos os exemplos
 */
async function executarExemplos() {
  console.log('🚀 Exemplos de uso da funcionalidade de período automático\n');
  
  demonstrarConfiguracoesCron();
  
  // Descomente as linhas abaixo para testar as chamadas reais
  // await exemplo1_SemParametros();
  // await exemplo2_ComDataBrasileira();
  // await exemplo3_ComDatasUTC();
  
  console.log('\n💡 Dicas de uso:');
  console.log('- Sem parâmetros: usa período baseado no ORDERS_SYNC_CRON');
  console.log('- Com parâmetros: sobrescreve o período do cron');
  console.log('- Período do cron é calculado dinamicamente baseado na hora atual');
  console.log('- Suporte a timezone configurável via CRON_TIMEZONE');
}

// Executa os exemplos se o arquivo for chamado diretamente
if (require.main === module) {
  executarExemplos();
}

module.exports = {
  exemplo1_SemParametros,
  exemplo2_ComDataBrasileira,
  exemplo3_ComDatasUTC,
  demonstrarConfiguracoesCron
};
