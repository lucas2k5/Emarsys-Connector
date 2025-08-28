# Cron Jobs Unificados VTEX

Este diretório contém o sistema unificado de sincronização VTEX que substitui todos os arquivos redundantes anteriores.

## Arquivo Principal

### `sync-orders-unified.js`
Endpoint unificado que substitui **TODOS** os arquivos anteriores:
- ❌ `sync-orders-batched.js` (sincronização combinada)
- ❌ `sync-orders-optimized.js` (processamento em background)
- ❌ `sync-orders.js` (sincronização direta)
- ❌ `sync-products.js` (sincronização de produtos)
- ❌ `products-csv.js` (geração de CSV)

## Funcionalidades

### ✅ Múltiplos Modos de Operação
- **Auto**: Detecta automaticamente se usar background ou direto
- **Direct**: Processamento síncrono direto
- **Background**: Processamento assíncrono via Inngest

### ✅ Sincronização Flexível
- **Pedidos**: Sincronização de pedidos VTEX
- **Produtos**: Sincronização de produtos VTEX
- **Combinada**: Ambos em uma única execução
- **CSV**: Geração de CSV a partir de NDJSON

### ✅ Configuração Flexível
- Via query parameters
- Via variáveis de ambiente
- Fallback automático em caso de erro

## Configuração

### Variáveis de Ambiente
```bash
# Modo de operação
SYNC_MODE=auto|direct|background
USE_BACKGROUND=true|false

# O que sincronizar
SYNC_ORDERS=true|false
SYNC_PRODUCTS=true|false

# Configuração VTEX
VTEX_ENV=your-vtex-env
VTEX_APP_KEY=your-app-key
VTEX_APP_TOKEN=your-app-token

# Configuração Inngest (para modo background)
INNGEST_EVENT_KEY=your-inngest-key
INNGEST_SIGNING_KEY=your-signing-key

# Configuração de período
ORDERS_DAYS_LOOKBACK=1

# Upload para Emarsys
ENABLE_EMARSYS_UPLOAD=true|false
```

### Query Parameters
```
/api/cron/sync-orders-unified?mode=auto&orders=true&products=true&background=false
```

| Parâmetro | Valores | Descrição |
|-----------|---------|-----------|
| `mode` | `auto`, `direct`, `background` | Modo de operação |
| `orders` | `true`, `false` | Sincronizar pedidos |
| `products` | `true`, `false` | Sincronizar produtos |
| `background` | `true`, `false` | Forçar modo background |

## Cron Jobs Configurados

### 1. Sincronização Completa (a cada 6 horas)
```
0 */6 * * * → /api/cron/sync-orders-unified
```
- Sincroniza pedidos e produtos
- Modo automático (background se disponível)

### 2. Sincronização de Pedidos (a cada 4 horas)
```
0 */4 * * * → /api/cron/sync-orders-unified?orders=true&products=false
```
- Apenas pedidos
- Frequência maior para dados críticos

### 3. Sincronização de Produtos (a cada 12 horas)
```
0 */12 * * * → /api/cron/sync-orders-unified?orders=false&products=true
```
- Apenas produtos
- Frequência menor (produtos mudam menos)

## Modos de Operação

### Modo Auto (Padrão)
- Detecta automaticamente se Inngest está configurado
- Usa background se disponível, senão direto
- Melhor para produção

### Modo Direct
- Processamento síncrono
- Resposta imediata
- Melhor para debugging

### Modo Background
- Processamento assíncrono via Inngest
- Resposta rápida, processamento em background
- Melhor para grandes volumes

## Resposta da API

### Sucesso (Modo Direct)
```json
{
  "success": true,
  "mode": "direct",
  "orders": {
    "total": 150,
    "success": true,
    "message": "Sincronização de pedidos concluída",
    "csvGenerated": "orders-2024-01-15.csv",
    "emarsysSuccess": true
  },
  "products": {
    "total": 1250,
    "success": true,
    "message": "Sincronização de produtos concluída"
  },
  "summary": {
    "totalOrders": 150,
    "totalProducts": 1250,
    "totalItems": 1400
  },
  "duration": 45000,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Sucesso (Modo Background)
```json
{
  "success": true,
  "mode": "background",
  "message": "Sincronização iniciada em background via Inngest",
  "eventId": "evt_123456789",
  "eventName": "vtex.sync.complete",
  "duration": 150,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "nextSteps": [
    "Verificar status em /api/background/status",
    "Logs disponíveis no dashboard do Inngest",
    "Processamento continuará em background"
  ]
}
```

## Migração dos Arquivos Antigos

### Arquivos Removidos
- ❌ `sync-orders-batched.js` (erro de duplicação de import)
- ❌ `sync-orders-optimized.js` (funcionalidade integrada)
- ❌ `sync-orders.js` (erro de duplicação de import)
- ❌ `sync-products.js` (funcionalidade integrada)
- ❌ `products-csv.js` (funcionalidade integrada)

### Benefícios da Unificação
- ✅ **Sem redundâncias**: Um único arquivo para todas as operações
- ✅ **Sem erros de linter**: Imports corrigidos
- ✅ **Flexibilidade**: Múltiplos modos de operação
- ✅ **Configurabilidade**: Query params e env vars
- ✅ **Fallback**: Recuperação automática de erros
- ✅ **Manutenibilidade**: Código centralizado
- ✅ **Consistência**: Interface unificada para todas as operações

## Monitoramento

### Logs
Todos os logs incluem emojis para fácil identificação:
- 🕐 Início da operação
- 🔍 Verificação de configuração
- 🚀 Modo de operação
- 📦 Sincronização de pedidos
- 📋 Sincronização de produtos
- ✅ Sucessos
- ❌ Erros
- 🎉 Conclusão

### Status de Background Jobs
Para jobs em background, verificar:
- `/api/background/status?jobId=evt_123456789`
- Dashboard do Inngest
- Logs do Vercel

## Troubleshooting

### Erro: "Unauthorized - Only Vercel Cron Jobs allowed"
- Verificar se a requisição vem do Vercel Cron
- Verificar header `user-agent: vercel-cron/1.0`

### Erro: "Nenhuma operação selecionada"
- Verificar parâmetros `orders` e `products`
- Pelo menos um deve ser `true`

### Fallback para Modo Direct
- Se Inngest falhar, automaticamente usa modo direct
- Verificar configuração do Inngest
- Verificar variáveis de ambiente

### Timeout
- Modo direct: maxDuration=600s
- Modo background: maxDuration=60s (apenas disparo do evento)
- Para grandes volumes, usar modo background

## Estrutura Final

```
api/cron/
├── README.md                    # Esta documentação
└── sync-orders-unified.js       # Único arquivo de cron
```

**Resultado**: De 5 arquivos redundantes para 1 arquivo unificado! 🎉
