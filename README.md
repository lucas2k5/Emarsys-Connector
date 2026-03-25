# Hope Emarsys Connector

Sistema de integração entre VTEX e Emarsys para sincronização de produtos, pedidos e contatos.

## Visão Geral

O **Hope Emarsys Connector** é uma aplicação Node.js/Express que atua como ponte entre a plataforma de e-commerce VTEX e a plataforma de marketing Emarsys.

### Tecnologias

| Categoria | Tecnologia | Uso |
|---|---|---|
| Runtime | Node.js 22 (LTS) | Servidor |
| Framework | Express.js | API REST |
| Banco de Dados | SQLite (better-sqlite3, WAL) | Persistência de pedidos e contatos |
| HTTP Client | Axios | VTEX API, webhooks, Emarsys API |
| SFTP | ssh2-sftp-client | Upload de catálogo de produtos |
| Auth | OAuth2 (client_credentials) | Autenticação Emarsys |
| Segurança | Helmet, CORS, dotenv | Headers HTTP, variáveis de ambiente |
| Logging | Winston | Logs estruturados por módulo |
| Métricas | prom-client + Grafana | Monitoramento Prometheus |
| Agendamento | node-cron | Cron jobs (produtos, pedidos, retry) |
| Produção | PM2, Docker | Gerenciamento de processos |

### Fluxos de Dados

```
PRODUTOS:   App → GET VTEX Catalog API → CSV (.gz) → Upload SFTP (a cada 8h)
PEDIDOS:    App → GET VTEX OMS API → SQLite → API Emarsys OAuth2 (a cada 30min)
CONTATOS:   VTEX → POST webhook entrada → SQLite → Webhook saída (tempo real + retry por client_type)
```

- **Produtos**: A aplicação busca ativamente (pull) os dados na VTEX via API e envia via SFTP
- **Pedidos**: A aplicação busca os pedidos na VTEX e envia via API Emarsys (OAuth2)
- **Contatos**: A VTEX envia (push) os dados via webhook de entrada. Contatos são persistidos no SQLite com `client_type` (hope/resort), com filas de reprocessamento separadas por ambiente

## Arquitetura

```
hope.emarsys-connector/
├── server.js                   # Servidor Express principal
├── routes/                     # Endpoints REST API
│   ├── emarsysContacts.js     # Contatos VTEX → Webhook externo
│   ├── vtexProducts.js        # Sync de produtos VTEX → SFTP
│   ├── emarsysSales.js        # Sales data
│   ├── integration.js         # Integração unificada de pedidos
│   ├── emsClients.js          # Sync de clientes via Master Data
│   ├── emsOrders.js           # Sync de pedidos via Master Data
│   ├── cronJobs.js            # Gerenciamento de cron jobs
│   ├── alerts.js              # Sistema de alertas
│   └── metrics.js             # Métricas, monitoramento e status de contatos
├── services/                   # Lógica de negócio
│   ├── contactWebhookService.js    # Envio de contatos via webhook + persistência SQLite
│   ├── contactRetryService.js      # Reprocessamento de contatos com backoff exponencial
│   ├── emarsysOAuth2Service.js     # Autenticação OAuth2 (client_credentials)
│   ├── emarsysOrdersApiService.js  # Envio de pedidos via API Emarsys (OAuth2)
│   ├── ordersSftpService.js        # Upload de pedidos via SFTP (legado)
│   ├── vtexProductService.js       # Produtos VTEX → CSV → SFTP
│   ├── emarsysCsvService.js        # Geração de CSV para Emarsys
│   ├── vtexOrdersService.js        # Busca e processamento de pedidos
│   ├── ordersSyncService.js        # Orquestração do sync de pedidos
│   ├── emarsysHapiService.js       # Upload pedidos via HAPI (legado)
│   ├── contactService.js           # Extração de contatos da VTEX
│   └── integrationService.js       # Serviço de integração unificado
├── database/                   # SQLite (WAL mode) para tracking de pedidos e contatos
│   ├── sqlite.js
│   └── migrations/
│       ├── 001_create_orders_table.sql
│       ├── 002_create_contacts_table.sql
│       └── 003_add_client_type_to_contacts.sql
├── utils/                      # Utilitários (auth, logger, cron, métricas)
│   └── cronService.js         # Cron jobs (produtos, pedidos, retry contatos)
├── helpers/                    # Helpers de sync de pedidos
├── config/                     # Configurações de memória e monitoramento
├── scripts/                    # Scripts de manutenção
├── exports/                    # Arquivos CSV gerados
├── data/                       # Cache local (products.json, SQLite DB)
└── logs/                       # Logs da aplicação
```

## Fluxo de Produtos

### Processo completo

```
Cron (8h) ou POST /api/vtex/products/sync
  │
  ├─ Testa conectividade com VTEX
  ├─ Busca todos os produtos + SKUs (rate limit: 3.900 req/s)
  ├─ Salva cache local (data/products.json)
  ├─ Gera CSV com 13 colunas (1 linha por SKU)
  ├─ Comprime em .gz
  └─ Upload via SFTP para servidor de produtos
```

### Colunas do CSV de Produtos

| Coluna | Descrição | Origem VTEX |
|---|---|---|
| `item` | Referência do SKU | `referenceId` |
| `title` | Nome do produto | `productName` |
| `link` | URL do produto | `product.link` |
| `image` | URL da imagem | primeira imagem do SKU |
| `category` | Categoria (folha) | última categoria |
| `available` | Disponibilidade | `IsAvailable` do seller |
| `description` | Descrição | `product.description` |
| `price` | Preço de venda | `Price` do seller |
| `msrp` | Preço de lista | `ListPrice` do seller |
| `group_id` | Agrupador de SKUs | `productId` |
| `c_stock` | Estoque disponível | `AvailableQuantity` |
| `c_sku_id` | ID do SKU na VTEX | `itemId` |
| `c_product_id` | ID do produto na VTEX | `productId` |

### SFTP de Produtos

Ambiente **Hope** configurado. Ambiente **Hope Resort** pendente.

```env
SFTP_PRODUCTS_HOST=exchange.si.emarsys.net
SFTP_PRODUCTS_PORT=22
SFTP_PRODUCTS_USERNAME=bu_hope
SFTP_PRODUCTS_PASSWORD=***
SFTP_PRODUCTS_REMOTE_PATH=/catalog/
```

## Fluxo de Pedidos

### Processo completo

```
Cron (30min) ou GET /api/integration/orders-extract-all
  │
  ├─ Busca pedidos na VTEX OMS API
  ├─ Salva no SQLite (flag isSync para controle)
  ├─ Gera CSV com 12 campos (separador: vírgula, decimal: ponto)
  └─ POST CSV como binary para Sales Data API (OAuth2)
```

### CSV de Pedidos

O arquivo CSV é enviado como binary para a API Scarab Research (HAPI). Campos na ordem:

| Campo | Descrição | Origem |
|---|---|---|
| `item` | SKU do produto (mesmo do catálogo) | VTEX |
| `price` | Preço unitário (decimal com `.`) | VTEX |
| `order` | ID do pedido | VTEX |
| `timestamp` | Data/hora do pedido | VTEX |
| `customer` | Identificador do cliente (CPF hash) | VTEX |
| `quantity` | Quantidade | VTEX |
| `s_sales_channel` | Canal de vendas | VTEX |
| `s_store_id` | ID da loja | VTEX |
| `s_canal` | Canal de origem | VTEX |
| `s_loja` | Loja | VTEX |
| `s_tipo_pagamento` | Tipo de pagamento | VTEX |
| `s_cupom` | Cupom/desconto | VTEX |

### Autenticação OAuth2

O envio de pedidos utiliza OAuth2 com fluxo `client_credentials`. O token é obtido automaticamente e mantido em cache com renovação antes da expiração.

```env
EMARSYS_OAUTH2_CLIENT_ID=
EMARSYS_OAUTH2_CLIENT_SECRET=
EMARSYS_OAUTH2_TOKEN_ENDPOINT=https://auth.emarsys.net/oauth2/token
EMARSYS_ORDERS_API_URL=https://admin.scarabresearch.com/hapi/merchant/{MERCHANT_ID}/sales-data/api
EMARSYS_ORDERS_API_TIMEOUT=60000
```

## Fluxo de Contatos

### Arquitetura de Webhooks (entrada + saída)

```
VTEX Master Data (cliente criado/atualizado)
  │
  └─ POST <ngrok-entrada>/api/emarsys/contacts/webhook    ← Webhook de ENTRADA
       │
       ├─ Valida email obrigatório
       ├─ Idempotência (ignora duplicatas em janela de 15s)
       ├─ Persiste no SQLite (status: pending, client_type: hope|resort)
       │
       └─ POST <CONTACTS_WEBHOOK_URL>/sync                 ← Webhook de SAÍDA
            │
            ├─ Sucesso → status: sent no SQLite
            └─ Falha → status: failed no SQLite
                 │
                 └─ Cron (a cada 5min) reprocessa por fila separada
                      ├─ Fila "hope"   → usa CONTACTS_WEBHOOK_URL_HOPE (ou fallback)
                      ├─ Fila "resort" → usa CONTACTS_WEBHOOK_URL_RESORT (ou fallback)
                      ├─ Backoff exponencial: attempts * 2 min
                      ├─ Máx 5 tentativas por contato
                      ├─ Sucesso → sent
                      └─ Excedeu limite → dead (alerta crítico)
```

**Webhook de ENTRADA** — endpoint exposto via ngrok para a VTEX chamar:
```
POST https://<seu-ngrok>.ngrok-free.app/api/emarsys/contacts/webhook
```

**Webhook de SAÍDA** — destino externo configurado no `.env` (suporta URLs por ambiente):
```
CONTACTS_WEBHOOK_URL=https://...        # URL padrão (fallback)
CONTACTS_WEBHOOK_URL_HOPE=https://...   # URL específica Hope (opcional)
CONTACTS_WEBHOOK_URL_RESORT=https://... # URL específica Resort (opcional)
```

### Monitoramento de Contatos

```
# Totais + breakdown por client_type
GET /api/metrics/contacts/retry-status

# Filtrado por ambiente
GET /api/metrics/contacts/retry-status?client_type=hope
GET /api/metrics/contacts/retry-status?client_type=resort

Resposta (sem filtro):
{
  "pending": 3,
  "sent": 1420,
  "failed": 2,
  "dead": 1,
  "total": 1426,
  "by_client_type": [
    { "client_type": "hope", "pending": 2, "sent": 1000, "failed": 1, "dead": 0, "total": 1003 },
    { "client_type": "resort", "pending": 1, "sent": 420, "failed": 1, "dead": 1, "total": 423 }
  ]
}
```

### Payload do Webhook

A VTEX envia o payload já no formato padronizado. O `client_type` distingue entre ambientes (hope/resort).

```json
{
  "customer_id": "NDI1NzAzOTk4MTc=",
  "client_type": "hope",
  "email": "cliente@email.com",
  "cpf": "42570399817",
  "first_name": "Gabriel",
  "last_name": "Lima",
  "phone": "+551133334444",
  "mobile": "+5511999998888",
  "gender": "M",
  "address": "Avenida Paulista, 1000",
  "city": "São Paulo",
  "state": "SP",
  "country": 31,
  "postal_code": "01310-100",
  "opt_in": true
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `customer_id` | string | Identificador único do cliente (base64) |
| `client_type` | string | Ambiente: `"hope"` ou `"resort"` |
| `email` | string | Email do cliente (obrigatório) |
| `cpf` | string | CPF somente dígitos |
| `first_name` | string | Primeiro nome |
| `last_name` | string | Sobrenome |
| `phone` | string | Telefone fixo com +55 |
| `mobile` | string | Celular com +55 |
| `gender` | string | `"M"` ou `"F"` |
| `address` | string | Endereço completo |
| `city` | string | Cidade |
| `state` | string | UF (2 letras) |
| `country` | number | Código do país (31 = Brasil) |
| `postal_code` | string | CEP |
| `opt_in` | boolean | Aceite de comunicação |

### Configuração do Webhook

```env
# Webhook de saída — URL padrão (fallback para todos os client_types)
CONTACTS_WEBHOOK_URL=https://exemplo.ngrok-free.dev/sync

# URLs específicas por ambiente (opcionais — se não definidas, usa CONTACTS_WEBHOOK_URL)
CONTACTS_WEBHOOK_URL_HOPE=https://hope-webhook.exemplo.com/sync
CONTACTS_WEBHOOK_URL_RESORT=https://resort-webhook.exemplo.com/sync

# Configurações gerais
CONTACTS_WEBHOOK_CLIENT_TYPE=hope
CONTACTS_WEBHOOK_AUTH_HEADER=
CONTACTS_WEBHOOK_TIMEOUT=30000
CONTACTS_RETRY_CRON=*/5 * * * *
```

### Webhook Simulator (desenvolvimento)

Em ambiente de desenvolvimento (`NODE_ENV !== 'production'`), um simulador de webhook está disponível para testar o fluxo sem depender do serviço externo:

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/api/webhook-simulator/contacts` | Recebe contatos (simula destino externo) |
| GET | `/api/webhook-simulator/contacts` | Lista contatos recebidos |
| DELETE | `/api/webhook-simulator/contacts` | Limpa logs do simulador |

## Instalação

### Pré-requisitos

- Node.js >= 22.x (LTS)
- NPM
- PM2 (para produção)

### Setup

```bash
git clone https://dev.azure.com/gabrielaraujo-openflow/Hope/_git/Emarsys-Connector
cd Emarsys-Connector
npm install
cp .env.example .env
# Editar .env com as credenciais
```

### Desenvolvimento

```bash
npm run dev
```

### Produção

```bash
npm run prod
```

## Configuração

### Variáveis de Ambiente

```env
# Server
PORT=3000
NODE_ENV=development
BASE_URL=

# VTEX
VTEX_APP_KEY=seu_app_key
VTEX_APP_TOKEN=seu_app_token
VTEX_BASE_URL=https://hope.myvtex.com

# Debug Mode
DEBUG=false

# Database
SQLITE_DB_PATH=./data/orders.db

# Upload habilitado
ENABLE_EMARSYS_UPLOAD=true

# SFTP Produtos
SFTP_PRODUCTS_HOST=
SFTP_PRODUCTS_PORT=22
SFTP_PRODUCTS_USERNAME=
SFTP_PRODUCTS_PASSWORD=
SFTP_PRODUCTS_REMOTE_PATH=/catalog/

# OAuth2 Pedidos (API)
EMARSYS_OAUTH2_CLIENT_ID=
EMARSYS_OAUTH2_CLIENT_SECRET=
EMARSYS_OAUTH2_TOKEN_ENDPOINT=https://auth.emarsys.net/oauth2/token
EMARSYS_ORDERS_API_URL=

# Webhook Contatos
CONTACTS_WEBHOOK_URL=
CONTACTS_WEBHOOK_CLIENT_TYPE=hope
CONTACTS_WEBHOOK_AUTH_HEADER=
CONTACTS_WEBHOOK_TIMEOUT=30000

# Cron Jobs
PRODUCTS_SYNC_CRON=0 */8 * * *
ORDERS_SYNC_CRON=*/30 * * * *
CONTACTS_RETRY_CRON=*/5 * * * *
CRON_TIMEZONE=America/Sao_Paulo

# Monitoramento
LOG_LEVEL=info
```

Veja `.env.example` para a lista completa de variáveis.

## APIs Principais

### Produtos

| Método | Endpoint | Descrição |
|---|---|---|
| POST/GET | `/api/vtex/products/sync` | Sincroniza produtos (background) |
| POST | `/api/vtex/products/generate-csv` | Gera CSV dos produtos |
| POST | `/api/vtex/products/generate-emarsys-csv` | Gera CSV + upload SFTP |
| GET | `/api/vtex/products/test-sftp` | Testa conectividade SFTP |
| GET | `/api/vtex/products/stats` | Estatísticas dos produtos |
| GET | `/api/vtex/products/search?q=termo` | Busca produtos |

### Pedidos

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/integration/orders-extract-all` | Extrai e processa pedidos |
| POST | `/api/integration/sales-feed` | Feed de vendas completo |
| GET | `/api/emarsys/sales/sync-status` | Status da sincronização |
| POST | `/api/emarsys/sales/send-unsynced` | Envia pedidos pendentes |

### Contatos

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/api/emarsys/contacts/webhook` | Webhook de entrada (VTEX → nós → saída) |
| POST | `/api/emarsys/contacts/create-single` | Cria contato manual (Postman/teste) |
| POST | `/api/emarsys/contacts/create` | Cria contato (formato legado) |
| POST | `/api/emarsys/contacts/extract-recent` | Extrai contatos recentes da VTEX |

### Monitoramento

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/metrics/dashboard` | Dashboard de métricas |
| GET | `/api/metrics/prometheus` | Métricas Prometheus |
| GET | `/api/metrics/contacts/retry-status` | Status do retry de contatos |
| GET | `/api/alerts/active` | Alertas ativos |
| GET | `/api/background/jobs` | Jobs em execução |
| GET | `/api/cron-management/status` | Status dos cron jobs |

## Modo DEBUG

Configure `DEBUG=true` no `.env` para testar sem enviar dados reais:

```bash
# Ativar debug
DEBUG=true

# Testar sincronização (simula envio)
curl 'http://localhost:3000/api/integration/orders-extract-all?brazilianDate=2025-09-23&maxOrders=3'

# Verificar se pedidos foram marcados
curl http://localhost:3000/api/ems-orders/pending-sync

# Desativar para produção
DEBUG=false
```

- **DEBUG=true**: Gera CSV + simula envio + marca `isSync=true`
- **DEBUG=false**: Gera CSV + envia real + marca `isSync=true`

## Logs

### Por módulo

- `ems-pcy-cro-orders-{date}.log` — Pedidos
- `ems-pcy-cro-products-{date}.log` — Produtos
- `ems-pcy-cro-clients-{date}.log` — Clientes/Contatos

### Gerais

- `ems-pcy-system-{date}.log` — Sistema
- `ems-pcy-errors-{date}.log` — Erros
- `ems-pcy-http-{date}.log` — Requisições HTTP
- `ems-pcy-retry-{date}.log` — Reprocessamento

```bash
# Logs em tempo real
npm run logs

# Logs de erro
tail -f logs/ems-pcy-errors-$(date +%d-%m-%Y).log

# Limpar logs
npm run clear-logs
```

## Deploy

### PM2 (Produção)

```bash
npm install -g pm2
npm run prod
pm2 save
pm2 startup
```

### Docker

```bash
docker build -t emarsys-connector -f .docker/Dockerfile .
docker run -p 3000:3000 --env-file .env emarsys-connector
```

Veja [docs/deploy-vps.md](docs/deploy-vps.md) e [docs/docker-setup.md](docs/docker-setup.md) para guias detalhados.

## Pendências

- [x] ~~Definir URL da API de pedidos~~ — configurado (Scarab Research HAPI)
- [x] ~~Definir payload/CSV de pedidos~~ — 12 campos definidos
- [x] ~~Webhook de entrada para VTEX~~ — `/api/emarsys/contacts/webhook` + ngrok
- [x] ~~Payload padronizado de contatos~~ — gender M/F, country numérico, client_type hope/resort
- [x] ~~Webhook de saída configurado~~ — `CONTACTS_WEBHOOK_URL` com retry automático
- [x] ~~Filas de retry separadas por client_type~~ — hope e resort com URLs independentes
- [ ] Integrar `emarsysOrdersApiService` no fluxo do cron de pedidos (substituir SFTP)
- [ ] Configurar credenciais SFTP de produtos **Hope Resort**
- [ ] Configurar ambiente VTEX Hope Resort
- [ ] Adicionar campo `s_tipo_pagamento` no schema de pedidos (quando disponível da VTEX)

---

Desenvolvido por Lucas Fernandes - Openflow - Tech Lead SAP
