#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const packagePath = path.join(__dirname, '..', 'package.json');
const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
const releasesPath = path.join(__dirname, '..', 'docs', 'releases.md');

// Função para fazer perguntas
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Função para incrementar versão
function incrementVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);
  
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error('Tipo de versão inválido');
  }
}

// Função para executar comando git
function execGit(command) {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch (error) {
    console.error(`Erro ao executar: ${command}`);
    console.error(error.message);
    throw error;
  }
}

// Função para obter IP local
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Pular endereços internos e não-ipv4
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'N/A';
}

// Função para obter informações da máquina
function getMachineInfo() {
  return {
    hostname: os.hostname(),
    username: os.userInfo().username,
    platform: os.platform(),
    arch: os.arch(),
    ip: getLocalIP(),
    nodeVersion: process.version
  };
}

async function main() {
  try {
    console.log('\n🚀 Script de Deploy - Versionamento Automático\n');
    
    // 1. Ler package.json
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const currentVersion = packageJson.version;
    
    console.log(`📦 Versão atual: ${currentVersion}\n`);
    
    // 2. Perguntar tipo de versão
    const versionType = await question('Tipo de versão (major/minor/patch): ');
    
    if (!['major', 'minor', 'patch'].includes(versionType.toLowerCase())) {
      console.error('❌ Tipo de versão inválido! Use: major, minor ou patch');
      rl.close();
      process.exit(1);
    }
    
    // 3. Calcular nova versão
    const newVersion = incrementVersion(currentVersion, versionType.toLowerCase());
    console.log(`\n✨ Nova versão: ${newVersion}\n`);
    
    // 4. Coletar mudanças
    console.log('📝 Descreva as mudanças (pressione Enter duas vezes para finalizar):');
    const changes = [];
    let emptyLineCount = 0;
    
    const collectChanges = () => {
      return new Promise((resolve) => {
        rl.on('line', (line) => {
          if (line.trim() === '') {
            emptyLineCount++;
            if (emptyLineCount >= 2) {
              rl.removeAllListeners('line');
              resolve();
            }
          } else {
            emptyLineCount = 0;
            changes.push(line);
          }
        });
      });
    };
    
    await collectChanges();
    
    if (changes.length === 0) {
      console.error('\n❌ Nenhuma mudança foi descrita!');
      rl.close();
      process.exit(1);
    }
    
    // 5. Atualizar package.json
    console.log('\n📦 Atualizando package.json...');
    packageJson.version = newVersion;
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
    
    // 6. Atualizar CHANGELOG.md
    console.log('📄 Atualizando CHANGELOG.md...');
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    
    let changelogContent = '';
    if (fs.existsSync(changelogPath)) {
      changelogContent = fs.readFileSync(changelogPath, 'utf-8');
    } else {
      changelogContent = '# Changelog\n\nTodas as mudanças notáveis deste projeto serão documentadas neste arquivo.\n\n';
    }
    
    const changelogEntry = `## [${newVersion}] - ${dateStr}\n\n${changes.map(c => `- ${c}`).join('\n')}\n\n`;
    
    // Inserir após o cabeçalho
    const lines = changelogContent.split('\n');
    let insertIndex = 0;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('## [')) {
        insertIndex = i;
        break;
      }
    }
    
    if (insertIndex === 0) {
      // Se não encontrar nenhuma entrada, adicionar após o cabeçalho
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === '') {
          insertIndex = i + 1;
          break;
        }
      }
    }
    
    lines.splice(insertIndex, 0, changelogEntry);
    fs.writeFileSync(changelogPath, lines.join('\n'));
    
    // 7. Criar branch e commit
    console.log('\n🌿 Criando branch e commit...');
    
    const branchName = `feature/v${newVersion}`;
    
    try {
      // Criar e mudar para nova branch
      execGit(`git checkout -b ${branchName}`);
      console.log(`✓ Branch criada: ${branchName}`);
      
      // Adicionar arquivos
      execGit('git add package.json CHANGELOG.md');
      console.log('✓ Arquivos adicionados ao stage');
      
      // Fazer commit
      execGit(`git commit -m "bump version ${newVersion}"`);
      console.log(`✓ Commit realizado: "bump version ${newVersion}"`);
      
      console.log('\n✅ Deploy preparado com sucesso!');
      
      // 8. Atualizar releases.md
      console.log('\n📋 Atualizando documentação de releases...');
      
      const machineInfo = getMachineInfo();
      const releaseDate = new Date();
      const dateTimeStr = releaseDate.toLocaleString('pt-BR', { 
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      // Criar diretório docs se não existir
      const docsDir = path.join(__dirname, '..', 'docs');
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }
      
      let releasesContent = '';
      if (fs.existsSync(releasesPath)) {
        releasesContent = fs.readFileSync(releasesPath, 'utf-8');
      } else {
        releasesContent = '# Releases\n\nHistórico de todas as releases do projeto.\n\n---\n\n';
      }
      
      const releaseEntry = `## Versão ${newVersion}\n\n` +
        `**📅 Data e Hora:** ${dateTimeStr}\n\n` +
        `**🔧 Mudanças:**\n${changes.map(c => `- ${c}`).join('\n')}\n\n` +
        `**💻 Informações da Máquina:**\n` +
        `- **Hostname:** ${machineInfo.hostname}\n` +
        `- **Usuário:** ${machineInfo.username}\n` +
        `- **IP:** ${machineInfo.ip}\n` +
        `- **Sistema Operacional:** ${machineInfo.platform} (${machineInfo.arch})\n` +
        `- **Node.js:** ${machineInfo.nodeVersion}\n\n` +
        `---\n\n`;
      
      // Inserir após o cabeçalho
      const releaseLines = releasesContent.split('\n');
      let releaseInsertIndex = 0;
      
      for (let i = 0; i < releaseLines.length; i++) {
        if (releaseLines[i].startsWith('## Versão')) {
          releaseInsertIndex = i;
          break;
        }
        if (releaseLines[i] === '---') {
          releaseInsertIndex = i + 1;
          break;
        }
      }
      
      if (releaseInsertIndex === 0) {
        releaseInsertIndex = releaseLines.length;
      }
      
      releaseLines.splice(releaseInsertIndex, 0, releaseEntry);
      fs.writeFileSync(releasesPath, releaseLines.join('\n'));
      
      // Adicionar releases.md ao commit
      try {
        execGit('git add docs/releases.md');
        execGit(`git commit --amend --no-edit`);
        console.log('✓ Documentação de releases atualizada e incluída no commit');
      } catch (error) {
        console.warn('⚠️  Aviso: Não foi possível adicionar releases.md ao commit');
      }
      
      console.log(`\n📋 Próximos passos:`);
      console.log(`   1. Revise as mudanças: git show`);
      console.log(`   2. Envie para o repositório: git push origin ${branchName}`);
      console.log(`   3. Crie um Pull Request no GitHub/GitLab`);
      
    } catch (error) {
      console.error('\n❌ Erro ao executar comandos git');
      console.error('As mudanças nos arquivos foram mantidas, mas o commit não foi realizado.');
    }
    
    rl.close();
    
  } catch (error) {
    console.error('\n❌ Erro durante o deploy:', error.message);
    rl.close();
    process.exit(1);
  }
}

main();
