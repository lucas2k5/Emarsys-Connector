#!/usr/bin/env node

/**
 * Script para gerar CSV dos pedidos pendentes no SQLite
 * Uso: node scripts/generate-csv-from-pending.js
 */

const OrdersSyncService = require('../services/ordersSyncService');

async function main() {
  console.log('🔄 Iniciando geração de CSV dos pedidos pendentes...\n');
  
  try {
    const ordersSyncService = new OrdersSyncService();
    
    // Buscar pedidos pendentes
    console.log('📋 Buscando pedidos pendentes do SQLite...');
    const pendingOrders = await ordersSyncService.getPendingSyncOrders({ limit: 1000 });
    console.log(`✅ Encontrados ${pendingOrders.length} pedidos pendentes\n`);
    
    if (pendingOrders.length === 0) {
      console.log('ℹ️ Nenhum pedido pendente encontrado. Nada para gerar.');
      process.exit(0);
    }
    
    // Transformar para formato Emarsys
    console.log('🔄 Transformando pedidos para formato Emarsys...');
    const transformed = await ordersSyncService.transformOrdersForEmarsys(pendingOrders);
    console.log(`✅ ${transformed.emarsysData?.length || 0} pedidos transformados\n`);
    
    if (!transformed.emarsysData || transformed.emarsysData.length === 0) {
      console.log('⚠️ Nenhum pedido transformado. Verifique os dados.');
      process.exit(1);
    }
    
    // Gerar CSV (sem autoSend para não enviar automaticamente)
    console.log('📊 Gerando arquivo CSV...');
    const csvResult = await ordersSyncService.generateCsvFromOrders(transformed.emarsysData, {
      autoSend: false, // Não enviar automaticamente
      period: 'pending-orders'
    });
    
    if (csvResult.success) {
      console.log('\n✅ CSV gerado com sucesso!');
      console.log(`   Arquivo: ${csvResult.filename}`);
      console.log(`   Caminho: ${csvResult.filePath}`);
      console.log(`   Tamanho: ${(csvResult.fileSize / 1024).toFixed(2)} KB`);
      console.log(`   Pedidos: ${csvResult.totalOrders}`);
    } else {
      console.error('\n❌ Erro ao gerar CSV:', csvResult.error);
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

