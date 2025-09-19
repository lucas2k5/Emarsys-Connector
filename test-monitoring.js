/**
 * SCRIPT DE TESTE DO SISTEMA DE MONITORAMENTO
 * 
 * Execute este script para testar o sistema de logging, métricas e alertas
 */

const axios = require('axios');

const BASE_URL = 'http://177.93.135.200';

async function testMonitoringSystem() {
  console.log('🧪 Iniciando testes do sistema de monitoramento...\n');

  try {
    // 1. Testar health check
    console.log('1. Testando health check...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health check:', healthResponse.data);

    // 2. Testar métricas
    console.log('\n2. Testando métricas...');
    const metricsResponse = await axios.get(`${BASE_URL}/api/metrics/json`);
    console.log('✅ Métricas obtidas:', metricsResponse.data.data.length, 'métricas');

    // 3. Testar alertas
    console.log('\n3. Testando alertas...');
    const alertsResponse = await axios.get(`${BASE_URL}/api/alerts/active`);
    console.log('✅ Alertas ativos:', alertsResponse.data.data.total);

    // 4. Criar alerta de teste
    console.log('\n4. Criando alerta de teste...');
    const testAlert = await axios.post(`${BASE_URL}/api/alerts`, {
      type: 'test_alert',
      severity: 'medium',
      message: 'Alerta de teste criado pelo script',
      metadata: {
        test: true,
        timestamp: new Date().toISOString()
      }
    });
    console.log('✅ Alerta criado:', testAlert.data.data.alertId);

    // 5. Testar operações que geram métricas
    console.log('\n5. Testando operações que geram métricas...');
    
    // Simular requisições HTTP
    for (let i = 0; i < 5; i++) {
      try {
        await axios.get(`${BASE_URL}/api/metrics/health`);
        console.log(`   Requisição ${i + 1} realizada`);
      } catch (error) {
        console.log(`   Erro na requisição ${i + 1}:`, error.message);
      }
    }

    // 6. Verificar métricas atualizadas
    console.log('\n6. Verificando métricas atualizadas...');
    const updatedMetrics = await axios.get(`${BASE_URL}/api/metrics/json`);
    const httpMetrics = updatedMetrics.data.data.filter(m => m.name.includes('http'));
    console.log('✅ Métricas HTTP encontradas:', httpMetrics.length);

    // 7. Verificar alertas atualizados
    console.log('\n7. Verificando alertas atualizados...');
    const updatedAlerts = await axios.get(`${BASE_URL}/api/alerts/active`);
    console.log('✅ Total de alertas ativos:', updatedAlerts.data.data.total);

    // 8. Resolver alerta de teste
    if (updatedAlerts.data.data.alerts.length > 0) {
      const testAlertId = updatedAlerts.data.data.alerts[0].id;
      console.log('\n8. Resolvendo alerta de teste...');
      const resolveResponse = await axios.post(`${BASE_URL}/api/alerts/${testAlertId}/resolve`, {
        resolution: 'Resolvido pelo script de teste'
      });
      console.log('✅ Alerta resolvido:', resolveResponse.data.message);
    }

    // 9. Verificar estatísticas finais
    console.log('\n9. Verificando estatísticas finais...');
    const statsResponse = await axios.get(`${BASE_URL}/api/alerts/stats`);
    console.log('✅ Estatísticas de alertas:', statsResponse.data.data);

    console.log('\n🎉 Todos os testes concluídos com sucesso!');
    console.log('\n📊 Dashboards disponíveis:');
    console.log(`   Métricas: ${BASE_URL}/api/metrics/dashboard`);
    console.log(`   Alertas: ${BASE_URL}/api/alerts/dashboard`);
    console.log(`   Prometheus: ${BASE_URL}/api/metrics/prometheus`);

  } catch (error) {
    console.error('❌ Erro durante os testes:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

// Executar testes se o script for chamado diretamente
if (require.main === module) {
  testMonitoringSystem();
}

module.exports = testMonitoringSystem;
