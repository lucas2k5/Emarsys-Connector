# Exemplos de CURL para EMS Orders

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
