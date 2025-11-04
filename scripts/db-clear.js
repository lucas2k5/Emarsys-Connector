#!/usr/bin/env node

/**
 * Script para limpar o banco SQLite
 * Uso: node scripts/db-clear.js [opções]
 * 
 * Opções:
 * - --all ou -a: Remove todos os registros
 * - --pending ou -p: Remove apenas pedidos pendentes (isSync = 0)
 * - --drop ou -d: Remove o arquivo do banco completamente (recria na próxima execução)
 * 
 * Exemplos:
 *   node scripts/db-clear.js --pending    # Remove apenas pendentes
 *   node scripts/db-clear.js --all         # Remove todos os registros
 *   node scripts/db-clear.js --drop        # Remove o arquivo do banco
 */

const { getDatabase } = require('../database/sqlite');
const readline = require('readline');

async function confirmAction(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (s/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 's' || answer.toLowerCase() === 'y' || answer.toLowerCase() === 'sim');
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const option = args[0];

  const db = getDatabase();
  
  try {
    await db.init();
    
    // Mostrar estatísticas antes
    const stats = db.getStats();
    console.log('\n📊 Estatísticas atuais:');
    console.log(`   Total: ${stats.total}`);
    console.log(`   Pendentes: ${stats.pending}`);
    console.log(`   Sincronizados: ${stats.synced}\n`);

    if (option === '--drop' || option === '-d') {
      // Remover arquivo do banco
      const confirmed = await confirmAction('⚠️  ATENÇÃO: Isso irá remover o arquivo do banco completamente. Continuar?');
      if (!confirmed) {
        console.log('❌ Operação cancelada');
        process.exit(0);
      }
      
      const result = await db.dropDatabase();
      if (result.success) {
        console.log('✅ Banco de dados removido. Será recriado na próxima execução.');
      } else {
        console.error('❌ Erro:', result.error || result.message);
        process.exit(1);
      }
      
    } else if (option === '--pending' || option === '-p') {
      // Remover apenas pendentes
      const confirmed = await confirmAction(`⚠️  Remover ${stats.pending} pedidos pendentes?`);
      if (!confirmed) {
        console.log('❌ Operação cancelada');
        process.exit(0);
      }
      
      const result = db.clearOrders(true);
      if (result.success) {
        console.log(`✅ ${result.deleted} pedidos pendentes removidos`);
      } else {
        console.error('❌ Erro:', result.error);
        process.exit(1);
      }
      
    } else if (option === '--all' || option === '-a') {
      // Remover todos
      const confirmed = await confirmAction(`⚠️  ATENÇÃO: Remover TODOS os ${stats.total} registros?`);
      if (!confirmed) {
        console.log('❌ Operação cancelada');
        process.exit(0);
      }
      
      const result = db.clearOrders(false);
      if (result.success) {
        console.log(`✅ ${result.deleted} registros removidos`);
      } else {
        console.error('❌ Erro:', result.error);
        process.exit(1);
      }
      
    } else {
      console.log('❌ Opção inválida\n');
      console.log('Uso: node scripts/db-clear.js [opção]');
      console.log('\nOpções:');
      console.log('  --pending, -p    Remove apenas pedidos pendentes');
      console.log('  --all, -a        Remove todos os registros');
      console.log('  --drop, -d        Remove o arquivo do banco completamente');
      process.exit(1);
    }

    // Mostrar estatísticas depois
    if (option !== '--drop' && option !== '-d') {
      await db.init(); // Re-inicializar se necessário
      const newStats = db.getStats();
      console.log('\n📊 Estatísticas após limpeza:');
      console.log(`   Total: ${newStats.total}`);
      console.log(`   Pendentes: ${newStats.pending}`);
      console.log(`   Sincronizados: ${newStats.synced}\n`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

main();

