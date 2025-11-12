# 🚀 Guia Rápido - Limpeza Automática de Exports

## 📦 O que foi criado?

Sistema completo de limpeza automática de arquivos antigos na pasta `exports/`.

### Arquivos criados:
1. ✅ `scripts/cleanup-old-exports.js` - Script principal de limpeza
2. ✅ `scripts/install-cleanup-cron.sh` - Instalador automático do cron
3. ✅ `scripts/README-cleanup.md` - Documentação rápida
4. ✅ `routes/cronJobs.js` - Rotas de API atualizadas
5. ✅ `api/cron/cleanup-exports.js` - Endpoint de cron
6. ✅ `docs/cleanup-cron-setup.md` - Documentação completa
7. ✅ `package.json` - Scripts NPM adicionados

---

## 🎯 Como Usar (Passo a Passo)

### 1️⃣ TESTAR PRIMEIRO (Recomendado)

```bash
# No servidor (via SSH)
cd /var/www/emarsys.connector

# Simular limpeza (não deleta nada)
npm run cleanup:exports:dry
```

Isso vai mostrar quais arquivos **SERIAM** deletados sem realmente deletar.

### 2️⃣ EXECUTAR LIMPEZA MANUAL (Uma vez)

```bash
# Deletar arquivos da semana anterior
npm run cleanup:exports
```

### 3️⃣ INSTALAR CRON AUTOMÁTICO (Recomendado)

```bash
# Instalar cron para executar todo domingo às 00:00
sudo npm run cleanup:install

# OU manualmente:
sudo bash scripts/install-cleanup-cron.sh
```

**Selecione a opção 1 (Crontab do sistema)**

### 4️⃣ VERIFICAR INSTALAÇÃO

```bash
# Ver se o cron foi instalado
sudo crontab -l | grep cleanup

# Verificar serviço cron
sudo systemctl status cron
```

---

## 🗓️ Quando o Cron Executa?

**Todo domingo às 00:00 (meia-noite)**

- Remove arquivos da semana anterior (7-14 dias atrás)
- Mantém o arquivo `catalog.csv.gz`
- Gera log em `/var/log/emarsys-cleanup.log`

---

## 📊 Ver Logs e Resultados

```bash
# Ver últimas 20 linhas do log
tail -20 /var/log/emarsys-cleanup.log

# Acompanhar em tempo real
npm run cleanup:logs

# OU
tail -f /var/log/emarsys-cleanup.log
```

---

## 🔧 Comandos Úteis

### Via NPM
```bash
npm run cleanup:exports         # Executar limpeza
npm run cleanup:exports:dry     # Simular (não deleta)
npm run cleanup:install         # Instalar cron
npm run cleanup:logs            # Ver logs
```

### Via API (se servidor estiver rodando)
```bash
# Executar limpeza via API
curl -X POST http://localhost:3000/api/cron/cleanup-exports

# Limpar mês específico
curl -X POST http://localhost:3000/api/cron/cleanup-month \
  -H "Content-Type: application/json" \
  -d '{"yearMonth": "2025-10"}'
```

### Limpar mês específico
```bash
# Exemplo: Limpar outubro de 2025
node scripts/cleanup-old-exports.js 2025-10

# Com dry-run
node scripts/cleanup-old-exports.js 2025-10 --dry-run
```

---

## 🛡️ O que NÃO É Deletado?

✅ **Mantém:**
- ❌ `catalog.csv.gz` (nunca é deletado)
- ❌ Arquivos da semana atual
- ❌ Arquivos sem data no nome
- ❌ Diretórios

---

## ⚙️ Configuração Manual do Cron

Se preferir configurar manualmente:

```bash
# Editar crontab
sudo crontab -e

# Adicionar esta linha (escolha uma opção):

# Opção 1: Via API (recomendado)
0 0 * * 0 curl -X POST http://localhost:3000/api/cron/cleanup-exports > /var/log/emarsys-cleanup.log 2>&1

# Opção 2: Via linha de comando
0 0 * * 0 cd /var/www/emarsys.connector && /usr/bin/node scripts/cleanup-old-exports.js > /var/log/emarsys-cleanup.log 2>&1
```

**Explicação do Cron:**
```
0 0 * * 0
│ │ │ │ │
│ │ │ │ └─ Dia da semana (0=domingo)
│ │ │ └─── Mês (1-12)
│ │ └───── Dia do mês (1-31)
│ └─────── Hora (0-23)
└───────── Minuto (0-59)
```

---

## 🧪 Exemplo de Uso Completo

```bash
# 1. Conectar ao servidor
ssh openflow-server

# 2. Mudar para root
sudo su

# 3. Ir para o diretório
cd /var/www/emarsys.connector

# 4. Testar com dry-run
npm run cleanup:exports:dry

# 5. Ver o resultado
# (mostra quais arquivos seriam deletados)

# 6. Se estiver ok, executar de verdade
npm run cleanup:exports

# 7. Instalar cron automático
npm run cleanup:install
# Escolher opção 1

# 8. Verificar instalação
sudo crontab -l | grep cleanup

# 9. Pronto! ✅
```

---

## 📊 Exemplo de Resultado

```json
{
  "success": true,
  "filesScanned": 150,
  "filesDeleted": 25,
  "filesKept": 125,
  "filesWithoutDate": 0,
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
      "size": 41943,
      "sizeFormatted": "40.96 KB"
    }
  ],
  "duration": 123
}
```

---

## ❓ FAQ Rápido

**Q: Como testar sem deletar?**  
```bash
npm run cleanup:exports:dry
```

**Q: Como ver o que foi deletado?**  
```bash
tail -20 /var/log/emarsys-cleanup.log
```

**Q: Como remover o cron?**  
```bash
sudo crontab -e
# Deletar a linha do cleanup
```

**Q: Como mudar o horário?**  
```bash
sudo crontab -e
# Modificar: 0 0 * * 0 (meia-noite de domingo)
# Exemplo: 0 2 * * 0 (2h da manhã de domingo)
```

**Q: Como limpar um mês específico?**  
```bash
node scripts/cleanup-old-exports.js 2025-10
```

---

## 🐛 Troubleshooting

### Cron não executou

```bash
# Verificar se o cron está instalado
sudo crontab -l

# Verificar serviço
sudo systemctl status cron

# Iniciar se necessário
sudo systemctl start cron
sudo systemctl enable cron
```

### Erro de permissão

```bash
# Dar permissão aos scripts
chmod +x scripts/cleanup-old-exports.js
chmod +x scripts/install-cleanup-cron.sh
```

### Ver erros

```bash
# Log do cron
tail -50 /var/log/emarsys-cleanup.log

# Log do sistema
sudo grep CRON /var/log/syslog
```

---

## 📚 Documentação Completa

- **Guia rápido:** `scripts/README-cleanup.md`
- **Documentação completa:** `docs/cleanup-cron-setup.md`
- **Código do script:** `scripts/cleanup-old-exports.js`

---

## ✅ Checklist de Instalação

- [ ] Testei com `--dry-run`
- [ ] Executei limpeza manual com sucesso
- [ ] Instalei o cron com `npm run cleanup:install`
- [ ] Verifiquei com `sudo crontab -l`
- [ ] Serviço cron está ativo
- [ ] Log está sendo gerado em `/var/log/emarsys-cleanup.log`

---

## 🎉 Pronto!

O sistema está configurado para limpar automaticamente os arquivos antigos todo domingo às 00:00!

**Resumo:**
- ✅ Automatiza limpeza de arquivos
- ✅ Libera espaço em disco
- ✅ Mantém apenas arquivos recentes
- ✅ Logs detalhados
- ✅ Fácil de usar e configurar

---

**Dúvidas?** Consulte a documentação completa em `docs/cleanup-cron-setup.md`

