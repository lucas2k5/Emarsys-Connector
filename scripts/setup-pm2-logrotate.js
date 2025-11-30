#!/usr/bin/env node

/**
 * Script para configurar o pm2-logrotate para rotação diária de logs
 * Este script configura o módulo pm2-logrotate para:
 * - Rotacionar logs diariamente (não acumular em arquivo único)
 * - Manter apenas 7 dias de logs do PM2
 * - Comprimir logs antigos para economizar espaço
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Configurando rotação diária de logs do PM2...\n');

try {
  // Verificar se PM2 está instalado
  try {
    execSync('pm2 --version', { stdio: 'ignore' });
  } catch (error) {
    console.error('❌ PM2 não está instalado. Instale com: npm install -g pm2');
    process.exit(1);
  }

  // Instalar pm2-logrotate se não estiver instalado
  console.log('📦 Verificando/Instalando pm2-logrotate...');
  try {
    execSync('pm2 list | grep -q "pm2-logrotate"', { stdio: 'ignore' });
    console.log('✅ pm2-logrotate já está instalado');
  } catch (error) {
    console.log('📥 Instalando pm2-logrotate...');
    execSync('pm2 install pm2-logrotate', { stdio: 'inherit' });
  }

  // Configurar rotação diária
  console.log('\n⚙️  Configurando rotação diária de logs...\n');

  // Configurações do pm2-logrotate
  const configs = {
    max_size: '50M',           // Tamanho máximo antes de rotacionar (backup)
    retain: '7',               // Manter 7 dias de logs
    compress: 'true',          // Comprimir logs antigos
    dateFormat: 'YYYY-MM-DD',  // Formato de data nos arquivos rotacionados
    rotateModule: 'true',      // Rotacionar também logs de módulos
    workerInterval: '30',      // Verificar a cada 30 segundos
    rotateInterval: '0 0 * * *', // Rotacionar diariamente à meia-noite (cron format)
    TZ: 'America/Sao_Paulo'    // Fuso horário brasileiro
  };

  // Aplicar configurações
  Object.entries(configs).forEach(([key, value]) => {
    try {
      console.log(`  ✅ Configurando ${key} = ${value}`);
      execSync(`pm2 set pm2-logrotate:${key} ${value}`, { stdio: 'ignore' });
    } catch (error) {
      console.log(`  ⚠️  Não foi possível configurar ${key} (pode já estar configurado)`);
    }
  });

  // Reiniciar o módulo para aplicar as configurações
  console.log('\n🔄 Reiniciando módulo pm2-logrotate...');
  try {
    execSync('pm2 restart pm2-logrotate', { stdio: 'ignore' });
    console.log('✅ pm2-logrotate reiniciado');
  } catch (error) {
    console.log('⚠️  Módulo será reiniciado automaticamente');
  }

  console.log('\n✅ Configuração de rotação diária concluída!');
  console.log('\n📋 Resumo da configuração:');
  console.log('   - Rotação diária à meia-noite (horário de Brasília)');
  console.log('   - Mantém 7 dias de logs');
  console.log('   - Comprime logs antigos automaticamente');
  console.log('   - Tamanho máximo: 50MB antes de rotacionar (backup)');
  console.log('\n📁 Logs do PM2 serão salvos em:');
  console.log('   - ./logs/ems-pcy-pm2-out.log (rotacionado diariamente)');
  console.log('   - ./logs/ems-pcy-pm2-err.log (rotacionado diariamente)');
  console.log('\n💡 Para verificar as configurações: pm2 conf pm2-logrotate');

} catch (error) {
  console.error('\n❌ Erro ao configurar pm2-logrotate:', error.message);
  console.error('\n💡 Execute manualmente:');
  console.error('   1. pm2 install pm2-logrotate');
  console.error('   2. pm2 set pm2-logrotate:retain 7');
  console.error('   3. pm2 set pm2-logrotate:compress true');
  console.error('   4. pm2 set pm2-logrotate:rotateInterval "0 0 * * *"');
  console.error('   5. pm2 restart pm2-logrotate');
  process.exit(1);
}

