# 🧹 Configuração do Cron de Limpeza de Exports

## Descrição

Script automático que remove arquivos antigos da pasta `exports/` toda semana, todo domingo às 00:00.

**O que é deletado:**
- Arquivos da semana anterior (7-14 dias atrás)
- Mantém o arquivo `catalog.csv.gz`
- Remove apenas arquivos CSV de produtos e pedidos

## 📋 Métodos de Configuração

### Método 1: Crontab do Sistema Linux (Recomendado)

1. **Editar o crontab do usuário root:**
```bash
sudo crontab -e
```

2. **Adicionar a linha para executar todo domingo às 00:00:**
```bash
# Limpeza automática de exports - Todo domingo às 00:00
0 0 * * 0 curl -X POST http://localhost:3000/api/cron/cleanup-exports > /var/log/emarsys-cleanup.log 2>&1
```

3. **Verificar se o cron foi adicionado:**
```bash
sudo crontab -l
```

### Método 2: PM2 Cron Module

1. **Instalar o módulo pm2-cron:**
```bash
npm install -g pm2-cron
```

2. **Adicionar o cron job ao ecosystem.config.js:**
```javascript
module.exports = {
  apps: [
    {
      name: 'emarsys-server',
      script: './server.js',
      // ... outras configurações
    },
    {
      name: 'cleanup-exports-cron',
      script: 'curl',
      args: '-X POST http://localhost:3000/api/cron/cleanup-exports',
      cron_restart: '0 0 * * 0', // Todo domingo às 00:00
      watch: false,
      autorestart: false
    }
  ]
};
```

3. **Reiniciar o PM2:**
```bash
pm2 restart ecosystem.config.js
pm2 save
```

### Método 3: Node-cron (Integrado no Servidor)

Se você tiver um arquivo de configuração de crons no servidor (ex: `services/cronService.js`), adicione:

```javascript
const cron = require('node-cron');
const ExportsCleanup = require('../scripts/cleanup-old-exports');

// Executar todo domingo às 00:00
cron.schedule('0 0 * * 0', async () => {
  console.log('🕐 [Cron] Iniciando limpeza automática de exports...');
  
  try {
    const cleanup = new ExportsCleanup();
    const result = await cleanup.cleanup();
    
    console.log('✅ Limpeza concluída:', {
      filesDeleted: result.filesDeleted,
      spaceFreed: result.spaceFreedFormatted
    });
  } catch (error) {
    console.error('❌ Erro na limpeza automática:', error);
  }
}, {
  timezone: "America/Sao_Paulo"
});
```

## 🔧 Execução Manual

### Via API

```bash
# Executar limpeza da semana anterior
curl -X POST http://localhost:3000/api/cron/cleanup-exports

# Limpar arquivos de um mês específico
curl -X POST http://localhost:3000/api/cron/cleanup-month \
  -H "Content-Type: application/json" \
  -d '{"yearMonth": "2025-10"}'
```

### Via Linha de Comando

```bash
# Executar limpeza (produção)
cd /var/www/emarsys.connector
node scripts/cleanup-old-exports.js

# Simular limpeza (dry run) - apenas mostra o que seria deletado
node scripts/cleanup-old-exports.js --dry-run

# Limpar um mês específico
node scripts/cleanup-old-exports.js 2025-10

# Dry run de um mês específico
node scripts/cleanup-old-exports.js 2025-10 --dry-run
```

### Via SSH no Servidor

```bash
# Conectar ao servidor
ssh openflow-server

# Mudar para root
sudo su

# Ir para a pasta do projeto
cd /var/www/emarsys.connector

# Executar limpeza
node scripts/cleanup-old-exports.js
```

## 📊 Entendendo o Resultado

O script retorna um JSON com as seguintes informações:

```json
{
  "success": true,
  "filesScanned": 150,
  "filesDeleted": 25,
  "filesKept": 125,
  "filesWithoutDate": 0,
  "spaceFreed": 1048576,
  "spaceFreedFormatted": "1.00 MB",
  "deletedFiles": [
    {
      "filename": "emarsys-products-import-2025-10-28T09-29-38.csv",
      "date": "2025-10-28",
      "size": 41943,
      "sizeFormatted": "40.96 KB"
    }
  ],
  "period": {
    "start": "2025-10-28",
    "end": "2025-11-03"
  },
  "duration": 123,
  "timestamp": "2025-11-11T00:00:00.000Z"
}
```

## 🔍 Verificação e Monitoramento

### Ver logs do cron (Método 1 - Crontab)

```bash
tail -f /var/log/emarsys-cleanup.log
```

### Ver logs do PM2 (Método 2)

```bash
pm2 logs cleanup-exports-cron
```

### Verificar próxima execução (Crontab)

```bash
# Ver quando o cron vai executar
sudo systemctl status cron

# Ver logs do cron
sudo grep CRON /var/log/syslog
```

## 🛡️ Segurança

- O script **NUNCA** deleta o arquivo `catalog.csv.gz`
- Ignora diretórios, processa apenas arquivos
- Faz backup automático do resultado no log
- Suporta modo `--dry-run` para teste sem deletar

## 🧪 Testando a Configuração

1. **Teste com dry-run:**
```bash
node scripts/cleanup-old-exports.js --dry-run
```

2. **Verifique os arquivos que seriam deletados**

3. **Execute sem dry-run se estiver tudo ok:**
```bash
node scripts/cleanup-old-exports.js
```

## ⚙️ Configuração do Cron Expression

```
# ┌───────────── minuto (0-59)
# │ ┌───────────── hora (0-23)
# │ │ ┌───────────── dia do mês (1-31)
# │ │ │ ┌───────────── mês (1-12)
# │ │ │ │ ┌───────────── dia da semana (0-6) (0=domingo)
# │ │ │ │ │
# │ │ │ │ │
# * * * * *

0 0 * * 0  # Todo domingo às 00:00
```

### Outros exemplos:

```bash
# Todo dia às 02:00
0 2 * * *

# Toda segunda-feira às 03:00
0 3 * * 1

# Primeiro dia do mês às 00:00
0 0 1 * *

# A cada 6 horas
0 */6 * * *
```

## 📞 Suporte

Em caso de dúvidas ou problemas:
1. Verifique os logs do servidor
2. Execute o script manualmente com `--dry-run`
3. Verifique se o cron está ativo: `sudo systemctl status cron`

## 📝 Changelog

- **v1.0.0** (2025-11-11): Versão inicial do script de limpeza automática

