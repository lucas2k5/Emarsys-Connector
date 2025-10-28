#!/usr/bin/env node

/**
 * Script para limpar logs e dados
 * Remove todos os arquivos das pastas logs/ e data/
 */

const fs = require('fs');
const path = require('path');

// Cores para output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(message, color = 'reset') {
  console.log(colorize(message, color));
}

function clearDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    log(`⚠️  Diretório ${dirPath} não existe`, 'yellow');
    return { deleted: 0, errors: 0 };
  }

  let deleted = 0;
  let errors = 0;

  try {
    const files = fs.readdirSync(dirPath);
    
    if (files.length === 0) {
      log(`📁 Diretório ${dirPath} já está vazio`, 'blue');
      return { deleted: 0, errors: 0 };
    }

    log(`🧹 Limpando diretório: ${dirPath}`, 'cyan');
    
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      try {
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          // Remove diretório recursivamente
          fs.rmSync(filePath, { recursive: true, force: true });
          log(`  📁 Removido diretório: ${file}`, 'green');
        } else {
          // Remove arquivo
          fs.unlinkSync(filePath);
          log(`  📄 Removido arquivo: ${file}`, 'green');
        }
        deleted++;
      } catch (error) {
        log(`  ❌ Erro ao remover ${file}: ${error.message}`, 'red');
        errors++;
      }
    });
    
  } catch (error) {
    log(`❌ Erro ao acessar diretório ${dirPath}: ${error.message}`, 'red');
    errors++;
  }

  return { deleted, errors };
}

function main() {
  log('🚀 Iniciando limpeza de logs e dados...', 'magenta');
  log('=' * 50, 'cyan');
  
  const startTime = Date.now();
  let totalDeleted = 0;
  let totalErrors = 0;

  // Limpar pasta logs
  log('\n📂 Limpando pasta logs/', 'blue');
  const logsResult = clearDirectory('logs');
  totalDeleted += logsResult.deleted;
  totalErrors += logsResult.errors;

  // Limpar pasta data
  log('\n📂 Limpando pasta data/', 'blue');
  const dataResult = clearDirectory('data');
  totalDeleted += dataResult.deleted;
  totalErrors += dataResult.errors;

  // Resumo
  const duration = Date.now() - startTime;
  log('\n' + '=' * 50, 'cyan');
  log('📊 RESUMO DA LIMPEZA:', 'magenta');
  log(`✅ Arquivos/diretórios removidos: ${totalDeleted}`, 'green');
  log(`❌ Erros encontrados: ${totalErrors}`, totalErrors > 0 ? 'red' : 'green');
  log(`⏱️  Tempo de execução: ${duration}ms`, 'blue');
  
  if (totalErrors === 0) {
    log('\n🎉 Limpeza concluída com sucesso!', 'green');
  } else {
    log('\n⚠️  Limpeza concluída com alguns erros.', 'yellow');
  }

  // Criar diretórios vazios se não existirem
  try {
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs', { recursive: true });
      log('📁 Diretório logs/ recriado', 'blue');
    }
    
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data', { recursive: true });
      log('📁 Diretório data/ recriado', 'blue');
    }
  } catch (error) {
    log(`❌ Erro ao recriar diretórios: ${error.message}`, 'red');
  }

  log('\n💡 Dica: Use "npm run logs" para acompanhar os novos logs', 'cyan');
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { clearDirectory, main };
