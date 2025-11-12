# 🧹 Script de Limpeza de Exports

## Descrição Rápida

Script que remove automaticamente arquivos antigos da pasta `exports/` todo domingo às 00:00.

## 🚀 Uso Rápido

### 1. Testar (Simular sem deletar)
```bash
npm run cleanup:exports:dry
```

### 2. Executar Limpeza
```bash
npm run cleanup:exports
```

### 3. Limpar um mês específico
```bash
node scripts/cleanup-old-exports.js 2025-10
```

### 4. Instalar Cron Automático
```bash
npm run cleanup:install
```

### 5. Ver Logs
```bash
npm run cleanup:logs
```

## 📋 O que é Deletado?

✅ **Deleta:**
- Arquivos da semana anterior (7-14 dias atrás)
- Arquivos CSV de produtos e pedidos antigos
- Arquivos que seguem o padrão de data `YYYY-MM-DD`

❌ **NÃO Deleta:**
- Arquivo `catalog.csv.gz` (mantido sempre)
- Arquivos da semana atual
- Arquivos sem data no nome
- Diretórios

## 🔧 Comandos Disponíveis

```bash
# Via NPM
npm run cleanup:exports         # Executa limpeza
npm run cleanup:exports:dry     # Simula sem deletar
npm run cleanup:install         # Instala cron automático
npm run cleanup:logs            # Ver logs

# Via Node direto
node scripts/cleanup-old-exports.js              # Executa
node scripts/cleanup-old-exports.js --dry-run    # Simula
node scripts/cleanup-old-exports.js 2025-10      # Limpa mês específico

# Via API
curl -X POST http://localhost:3000/api/cron/cleanup-exports

# Limpar mês via API
curl -X POST http://localhost:3000/api/cron/cleanup-month \
  -H "Content-Type: application/json" \
  -d '{"yearMonth": "2025-10"}'
```

## ⏰ Configuração do Cron

O cron executa **todo domingo às 00:00** (horário do servidor).

### Instalação Automática
```bash
npm run cleanup:install
# ou
sudo bash scripts/install-cleanup-cron.sh
```

### Instalação Manual
```bash
# Editar crontab
sudo crontab -e

# Adicionar linha
0 0 * * 0 curl -X POST http://localhost:3000/api/cron/cleanup-exports > /var/log/emarsys-cleanup.log 2>&1

# Salvar e verificar
sudo crontab -l
```

## 📊 Exemplo de Resultado

```json
{
  "success": true,
  "filesScanned": 150,
  "filesDeleted": 25,
  "filesKept": 125,
  "spaceFreed": 1048576,
  "spaceFreedFormatted": "1.00 MB",
  "period": {
    "start": "2025-10-28",
    "end": "2025-11-03"
  },
  "deletedFiles": [
    {
      "filename": "emarsys-products-import-2025-10-28T09-29-38.csv",
      "date": "2025-10-28",
      "size": 41943
    }
  ]
}
```

## 🛡️ Segurança

- ✅ Modo `--dry-run` para testar sem deletar
- ✅ Nunca deleta `catalog.csv.gz`
- ✅ Logs detalhados de todas as ações
- ✅ Verifica datas antes de deletar
- ✅ Ignora arquivos sem data válida

## 📖 Documentação Completa

Ver: `docs/cleanup-cron-setup.md`

## 🔍 Verificação

### Ver última execução do cron
```bash
tail -20 /var/log/emarsys-cleanup.log
```

### Verificar cron instalado
```bash
sudo crontab -l | grep cleanup
```

### Ver status do serviço cron
```bash
sudo systemctl status cron
```

## ❓ FAQ

**Q: Como sei quais arquivos serão deletados?**  
A: Use `npm run cleanup:exports:dry` para simular sem deletar.

**Q: Posso mudar o horário de execução?**  
A: Sim, edite o crontab e modifique a expressão `0 0 * * 0`.

**Q: Como desinstalar o cron?**  
A: Execute `sudo crontab -e` e remova a linha do cleanup.

**Q: Os arquivos deletados podem ser recuperados?**  
A: Não, a deleção é permanente. Use `--dry-run` antes!

**Q: Quanto espaço será liberado?**  
A: O script mostra o espaço liberado no resultado (`spaceFreedFormatted`).

## 🐛 Troubleshooting

### Cron não está executando
```bash
# Verificar se o serviço está ativo
sudo systemctl status cron

# Iniciar se necessário
sudo systemctl start cron
sudo systemctl enable cron
```

### Erro de permissão
```bash
# Dar permissão ao script
chmod +x scripts/cleanup-old-exports.js
chmod +x scripts/install-cleanup-cron.sh
```

### Ver erros no log
```bash
tail -f /var/log/emarsys-cleanup.log
```

