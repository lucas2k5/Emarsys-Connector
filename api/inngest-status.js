/**
 * Endpoint para verificar status do Inngest
 */

const { inngest, syncVTEXProducts, syncVTEXOrders, syncComplete } = require('../lib/inngest');

module.exports = async (req, res) => {
  try {
    console.log('🔍 Verificando status do Inngest...');
    
    // Verificar configuração do Inngest
    const inngestConfig = {
      id: inngest.id,
      name: inngest.name,
      env: inngest.env,
      eventKey: process.env.INNGEST_EVENT_KEY ? 'configurado' : 'não configurado',
      signingKey: process.env.INNGEST_SIGNING_KEY ? 'configurado' : 'não configurado'
    };
    
    // Verificar funções registradas
    const functions = [
      {
        id: syncVTEXProducts.id,
        name: syncVTEXProducts.name,
        event: 'vtex.sync.start'
      },
      {
        id: syncVTEXOrders.id,
        name: syncVTEXOrders.name,
        event: 'vtex.orders.sync'
      },
      {
        id: syncComplete.id,
        name: syncComplete.name,
        event: 'vtex.sync.complete'
      }
    ];
    
    // Testar envio de evento simples
    let eventTest = null;
    try {
      const testEvent = {
        name: "test.inngest.status",
        data: { 
          timestamp: new Date().toISOString(),
          test: true
        }
      };
      
      const result = await inngest.send(testEvent);
      eventTest = { success: true, result };
    } catch (error) {
      eventTest = { success: false, error: error.message };
    }
    
    res.json({
      success: true,
      message: 'Status do Inngest verificado',
      inngestConfig,
      functions,
      eventTest,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL ? 'Sim' : 'Não',
        INNGEST_ENV: process.env.INNGEST_ENV
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao verificar status do Inngest:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};
