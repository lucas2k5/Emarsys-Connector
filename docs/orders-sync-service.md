# Orders Sync Service - Serviço de Sincronização de Pedidos

## 📋 Visão Geral

O `OrdersSyncService` é um serviço otimizado que consolida funcionalidades de busca VTEX, armazenamento SQLite e geração de CSV para sincronização de pedidos. Este serviço foi criado para substituir a lógica dispersa entre `emsOrdersService` e `vtexOrdersService`, centralizando toda a lógica de sincronização de pedidos em um único ponto.

## 🎯 Características

- **Armazenamento SQLite**: Todos os pedidos são armazenados localmente em SQLite
- **Busca VTEX**: Busca pedidos diretamente da API VTEX OMS
- **Processamento em Lotes**: Suporta processamento em lotes para grandes volumes
- **Geração de CSV**: Gera automaticamente arquivos CSV formatados para Emarsys
- **Envio Automático**: Envia CSV para Emarsys e marca pedidos como sincronizados
- **Controle de Sincronização**: Gerencia status `isSync` diretamente no SQLite

## 📁 Localização

```
services/ordersSyncService.js
```

## 🔧 Principais Métodos

### `syncOrders(options)`

Executa sincronização completa de pedidos:

1. Busca pedidos da VTEX
2. Salva no SQLite
3. Transforma para formato Emarsys
4. Gera CSV
5. Envia para Emarsys
6. Marca como sincronizado

**Parâmetros:**

- `orders` (Array, opcional): Pedidos já fornecidos
- `dataInicial` (String, opcional): Data inicial em ISO UTC
- `dataFinal` (String, opcional): Data final em ISO UTC
- `maxOrders` (Number, opcional): Limite de pedidos

**Retorno:**

```javascript
{
  success: true,
  totalOrders: 100,
  transformedOrders: 95,
  message: 'Sincronização de pedidos concluída com sucesso',
  csvResult: { ... },
  duration: 45000,
  timestamp: '2025-01-24T10:30:00.000Z'
}
```

### `getAllOrdersInPeriod(startDate, toDate, useBatching)`

Busca todos os pedidos de um período da VTEX.

**Parâmetros:**

- `startDate` (String): Data inicial em ISO UTC
- `toDate` (String): Data final em ISO UTC
- `useBatching` (Boolean): Se deve usar processamento em lotes

### `getAllOrdersInPeriodBatched(startDate, toDate, daysPerBatch)`

Busca pedidos em lotes menores para evitar limite de páginas da VTEX.

**Parâmetros:**

- `startDate` (String): Data inicial em ISO UTC
- `toDate` (String): Data final em ISO UTC
- `daysPerBatch` (Number, padrão: 7): Dias por lote

### `saveOrdersToSQLite(orders)`

Salva pedidos da VTEX no SQLite.

**Parâmetros:**

- `orders` (Array): Array de pedidos da VTEX

**Retorno:**

```javascript
{
  success: true,
  inserted: 50,
  updated: 25,
  total: 75
}
```

### `getPendingSyncOrders(options)`

Busca pedidos pendentes de sincronização do SQLite.

**Parâmetros:**

- `options.startDate` (String, opcional): Data inicial
- `options.endDate` (String, opcional): Data final

### `markOrdersAsSynced(orders)`

Marca pedidos como sincronizados no SQLite.

**Parâmetros:**

- `orders` (Array): Array de objetos `{order, item}`

## 🔄 Fluxo de Sincronização

```
1. Busca pedidos da VTEX
   ↓
2. Transforma para formato SQLite
   ↓
3. Salva no SQLite (isSync=false)
   ↓
4. Busca pedidos pendentes do SQLite
   ↓
5. Transforma para formato Emarsys
   ↓
6. Gera arquivo CSV
   ↓
7. Envia CSV para Emarsys
   ↓
8. Marca pedidos como sincronizados (isSync=true)
```

## 📊 Estrutura de Dados

### Formato VTEX → SQLite

```javascript
{
  order: "1234567890123-01",
  item: "SKU123",
  email: "cliente@email.com",
  quantity: 2,
  price: 99.99,
  timestamp: "2025-01-24T10:30:00Z",
  isSync: false,
  order_status: "payment-approved",
  s_channel_source: "web",
  s_store_id: "hope",
  s_sales_channel: "ecommerce",
  s_discount: "10.00"
}
```

### Formato SQLite → Emarsys CSV

```csv
order,item,email,quantity,timestamp,price,s_channel_source,s_store_id,s_sales_channel,s_discount
1234567890123-01,SKU123,cliente@email.com,2,2025-01-24T10:30:00Z,99.99,web,hope,ecommerce,10.00
```

## 🔌 Integração com Rotas

### Rota `/api/background/cron-orders`

Nova rota criada especificamente para cron jobs que usa o `OrdersSyncService`.

**Endpoint:** `POST /api/background/cron-orders`

**Uso no Cron:**
O cron job configurado em `utils/cronService.js` usa esta rota automaticamente.

### Rota `/api/background/sync-orders`

Rota original mantida intacta que usa os serviços antigos (`vtexOrdersService`).

**Endpoint:** `POST /api/background/sync-orders`

## 📝 Notas Importantes

1. **Separação de Responsabilidades**: O `OrdersSyncService` é usado apenas pela nova rota `/cron-orders`. A rota `/sync-orders` continua usando os serviços originais.
2. **Persistência**: Todos os dados são armazenados no SQLite (`data/orders.db`), não na entidade VTEX `emsOrdersV2`.
3. **Controle de Sincronização**: O campo `isSync` no SQLite controla quais pedidos já foram enviados para Emarsys.
4. **Rollback**: Os serviços originais (`emsOrdersService` e `vtexOrdersService`) estão intactos e podem ser usados para rollback se necessário.
5. **Migrations**: As migrations do SQLite são executadas automaticamente na inicialização.

## 🔍 Troubleshooting

### Pedidos não estão sendo sincronizados

1. Verifique se o banco SQLite está inicializado:

   ```bash
   docker-compose exec app ls -la data/orders.db
   ```
2. Verifique pedidos pendentes:

   ```bash
   curl -X GET http://localhost:3000/api/background/status/{jobId}
   ```
3. Verifique logs:

   ```bash
   docker-compose logs -f app
   ```

### Erro ao buscar pedidos da VTEX

1. Verifique credenciais VTEX no `.env`:

   ```bash
   VTEX_APP_KEY=...
   VTEX_APP_TOKEN=...
   VTEX_BASE_URL=...
   ```
2. Verifique se a API VTEX está acessível:

   ```bash
   curl -X GET "https://{vtex-base-url}/api/oms/pvt/orders" \
     -H "X-VTEX-API-AppKey: ..." \
     -H "X-VTEX-API-AppToken: ..."
   ```

### CSV não está sendo gerado

1. Verifique se há pedidos pendentes no SQLite
2. Verifique permissões do diretório `exports/`
3. Verifique logs para erros de validação de dados

## 📚 Referências

- [Docker Setup Guide](./docker-setup.md)
- [CURL Examples](./curl-examples.md)
- [Database Schema](../database/migrations/001_create_orders_table.sql)
