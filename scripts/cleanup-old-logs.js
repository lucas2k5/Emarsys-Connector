#!/usr/bin/env node

/**
 * Script para limpar logs antigos com nomes longos e reorganizar estrutura
 */

const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', 'logs');

console.log('🧹 Limpando logs antigos com nomes longos...');

// Lista de padrões antigos para remover
const oldPatterns = [
  'hope-emarsys-',
  'orders-logs-',
  'product-logs-',
  'clients-logs-'
];

// Lista de arquivos de log atuais
const currentFiles = fs.readdirSync(logsDir);

let removedCount = 0;

currentFiles.forEach(file => {
  // Verifica se o arquivo corresponde aos padrões antigos
  const shouldRemove = oldPatterns.some(pattern => file.startsWith(pattern));
  
  if (shouldRemove) {
    const filePath = path.join(logsDir, file);
    try {
      fs.unlinkSync(filePath);
      console.log(`✅ Removido: ${file}`);
      removedCount++;
    } catch (error) {
      console.error(`❌ Erro ao remover ${file}:`, error.message);
    }
  }
});

console.log(`\n📊 Resumo:`);
console.log(`- Arquivos removidos: ${removedCount}`);
console.log(`- Logs restantes: ${currentFiles.length - removedCount}`);

console.log('\n✨ Nova estrutura de logs:');
console.log('📁 system-DD-MM-YYYY.log - Logs gerais do sistema');
console.log('📁 errors-DD-MM-YYYY.log - Logs de erros');
console.log('📁 http-DD-MM-YYYY.log - Logs HTTP');
console.log('📁 sync-DD-MM-YYYY.log - Logs de sincronização');
console.log('📁 retry-DD-MM-YYYY.log - Logs de reprocessamento');
console.log('📁 alerts-DD-MM-YYYY.log - Logs de alertas');
console.log('📁 metrics-DD-MM-YYYY.log - Logs de métricas');
console.log('📁 audit-DD-MM-YYYY.log - Logs de auditoria');
console.log('📁 cro-orders-DD-MM-YYYY.log - Logs de pedidos');
console.log('📁 cro-products-DD-MM-YYYY.log - Logs de produtos');
console.log('📁 cro-clients-DD-MM-YYYY.log - Logs de clientes');

console.log('\n🎯 Logs agora são mais acessíveis e organizados!');
