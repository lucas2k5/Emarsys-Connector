# 📋 Sumário - Sistema de Limpeza Automática de Exports

## ✅ Arquivos Criados e Modificados

### 🔧 Scripts Principais
1. **`scripts/cleanup-old-exports.js`** ⭐
   - Script principal de limpeza
   - Remove arquivos da semana anterior
   - Suporta modo `--dry-run`
   - Pode limpar por mês específico
   - Logs detalhados com Winston

2. **`scripts/install-cleanup-cron.sh`** ⭐
   - Instalador automático do cron
   - Interface interativa
   - Suporta múltiplos métodos de instalação
   - Validação de pré-requisitos

3. **`scripts/README-cleanup.md`**
   - Documentação rápida do script
   - Comandos essenciais
   - FAQ e troubleshooting

### 🌐 API e Rotas
4. **`routes/cronJobs.js`** (Modificado)
   - Adicionado: `POST /api/cron/cleanup-exports`
   - Adicionado: `POST /api/cron/cleanup-month`
   - Endpoints para execução via HTTP

5. **`api/cron/cleanup-exports.js`** (Novo)
   - Endpoint Vercel-compatible
   - Para uso em serverless functions

### 📚 Documentação
6. **`docs/cleanup-cron-setup.md`** ⭐
   - Documentação completa e detalhada
   - 3 métodos de configuração
   - Exemplos práticos
   - Guia de troubleshooting

7. **`GUIA-RAPIDO-LIMPEZA.md`** ⭐
   - Guia rápido de início
   - Passo a passo ilustrado
   - Checklist de instalação
   - FAQ e comandos úteis

8. **`CLEANUP-SUMMARY.md`** (Este arquivo)
   - Sumário de tudo criado
   - Visão geral do sistema

### ⚙️ Configuração
9. **`package.json`** (Modificado)
   - Adicionados scripts NPM:
     - `cleanup:exports`
     - `cleanup:exports:dry`
     - `cleanup:month`
     - `cleanup:install`
     - `cleanup:logs`

10. **`examples/ecosystem.config.cleanup.example.js`**
    - Exemplo de configuração PM2
    - Integração com PM2 cron

---

## 🎯 Funcionalidades Implementadas

### ✅ O que o sistema faz:
- 🗑️ **Remove arquivos automaticamente** da semana anterior
- 📅 **Executa todo domingo às 00:00**
- 🔒 **Mantém arquivo principal** (`catalog.csv.gz`)
- 📊 **Gera logs detalhados** de todas as operações
- 🧪 **Modo dry-run** para testar sem deletar
- 📅 **Limpeza por mês** específico
- 🌐 **API REST** para execução remota
- 💻 **Linha de comando** para execução manual
- ⚙️ **Instalador automático** do cron

### 🔍 O que é deletado:
- ✅ Arquivos CSV de produtos: `emarsys-products-import-*.csv`
- ✅ Arquivos CSV de pedidos: `ems-sl-pcdly-*.csv`
- ✅ Apenas da semana anterior (7-14 dias atrás)
- ❌ **NUNCA** deleta `catalog.csv.gz`
- ❌ **NUNCA** deleta arquivos da semana atual

---

## 🚀 Como Começar

### Passo 1: Testar
```bash
npm run cleanup:exports:dry
```

### Passo 2: Executar
```bash
npm run cleanup:exports
```

### Passo 3: Instalar Cron Automático
```bash
sudo npm run cleanup:install
```

---

## 📊 Comandos Disponíveis

### NPM Scripts
```bash
npm run cleanup:exports         # Executar limpeza
npm run cleanup:exports:dry     # Simular (não deleta)
npm run cleanup:install         # Instalar cron
npm run cleanup:logs            # Ver logs
```

### CLI Direto
```bash
node scripts/cleanup-old-exports.js              # Executar
node scripts/cleanup-old-exports.js --dry-run    # Simular
node scripts/cleanup-old-exports.js 2025-10      # Limpar mês
```

### API REST
```bash
# Limpeza da semana anterior
curl -X POST http://localhost:3000/api/cron/cleanup-exports

# Limpeza de mês específico
curl -X POST http://localhost:3000/api/cron/cleanup-month \
  -H "Content-Type: application/json" \
  -d '{"yearMonth": "2025-10"}'
```

### Cron (Instalado automaticamente)
```bash
# Ver cron instalado
sudo crontab -l

# Executado automaticamente todo domingo às 00:00
```

---

## 📖 Documentação

### 🚀 Início Rápido
- **`GUIA-RAPIDO-LIMPEZA.md`** - Para começar rapidamente

### 📚 Documentação Completa
- **`docs/cleanup-cron-setup.md`** - Guia completo e detalhado

### 🔧 Referência Técnica
- **`scripts/README-cleanup.md`** - Detalhes técnicos do script

### 💡 Exemplos
- **`examples/ecosystem.config.cleanup.example.js`** - Configuração PM2

---

## 🔄 Fluxo de Funcionamento

```
┌─────────────────────────────────────┐
│  Domingo às 00:00                   │
│  (Executado pelo Cron)              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Listar arquivos da pasta exports/  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Extrair data de cada arquivo       │
│  (formato YYYY-MM-DD)               │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Verificar se está na semana        │
│  anterior (7-14 dias atrás)         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Deletar arquivos selecionados      │
│  (exceto catalog.csv.gz)            │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Gerar log com resultado            │
│  /var/log/emarsys-cleanup.log       │
└─────────────────────────────────────┘
```

---

## 🛡️ Segurança e Validações

### ✅ Verificações Implementadas
- 🔒 Nunca deleta `catalog.csv.gz`
- 📁 Verifica se pasta exports/ existe
- 📅 Valida formato de data (YYYY-MM-DD)
- 🔍 Ignora arquivos sem data válida
- 📂 Ignora diretórios
- ⚠️ Modo dry-run para testes seguros
- 📊 Logs detalhados de todas as ações
- ❌ Tratamento de erros robusto

### 🔐 Permissões Necessárias
- Leitura: pasta `exports/`
- Escrita: pasta `exports/` (para deletar)
- Escrita: `/var/log/emarsys-cleanup.log` (para logs)
- Root: para instalar cron

---

## 📈 Benefícios

### 💾 Economia de Espaço
- Remove arquivos antigos automaticamente
- Mantém apenas arquivos recentes
- Libera espaço em disco semanalmente

### ⚙️ Automação
- Execução automática sem intervenção
- Configuração única (install and forget)
- Notificações via logs

### 🛡️ Segurança
- Modo dry-run para testes
- Logs detalhados
- Validações robustas
- Backup preservado (catalog.csv.gz)

### 📊 Monitoramento
- Logs estruturados
- Métricas de espaço liberado
- Rastreamento de arquivos deletados
- Integração com Winston logger

---

## 🔧 Manutenção

### Ver Logs
```bash
tail -f /var/log/emarsys-cleanup.log
```

### Verificar Cron
```bash
sudo crontab -l | grep cleanup
```

### Desinstalar
```bash
sudo crontab -e
# Remover linha do cleanup
```

### Alterar Horário
```bash
sudo crontab -e
# Modificar: 0 0 * * 0
# Exemplo: 0 2 * * 0 (2h da manhã)
```

---

## 🎓 Casos de Uso

### 1. Servidor em Produção
- **Setup:** Instalar cron automático
- **Comando:** `sudo npm run cleanup:install`
- **Resultado:** Limpeza automática toda semana

### 2. Teste Local
- **Setup:** Executar com dry-run
- **Comando:** `npm run cleanup:exports:dry`
- **Resultado:** Ver o que seria deletado

### 3. Limpeza Pontual
- **Setup:** Executar manualmente
- **Comando:** `npm run cleanup:exports`
- **Resultado:** Limpeza imediata

### 4. Limpar Mês Específico
- **Setup:** Especificar mês
- **Comando:** `node scripts/cleanup-old-exports.js 2025-10`
- **Resultado:** Remove todos arquivos de outubro/2025

### 5. Integração CI/CD
- **Setup:** Chamar via API
- **Comando:** `curl -X POST .../api/cron/cleanup-exports`
- **Resultado:** Limpeza remota via HTTP

---

## 🏆 Tecnologias Utilizadas

- **Node.js** - Runtime
- **Winston** - Sistema de logs
- **Express** - API REST
- **Cron** - Agendamento de tarefas
- **PM2** - Gerenciamento de processos
- **Bash** - Scripts de instalação

---

## 📞 Suporte

### Problemas Comuns

**Cron não executa:**
```bash
sudo systemctl status cron
sudo systemctl start cron
```

**Erro de permissão:**
```bash
chmod +x scripts/*.sh
chmod +x scripts/*.js
```

**Não deleta arquivos:**
- Verificar se está no dia certo (domingo)
- Verificar se há arquivos da semana anterior
- Executar com `--dry-run` para debug

---

## 📅 Cronograma de Execução

| Dia       | Ação                    | Arquivos Deletados     |
|-----------|-------------------------|------------------------|
| Segunda   | -                       | -                      |
| Terça     | -                       | -                      |
| Quarta    | -                       | -                      |
| Quinta    | -                       | -                      |
| Sexta     | -                       | -                      |
| Sábado    | -                       | -                      |
| **Domingo** | **🧹 Limpeza às 00:00** | **Semana anterior**    |

---

## ✅ Status do Sistema

| Componente | Status | Descrição |
|------------|--------|-----------|
| Script principal | ✅ Pronto | `cleanup-old-exports.js` |
| API REST | ✅ Pronto | Endpoints funcionais |
| Instalador | ✅ Pronto | Script interativo |
| Documentação | ✅ Completa | Guias e exemplos |
| Logs | ✅ Integrado | Winston logging |
| Testes | ✅ Dry-run | Modo de simulação |
| Cron | ⚙️ Configurável | Requer instalação |

---

## 🎯 Próximos Passos Recomendados

1. ✅ **Testar com dry-run**
   ```bash
   npm run cleanup:exports:dry
   ```

2. ✅ **Executar manualmente uma vez**
   ```bash
   npm run cleanup:exports
   ```

3. ✅ **Instalar cron automático**
   ```bash
   sudo npm run cleanup:install
   ```

4. ✅ **Verificar logs**
   ```bash
   npm run cleanup:logs
   ```

5. ✅ **Configurar monitoramento** (opcional)
   - Adicionar alerta se espaço for insuficiente
   - Configurar notificações de erro

---

## 📝 Changelog

### v1.0.0 (2025-11-11)
- ✅ Criação do sistema completo de limpeza
- ✅ Script principal com suporte a dry-run
- ✅ API REST para execução remota
- ✅ Instalador automático de cron
- ✅ Documentação completa
- ✅ Integração com Winston logger
- ✅ Suporte a limpeza por mês
- ✅ Scripts NPM para facilitar uso

---

## 🤝 Contribuindo

Para melhorias futuras, considere:
- [ ] Adicionar notificações por email
- [ ] Dashboard web para monitoramento
- [ ] Retenção configurável (não apenas 7 dias)
- [ ] Compressão de arquivos ao invés de deleção
- [ ] Backup automático antes de deletar
- [ ] Métricas Prometheus
- [ ] Integração com sistemas de alertas

---

## 📄 Licença

Mesmo projeto: **ISC**

---

**🎉 Sistema de Limpeza Automática - Implementado com Sucesso!**

_Última atualização: 2025-11-11_

