#!/usr/bin/env node

/**
 * Script de pós-instalação para configurar o sistema de monitoramento
 * Executado automaticamente após npm install
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Configurando sistema de monitoramento...');

// Criar diretórios necessários
const directories = [
  'logs',
  'data',
  'exports',
  'config'
];

directories.forEach(dir => {
  const dirPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Diretório criado: ${dir}`);
  } else {
    console.log(`📁 Diretório já existe: ${dir}`);
  }
});

// Criar arquivo de configuração de exemplo se não existir
const envExamplePath = path.join(process.cwd(), 'env.example');
if (fs.existsSync(envExamplePath)) {
  const envContent = fs.readFileSync(envExamplePath, 'utf8');
  
  // Adicionar configurações de monitoramento se não existirem
  if (!envContent.includes('LOG_LEVEL')) {
    const monitoringConfig = `

# Configuração de Monitoramento e Logging
LOG_LEVEL=info
NODE_ENV=development

# Configuração de Alertas
ALERT_ERROR_RATE=0.1
ALERT_RESPONSE_TIME=5000
ALERT_MEMORY_USAGE=0.9
ALERT_CONSECUTIVE_ERRORS=5
`;

    fs.appendFileSync(envExamplePath, monitoringConfig);
    console.log('✅ Configurações de monitoramento adicionadas ao env.example');
  }
}

// Criar arquivo .gitignore para logs se não existir
const gitignorePath = path.join(process.cwd(), '.gitignore');
const gitignoreContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';

if (!gitignoreContent.includes('logs/')) {
  const gitignoreAdditions = `

# Logs do sistema de monitoramento
logs/
data/alerts.json
*.log
`;

  fs.appendFileSync(gitignorePath, gitignoreAdditions);
  console.log('✅ Configurações de .gitignore atualizadas');
}

console.log('🎉 Sistema de monitoramento configurado com sucesso!');
console.log('');
console.log('📊 Dashboards disponíveis:');
console.log('   Métricas: http://localhost:3000/api/metrics/dashboard');
console.log('   Alertas: http://localhost:3000/api/alerts/dashboard');
console.log('');
console.log('🔧 Scripts úteis:');
console.log('   npm run test:monitoring  - Testar sistema de monitoramento');
console.log('   npm run logs:view        - Ver logs da aplicação');
console.log('   npm run logs:error       - Ver logs de erro');
console.log('   npm run metrics:view     - Abrir dashboard de métricas');
console.log('   npm run alerts:view      - Abrir dashboard de alertas');
console.log('');
console.log('📚 Documentação: MONITORING.md');
