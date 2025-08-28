# Migração para VPS - Resumo das Modificações

Este documento descreve todas as modificações realizadas para migrar o app do Vercel/Inngest para VPS com cron jobs nativos.

## ✅ Modificações Realizadas

### 1. Arquivos Removidos
- `vercel.json` - Configuração do Vercel
- `lib/inngest.js` - Biblioteca do Inngest  
- `api/inngest.js` - Endpoint do Inngest
- `api/inngest-status.js` - Status do Inngest
- `api/cron/sync-products.js` - Cron job do Vercel para produtos
- `api/cron/sync-orders.js` - Cron job do Vercel para orders
- `api/cron/sync-orders-batched.js` - Cron job do Vercel para orders em lote
- `api/cron/products-csv.js` - Cron job do Vercel para CSV de produtos

### 2. Arquivos Criados
- `utils/cronService.js` - Serviço de cron jobs nativo
- `routes/cronManagement.js` - API para gerenciar cron jobs
- `MIGRAÇÃO-VPS.md` - Este documento

### 3. Arquivos Modificados
- `package.json` - Removidas dependências obsoletas, adicionada dependência `cron`
- `server.js` - Integração do sistema de cron jobs nativo
- `routes/backgroundJobs.js` - Removidas dependências do Inngest
- `ecosystem.config.js` - Configurações otimizadas para VPS
- `api/cron/README.md` - Documentação atualizada

### 4. Dependências
**Removidas:**
- `inngest@^3.40.1`
- `serverless-http@^3.2.0`

**Adicionadas:**
- `cron@^3.1.7`

## 🕐 Cron Jobs Configurados

### Sincronização de Produtos
- **Frequência**: A cada 8 horas (`0 */8 * * *`)
- **Endpoint**: `GET /api/vtex/products/sync`
- **Primeira execução**: Assim que o servidor iniciar

### Sincronização de Orders  
- **Frequência**: A cada 5 horas (`0 */5 * * *`)
- **Endpoint**: `GET /api/integration/orders-extract-all`
- **Parâmetros**: `?batching=true&startDate={5 horas atrás}&toDate={agora}`
- **Primeira execução**: Assim que o servidor iniciar

## 🔧 APIs de Gerenciamento

### Status dos Cron Jobs
```bash
GET /health
```
Retorna informações gerais incluindo status dos cron jobs.

```bash
GET /api/cron-management/status
```
Retorna status detalhado de todos os cron jobs.

### Controle Manual
```bash
POST /api/cron-management/start/{jobName}
POST /api/cron-management/stop/{jobName}  
POST /api/cron-management/restart-all
```

Jobs disponíveis:
- `products-sync` - Sincronização de produtos
- `orders-sync` - Sincronização de orders

## 🚀 Como Iniciar na VPS

### 1. Instalar Dependências
```bash
npm install
```

### 2. Configurar Variáveis de Ambiente
```bash
# Configuração VTEX
VTEX_STORE_NAME=your-store
VTEX_APP_KEY=your-app-key  
VTEX_APP_TOKEN=your-app-token

# Configuração Emarsys
EMARSYS_CLIENT_ID=your-client-id
EMARSYS_CLIENT_SECRET=your-client-secret

# Configuração do servidor
PORT=3000
NODE_ENV=production
```

### 3. Iniciar com PM2 (Recomendado)
```bash
# Primeira vez
npm run pm2:start

# Para verificar logs
npm run pm2:logs

# Para reiniciar
npm run pm2:restart

# Para parar
npm run pm2:stop
```

### 4. Iniciar Manualmente
```bash
npm start
```

## 📊 Monitoramento

### Logs dos Cron Jobs
Os logs aparecem no console da aplicação com prefixo `[CRON]`:

```
🚀 [CRON] Iniciando sincronização de produtos...
✅ [CRON] Sincronização de produtos concluída: 200
📅 [CRON] Período: 2025-01-15T10:00:01Z até 2025-01-15T15:00:00Z
🚀 [CRON] Iniciando sincronização de orders...
✅ [CRON] Sincronização de orders concluída: 200
```

### Health Check
```bash
curl http://localhost:3000/health
```

Exemplo de resposta:
```json
{
  "status": "OK",
  "timestamp": "2025-01-15T15:30:00.000Z",
  "vtex": {
    "cron": {
      "provider": "Native Node.js Cron Jobs",
      "status": "active",
      "schedules": {
        "products-sync": "0 */8 * * * (a cada 8 horas)",
        "orders-sync": "0 */5 * * * (a cada 5 horas)"
      },
      "jobs": {
        "products-sync": {
          "running": true,
          "nextDates": ["2025-01-15T16:00:00.000Z", "2025-01-16T00:00:00.000Z"]
        },
        "orders-sync": {
          "running": true, 
          "nextDates": ["2025-01-15T17:00:00.000Z", "2025-01-15T22:00:00.000Z"]
        }
      }
    }
  }
}
```

## 🔄 Funcionalidades Mantidas

- ✅ Sincronização de produtos VTEX → Emarsys
- ✅ Sincronização de orders VTEX → Emarsys  
- ✅ Geração e upload de CSV para Emarsys
- ✅ Rate limiting e controle de erro
- ✅ Background jobs via API `/api/background`
- ✅ Todas as rotas existentes continuam funcionando
- ✅ Health checks e monitoramento

## 🆕 Novas Funcionalidades

- ✅ Cron jobs nativos do Node.js (mais confiáveis)
- ✅ API de gerenciamento de cron jobs
- ✅ Graceful shutdown dos cron jobs
- ✅ Configuração mais simples (sem dependências externas)
- ✅ Logs melhorados com timestamps

## ⚠️ Importante

1. **Backup**: Faça backup dos dados antes de migrar
2. **Testes**: Teste as rotas principais após a migração
3. **Monitoramento**: Verifique os logs nos primeiros dias
4. **Cron Jobs**: Os cron jobs iniciam automaticamente com o servidor
5. **Graceful Shutdown**: Use SIGTERM/SIGINT para parar o servidor corretamente

## 🎉 Vantagens da Migração

- ❌ **Sem dependência do Vercel** - Funciona em qualquer VPS
- ❌ **Sem dependência do Inngest** - Menos complexidade
- ✅ **Cron jobs nativos** - Mais confiáveis e previsíveis  
- ✅ **Menos dependências** - Aplicação mais leve
- ✅ **Controle total** - Gerenciamento completo dos cron jobs
- ✅ **Logs centralizados** - Tudo no mesmo lugar
- ✅ **Deploy simples** - Apenas npm install e npm start
