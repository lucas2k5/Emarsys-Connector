#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const packagePath = path.join(__dirname, '..', 'package.json');
const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');

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
