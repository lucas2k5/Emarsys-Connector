#!/usr/bin/env node

/**
 * Script para consultar o banco SQLite
 * Uso: node scripts/db-query.js <comando>
 * 
 * Comandos disponíveis:
 * - stats: Mostra estatísticas do banco
 * - pending: Lista pedidos pendentes
 * - all: Lista todos os pedidos (limitado)
 * - count: Conta total de registros
 */

const { getDatabase } = require('../database/sqlite');

async function main() {
  const command = process.argv[2] || 'stats';
  const db = getDatabase();
  
  try {
    await db.init();
    
    switch (command) {
      case 'stats':
        const stats = db.getStats();
        console.log('📊 Estatísticas do Banco:');
        console.log(`   Total: ${stats.total}`);
        console.log(`   Pendentes: ${stats.pending}`);
        console.log(`   Sincronizados: ${stats.synced}`);
        break;
        
      case 'pending':
        const limit = parseInt(process.argv[3]) || 10;
        const pending = db.listPendingSync({ limit });
        console.log(`📋 Pedidos Pendentes (${pending.length}):`);
        console.log(JSON.stringify(pending, null, 2));
        break;
        
      case 'all':
        const allLimit = parseInt(process.argv[3]) || 10;
        const all = db.listAllOrders({ limit: allLimit });
        console.log(`📋 Todos os Pedidos (${all.length}):`);
        console.log(JSON.stringify(all, null, 2));
        break;
        
      case 'count':
        const stats2 = db.getStats();
        console.log(`Total de registros: ${stats2.total}`);
        break;
        
      default:
        console.log('❌ Comando não reconhecido. Use: stats, pending, all ou count');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

main();

