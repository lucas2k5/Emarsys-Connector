# Cron Jobs - Emarsys VTEX Integration

Este diretório foi removido pois a aplicação agora usa cron jobs nativos do Node.js ao invés do Vercel Cron Jobs.

## Nova Configuração

Os cron jobs agora são executados diretamente pelo servidor Node.js usando a biblioteca `cron`.

### Cron Jobs Ativos

1. **Sincronização de Produtos**
   - **Frequência**: A cada 8 horas (`0 */8 * * *`)
   - **Endpoint**: `GET /api/vtex/products/sync`
   - **Configurado em**: `utils/cronService.js`

2. **Sincronização de Orders**  
   - **Frequência**: A cada 5 horas (`0 */5 * * *`)
   - **Endpoint**: `GET /api/integration/orders-extract-all`
   - **Parâmetros**: `?batching=true&daysPerBatch=1&maxOrders=100&per_page=50&startDate=...&toDate=...`
   - **Configurado em**: `utils/cronService.js`
   - **🆕 Batching Automático**: Sempre usa processamento em lotes para evitar timeouts

### Gerenciamento

Para verificar o status dos cron jobs:
- GET `/health` - Mostra status dos cron jobs ativos

### Variáveis de Ambiente Necessárias

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

### Logs

Os logs dos cron jobs são exibidos no console da aplicação com prefixo `[CRON]`.