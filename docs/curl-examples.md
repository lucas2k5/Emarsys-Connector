# Exemplos de CURL para EMS Orders

## 📚 Índice

- [Nova Rota: `/cron-orders` (SQLite)](#-nova-rota-extração-de-pedidos-com-sqlite-cron-orders)
- [Rotas de Background Jobs](#-rotas-de-background-jobs)
- [Rota Original: `/orders-extract-all` (Mantida Intacta)](#-rota-original-extração-de-pedidos-mantida-intacta)
- [Endpoints EMS Orders](#endpoint-existente-para-inserir-pedidos)
- [Reprocessamento](#reprocessar-planilhas-não-enviadas)

---

## 🆕 Nova Rota: Extração de Pedidos com SQLite (`/cron-orders`)

**Endpoint:** `POST /api/background/cron-orders`

Esta rota usa o novo serviço `ordersSyncService` que armazena pedidos no SQLite local. Recomendada para uso em produção e cron jobs.

**Características:**

- ✅ Armazena pedidos no SQLite local
- ✅ Processa automaticamente (busca VTEX → SQLite → CSV → Emarsys)
- ✅ Marca pedidos como sincronizados no SQLite
- ✅ Usada automaticamente pelo cron job configurado

### Extração Manual por Data Brasileira (Recomendado)

Esta é a forma recomendada para execução manual, similar ao formato da rota original:

```bash
curl --location 'http://localhost:3000/api/background/cron-orders' \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json' \
  --data '{
    "brazilianDate": "2025-10-23",
    "startTime": "00:01",
    "endTime": "06:00"
  }'
```

**Exemplo com URL encoding (alternativa):**

```bash
curl --location 'http://localhost:3000/api/background/cron-orders' \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json' \
  --data '{"brazilianDate":"2025-10-23","startTime":"00:01","endTime":"06:00"}'
```

### Extração Manual por Período UTC

```bash
curl --location 'http://localhost:3000/api/background/cron-orders' \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json' \
  --data '{
    "startDate": "2025-10-23T03:01:00Z",
    "toDate": "2025-10-23T09:00:00Z",
    "maxOrders": 100
  }'
```

### Extração com Limite de Pedidos

```bash
curl --location 'http://localhost:3000/api/background/cron-orders' \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json' \
  --data '{
    "brazilianDate": "2025-10-23",
    "startTime": "00:01",
    "endTime": "06:00",
    "maxOrders": 50
  }'
```

**Resposta esperada:**

```json
{
  "success": true,
  "jobId": "cron-orders-1729680000000-abc123",
  "message": "Sincronização de pedidos (cron) iniciada em background",
  "checkStatus": "/api/background/status/cron-orders-1729680000000-abc123",
  "config": {
    "maxOrders": 50,
    "dateFrom": "2025-10-23T03:01:00Z",
    "dateTo": "2025-10-23T09:00:00Z"
  }
}
```

### Verificar Status do Job

Após executar a extração, você receberá um `jobId`. Use-o para verificar o status:

```bash
# Substitua {jobId} pelo ID retornado na resposta
curl --location 'http://localhost:3000/api/background/status/cron-orders-1729680000000-abc123' \
  --header 'Accept: application/json'
```

**Status possíveis:**

- `starting`: Job iniciando
- `running`: Job em execução
- `completed`: Job concluído com sucesso
- `failed`: Job falhou

**Resposta esperada:**

```json
{
  "success": true,
  "job": {
    "id": "cron-orders-1729680000000-abc123",
    "type": "cron-orders",
    "status": "completed",
    "progress": 100,
    "startTime": "2025-10-23T10:00:00.000Z",
    "endTime": "2025-10-23T10:05:00.000Z",
    "duration": 300,
    "durationFormatted": "5m 0s",
    "result": {
      "success": true,
      "totalOrders": 45,
      "transformedOrders": 42,
      "csvResult": {
        "success": true,
        "filename": "ems-sl-pcdly-2025-10-23T10-05-00-2025-10-23.csv",
        "emarsysSent": true
      }
    }
  }
}
```

## 📝 Rotas de Background Jobs

### Listar Todos os Jobs

```bash
curl --location 'http://localhost:3000/api/background/jobs' \
  --header 'Accept: application/json'
```

### Verificar Status de um Job Específico

```bash
curl --location 'http://localhost:3000/api/background/status/{jobId}' \
  --header 'Accept: application/json'
```

## 📝 Rota Original: Extração de Pedidos (Mantida Intacta)

### Rota `/api/integration/orders-extract-all` (Serviços Originais)

Esta rota continua usando os serviços originais (`vtexOrdersService`) e está mantida para compatibilidade.

**GET (Query Parameters):**

```bash
curl --location 'http://localhost:3000/api/integration/orders-extract-all/?brazilianDate=2025-10-23&startTime=00%3A01&endTime=06%3A00' \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json'
```

**POST (Body JSON):**

```bash
curl --location 'http://localhost:3000/api/integration/orders-extract-all' \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json' \
  --data '{
    "brazilianDate": "2025-10-23",
    "startTime": "00:01",
    "endTime": "06:00"
  }'
```

## Endpoint Existente para Inserir Pedidos

### Inserir Pedido Individual (endpoint existente)

```bash
curl --location 'https://ems--piccadilly.myvtex.com/_v/orders' \
--header 'Content-Type: application/json' \
--header 'VtexIdclientAutCookie: SEU_AUTH_TOKEN_AQUI' \
--data-raw '{
    "order": "123456789-28-07-2025-7",
    "timestamp": "2024-01-15T10:30:00Z",
    "item": "SKU123",
    "price": "99.99",
    "quantity": 2,
    "customer": "CPF12345678901",
    "category": "Electronics",
    "brand": "Samsung",
    "revenue": "199.98",
    "customer_email": "cliente@email.com",
    "customer_name": "João Silva",
    "customer_phone": "11999999999",
    "shipping_country": "Brasil",
    "shipping_state": "SP",
    "shipping_city": "São Paulo",
    "order_status": "payment-approved",
    "payment_method": "credit_card",
    "isSync": false
}'
```

## Reprocessar Planilhas Não Enviadas

### 1. Reprocessar Pedidos Não Enviados

```bash
curl -X POST http://localhost:3000/api/ems-orders/reprocess-unsent \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 2. Processar Pedidos Pendentes

```bash
curl -X POST http://localhost:3000/api/ems-orders/process-pending \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 3. Listar Pedidos Pendentes

```bash
curl -X GET http://localhost:3000/api/ems-orders/pending \
  -H "Content-Type: application/json"
```

### 4. Buscar Pedidos Pendentes por Período (registros já existem na base)

```bash
curl -X POST http://localhost:3000/api/ems-orders/fetch-and-store \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-01-01T00:00:00Z",
    "endDate": "2025-01-31T23:59:59Z"
  }'
```

**Resposta esperada:**

```json
{
  "success": true,
  "message": "Pedidos já existem na base - listando pendentes",
  "stored": 25,
  "totalFound": 25,
  "pendingOrderIds": [
    "1563391490809-01",
    "1563391490811-01"
  ],
  "timestamp": "2025-01-24T10:30:00.000Z"
}
```

### 5. Obter Estatísticas dos Pedidos

```bash
curl -X GET http://localhost:3000/api/ems-orders/stats \
  -H "Content-Type: application/json"
```

## Fluxo Recomendado para Reprocessamento

### Passo 1: Verificar Pedidos Pendentes

```bash
curl -X GET http://localhost:3000/api/ems-orders/pending
```

### Passo 2: Reprocessar Pedidos Não Enviados

```bash
curl -X POST http://localhost:3000/api/ems-orders/reprocess-unsent
```

### Passo 3: Verificar Estatísticas

```bash
curl -X GET http://localhost:3000/api/ems-orders/stats
```

## Respostas Esperadas

### Reprocessamento Bem-sucedido

```json
{
  "success": true,
  "message": "Reprocessamento concluído",
  "processed": 150,
  "failed": 0,
  "timestamp": "2025-01-24T10:30:00.000Z"
}
```

### Lista de Pedidos Pendentes

```json
{
  "success": true,
  "total": 25,
  "pendingOrderIds": [
    "1563391490809-01",
    "1563391490811-01",
    "1563411490817-01"
  ],
  "timestamp": "2025-01-24T10:30:00.000Z"
}
```

### Estatísticas

```json
{
  "success": true,
  "stats": {
    "totalPending": 25,
    "pendingByDate": {
      "2025-01-23": 15,
      "2025-01-24": 10
    },
    "oldestPending": 1737705600000,
    "newestPending": 1737792000000
  },
  "timestamp": "2025-01-24T10:30:00.000Z"
}
```

## Configurações Importantes

### Variáveis de Ambiente

```bash
# Desabilitar limpeza automática de orders (recomendado)
ENABLE_ORDER_CLEANUP=false

# Configurar entidade EMS Orders
EMS_ORDERS_ENTITY_ID=emsOrdersV2

# Token de autenticação VTEX (para endpoints /_v/orders)
VTEX_AUTH_TOKEN=seu_auth_token_aqui
```

### Como Obter o Token de Autenticação

1. **Via VTEX Admin**: Acesse o admin da VTEX e copie o token de autenticação
2. **Via API**: Use as credenciais `VTEX_APP_KEY` e `VTEX_APP_TOKEN` para obter o token
3. **Via Cookie**: Copie o valor do cookie `VtexIdclientAutCookie` do navegador

### Endpoints Esperados

O serviço espera que existam os seguintes endpoints na VTEX:

- `POST /_v/orders` - Inserir pedidos
- `GET /_v/orders/search` - Buscar pedidos (com filtro isSync=false)
- `PATCH /_v/orders/{orderId}` - Atualizar pedido (marcar como sincronizado)

Se esses endpoints não existirem, o sistema fará fallback para a API de data entities padrão.

## Notas Importantes

1. **Registros Existentes**: Os pedidos já existem na base `emsOrdersV2` - não são inseridos novos registros
2. **Campo isSync**: Os pedidos são marcados como `isSync=true` apenas após envio bem-sucedido para Emarsys
3. **Controle de Sincronização**: O sistema usa apenas o campo `isSync` para controlar quais pedidos foram enviados
4. **Preservação de Dados**: Com `ENABLE_ORDER_CLEANUP=false`, os pedidos ficam fixos na base para histórico
5. **Reprocessamento**: Pedidos com `isSync=false` são automaticamente reprocessados na próxima execução
6. **Fluxo Simplificado**:
   - Busca pedidos com `isSync=false`
   - Envia para Emarsys
   - Marca como `isSync=true` após sucesso
