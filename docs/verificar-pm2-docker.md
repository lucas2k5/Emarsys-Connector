# Como Verificar se o PM2 está Rodando no Docker

Este guia mostra como verificar o status do PM2 dentro do container Docker.

## 🔍 Comandos para Verificar o PM2

### 1. **Status do PM2 (Comando Principal)**

```bash
# Ver status de todos os processos PM2
docker compose exec app ./node_modules/.bin/pm2 status

# Ou usando o caminho completo
docker compose exec app /app/node_modules/.bin/pm2 status

# Formato JSON (mais fácil de parsear)
docker compose exec app ./node_modules/.bin/pm2 jlist
```

### 2. **Informações Detalhadas**

```bash
# Informações detalhadas do processo
docker compose exec app ./node_modules/.bin/pm2 describe emarsys-server

# Informações em JSON
docker compose exec app ./node_modules/.bin/pm2 describe emarsys-server --json
```

### 3. **Logs do PM2**

```bash
# Ver logs em tempo real
docker compose exec app ./node_modules/.bin/pm2 logs

# Logs apenas do app específico
docker compose exec app ./node_modules/.bin/pm2 logs emarsys-server

# Últimas 100 linhas
docker compose exec app ./node_modules/.bin/pm2 logs --lines 100

# Logs de erro
docker compose exec app ./node_modules/.bin/pm2 logs emarsys-server --err

# Logs de saída padrão
docker compose exec app ./node_modules/.bin/pm2 logs emarsys-server --out
```

### 4. **Monitoramento em Tempo Real**

```bash
# Monitor interativo (CPU, memória, etc)
docker compose exec app ./node_modules/.bin/pm2 monit

# Informações de uso de recursos
docker compose exec app ./node_modules/.bin/pm2 show emarsys-server
```

### 5. **Verificar Processos do Sistema**

```bash
# Ver processos Node.js rodando
docker compose exec app ps aux | grep node

# Ver processos PM2
docker compose exec app ps aux | grep pm2

# Ver todos os processos
docker compose exec app ps aux
```

## 📊 Verificação Rápida

### Script de Verificação Completa

```bash
#!/bin/bash
echo "=== Status do Container ==="
docker compose ps

echo -e "\n=== Status do PM2 ==="
docker compose exec app ./node_modules/.bin/pm2 status

echo -e "\n=== Informações do Processo ==="
docker compose exec app ./node_modules/.bin/pm2 describe emarsys-server

echo -e "\n=== Últimas 10 linhas de Log ==="
docker compose exec app ./node_modules/.bin/pm2 logs --lines 10
```

### Comando Único para Status

```bash
# Ver tudo de uma vez
docker compose exec app sh -c "./node_modules/.bin/pm2 status && echo '---' && ./node_modules/.bin/pm2 describe emarsys-server"
```

## 🎯 Interpretando o Status

### Status do PM2 Normal

```
┌─────┬─────────────────┬─────────┬─────────┬──────────┬─────────┐
│ id  │ name            │ mode    │ ↺       │ status   │ cpu     │
├─────┼─────────────────┼─────────┼─────────┼──────────┼─────────┤
│ 0   │ emarsys-server  │ fork    │ 0       │ online   │ 0%      │
└─────┴─────────────────┴─────────┴─────────┴──────────┴─────────┘
```

**Status possíveis:**
- ✅ `online` - Processo rodando normalmente
- ⚠️ `stopped` - Processo parado
- ❌ `errored` - Processo com erro
- 🔄 `restarting` - Processo reiniciando
- ⏸️ `stopping` - Processo parando

### Verificar se está Online

```bash
# Verificar se o status é "online"
docker compose exec app ./node_modules/.bin/pm2 jlist | grep -o '"status":"[^"]*"'

# Ou verificar diretamente
docker compose exec app ./node_modules/.bin/pm2 describe emarsys-server | grep "status"
```

## 🔧 Comandos Úteis do PM2 no Docker

### Gerenciar Processo

```bash
# Reiniciar processo
docker compose exec app ./node_modules/.bin/pm2 restart emarsys-server

# Recarregar (zero-downtime)
docker compose exec app ./node_modules/.bin/pm2 reload emarsys-server

# Parar processo
docker compose exec app ./node_modules/.bin/pm2 stop emarsys-server

# Deletar processo
docker compose exec app ./node_modules/.bin/pm2 delete emarsys-server
```

### Informações de Performance

```bash
# Uso de memória e CPU
docker compose exec app ./node_modules/.bin/pm2 show emarsys-server

# Métricas em tempo real
docker compose exec app ./node_modules/.bin/pm2 monit
```

## 🐛 Troubleshooting

### PM2 não está rodando

```bash
# Verificar se o container está rodando
docker compose ps

# Ver logs do container
docker compose logs app

# Verificar se o PM2 está instalado
docker compose exec app ls -la ./node_modules/.bin/pm2*

# Verificar processos
docker compose exec app ps aux
```

### Processo está "errored" ou "stopped"

```bash
# Ver logs de erro
docker compose exec app ./node_modules/.bin/pm2 logs emarsys-server --err

# Ver informações detalhadas
docker compose exec app ./node_modules/.bin/pm2 describe emarsys-server

# Tentar reiniciar
docker compose exec app ./node_modules/.bin/pm2 restart emarsys-server
```

### Verificar se o PM2-runtime está ativo

```bash
# Ver processo principal
docker compose exec app ps aux | grep pm2-runtime

# Ver processo do Node.js
docker compose exec app ps aux | grep "server.js"
```

## 📝 Exemplos Práticos

### Verificar Status Rapidamente

```bash
# Uma linha - status resumido
docker compose exec app ./node_modules/.bin/pm2 status | grep emarsys-server
```

### Verificar Saúde Completa

```bash
echo "=== Container Status ===" && \
docker compose ps && \
echo -e "\n=== PM2 Status ===" && \
docker compose exec app ./node_modules/.bin/pm2 status && \
echo -e "\n=== Health Check ===" && \
curl -s http://localhost:3000/api/health | head -1
```

### Monitorar em Tempo Real

```bash
# Terminal 1: Monitor PM2
docker compose exec app ./node_modules/.bin/pm2 monit

# Terminal 2: Logs
docker compose logs -f app

# Terminal 3: Health check
watch -n 2 'curl -s http://localhost:3000/api/health'
```

## 🎨 Aliases Úteis (Opcional)

Adicione ao seu `~/.bashrc` ou `~/.zshrc`:

```bash
# Aliases para PM2 no Docker
alias pm2-status='docker compose exec app ./node_modules/.bin/pm2 status'
alias pm2-logs='docker compose exec app ./node_modules/.bin/pm2 logs'
alias pm2-monit='docker compose exec app ./node_modules/.bin/pm2 monit'
alias pm2-restart='docker compose exec app ./node_modules/.bin/pm2 restart emarsys-server'
```

Depois:
```bash
source ~/.bashrc  # ou ~/.zshrc
pm2-status        # Usar diretamente
```

## ✅ Checklist de Verificação

Após deploy, verifique:

```bash
# 1. Container está rodando?
docker compose ps

# 2. PM2 está ativo?
docker compose exec app ./node_modules/.bin/pm2 status

# 3. Processo está "online"?
docker compose exec app ./node_modules/.bin/pm2 describe emarsys-server | grep "status.*online"

# 4. Sem erros recentes?
docker compose exec app ./node_modules/.bin/pm2 logs --lines 20 --err | tail -5

# 5. Aplicação responde?
curl http://localhost:3000/api/health
```

