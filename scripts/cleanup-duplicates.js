#!/usr/bin/env node

/**
 * Script para limpar duplicatas no arquivo processed-orders.json
 * Este script remove duplicatas baseadas no uniqueItemId (orderId + itemId)
 */

const fs = require('fs-extra');
const path = require('path');

async function cleanupDuplicates() {
  try {
    console.log('🧹 Iniciando limpeza de duplicatas...');
    
    const dataDir = path.join(__dirname, '..', 'data');
    const processedOrdersFile = path.join(dataDir, 'processed-orders.json');
    const backupFile = path.join(dataDir, 'processed-orders.backup.json');
    
    if (!fs.existsSync(processedOrdersFile)) {
      console.log('ℹ️ Arquivo processed-orders.json não encontrado. Nada para limpar.');
      return;
    }
    
    // Cria backup do arquivo original
    console.log('💾 Criando backup do arquivo original...');
    await fs.copy(processedOrdersFile, backupFile);
    console.log(`✅ Backup criado: ${backupFile}`);
    
    // Lê o arquivo atual
    console.log('📖 Lendo arquivo de pedidos processados...');
    const fileContent = await fs.readFile(processedOrdersFile, 'utf8');
    const data = JSON.parse(fileContent);
    
    const originalCount = data.processedOrders.length;
    console.log(`📊 Total de registros originais: ${originalCount}`);
    
    // Remove duplicatas baseadas no uniqueItemId
    const uniqueItems = new Map();
    const cleanedOrders = [];
    
    for (const order of data.processedOrders) {
      // Cria uniqueItemId se não existir (compatibilidade com formato antigo)
      const uniqueItemId = order.uniqueItemId || `${order.orderId}_${order.itemId || 'unknown'}`;
      
      // Se já existe, mantém o mais recente
      if (uniqueItems.has(uniqueItemId)) {
        const existing = uniqueItems.get(uniqueItemId);
        const existingDate = new Date(existing.processedAt);
        const currentDate = new Date(order.processedAt);
        
        // Mantém o mais recente
        if (currentDate > existingDate) {
          uniqueItems.set(uniqueItemId, {
            ...order,
            uniqueItemId
          });
        }
      } else {
        uniqueItems.set(uniqueItemId, {
          ...order,
          uniqueItemId
        });
      }
    }
    
    // Converte de volta para array
    for (const [uniqueItemId, order] of uniqueItems) {
      cleanedOrders.push(order);
    }
    
    // Ordena por data de processamento (mais recente primeiro)
    cleanedOrders.sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt));
    
    const cleanedCount = cleanedOrders.length;
    const duplicatesRemoved = originalCount - cleanedCount;
    
    console.log(`📊 Registros após limpeza: ${cleanedCount}`);
    console.log(`🗑️ Duplicatas removidas: ${duplicatesRemoved}`);
    
    // Salva arquivo limpo
    const cleanedData = {
      ...data,
      processedOrders: cleanedOrders
    };
    
    await fs.writeJson(processedOrdersFile, cleanedData, { spaces: 2 });
    console.log('✅ Arquivo processed-orders.json atualizado com sucesso!');
    
    // Estatísticas finais
    console.log('\n📈 Resumo da limpeza:');
    console.log(`   • Registros originais: ${originalCount}`);
    console.log(`   • Registros únicos: ${cleanedCount}`);
    console.log(`   • Duplicatas removidas: ${duplicatesRemoved}`);
    console.log(`   • Arquivo de backup: ${path.basename(backupFile)}`);
    
  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error);
    process.exit(1);
  }
}

// Executa se chamado diretamente
if (require.main === module) {
  cleanupDuplicates();
}

module.exports = cleanupDuplicates;
