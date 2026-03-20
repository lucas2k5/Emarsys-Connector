# Hope Emarsys Connector

Sistema de integração entre VTEX e Emarsys para sincronização de produtos, pedidos e contatos.

## Visão Geral

O **Hope Emarsys Connector** é uma aplicação Node.js/Express que atua como ponte entre a plataforma de e-commerce VTEX e a plataforma de marketing Emarsys.

### Fluxos de Dados

```
PRODUTOS:   App → GET VTEX Catalog API → CSV (.gz) → Upload SFTP (a cada 8h)
PEDIDOS:    App → GET VTEX OMS API → SQLite → API Emarsys OAuth2 (a cada 30min)
CONTATOS:   VTEX Master Data → POST webhook → SQLite (persistência) → Webhook externo (tempo real + retry)
```

- **Produtos**: A aplicação busca ativamente (pull) os dados na VTEX via API e envia via SFTP
- **Pedidos**: A aplicação busca os pedidos na VTEX e envia via API Emarsys (OAuth2)
- **Contatos**: A VTEX envia (push) os dados via webhook. Contatos são persistidos no SQLite antes do envio, com reprocessamento automático em caso de falha

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
│       └── 002_create_contacts_table.sql
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
  └─ Envia via API Emarsys (OAuth2 client_credentials)
```

### Autenticação OAuth2

O envio de pedidos utiliza OAuth2 com fluxo `client_credentials`. O token é obtido automaticamente e mantido em cache com renovação antes da expiração.

```env
EMARSYS_OAUTH2_CLIENT_ID=
EMARSYS_OAUTH2_CLIENT_SECRET=
EMARSYS_OAUTH2_TOKEN_ENDPOINT=https://auth.emarsys.net/oauth2/token
EMARSYS_ORDERS_API_URL=       # Endpoint da API (a definir)
```

## Fluxo de Contatos

### Processo (tempo real + retry automático)

```
VTEX Master Data (cliente criado/atualizado)
  │
  └─ POST /api/emarsys/contacts/create-single
       │
       ├─ Valida e normaliza dados (CPF, telefone, gênero, opt-in)
       ├─ Gera customer_id: base64(md5(cpf ou email))
       ├─ Persiste no SQLite (status: pending)
       ├─ Envia via HTTP POST para webhook externo
       │   ├─ Sucesso → status: sent
       │   └─ Falha → status: failed
       │
       └─ Cron (5min) reprocessa contatos com falha
            ├─ Backoff exponencial: attempts * 2 min (2, 4, 6, 8, 10 min)
            ├─ Max 5 tentativas por contato
            ├─ Sucesso → status: sent
            └─ Excedeu limite → status: dead (alerta crítico)
```

### Monitoramento de Contatos

```
GET /api/metrics/contacts/retry-status

Resposta:
{
  "pending": 3,
  "sent": 1420,
  "failed": 2,
  "dead": 1,
  "total": 1426
}
```

### Payload do Webhook

```json
{
  "customer_id": "base64(md5(cpf_or_email))",
  "client_type": "hope",
  "email": "cliente@email.com",
  "cpf": "12345678900",
  "bday": "1990-05-15",
  "first_name": "João",
  "last_name": "Silva",
  "phone": "+5511999999999",
  "mobile": "+5511888888888",
  "gender": "masculino|feminino|outro",
  "address": "Rua Example, 123",
  "city": "São Paulo",
  "state": "SP",
  "country": "Brasil",
  "postal_code": "01001000",
  "opt_in": true,
  "registration_data": "2024-01-15T10:30:00.000Z"
}
```

### Configuração do Webhook

```env
CONTACTS_WEBHOOK_URL=
CONTACTS_WEBHOOK_CLIENT_TYPE=hope
CONTACTS_WEBHOOK_AUTH_HEADER=
CONTACTS_WEBHOOK_TIMEOUT=30000
CONTACTS_RETRY_CRON=*/5 * * * *
```

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
| POST | `/api/emarsys/contacts/create-single` | Cria contato (webhook da VTEX) |
| POST | `/api/emarsys/contacts/create` | Cria contato manual |
| POST | `/api/emarsys/contacts/send` | Busca e envia contatos em lote |
| POST | `/api/emarsys/contacts/extract-recent` | Extrai contatos recentes |

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

- [ ] Definir URL da API de pedidos (`EMARSYS_ORDERS_API_URL`)
- [ ] Definir payload de pedidos para a API Emarsys
- [ ] Configurar credenciais SFTP de produtos **Hope Resort**
- [ ] Configurar URL do webhook de contatos (`CONTACTS_WEBHOOK_URL`)
- [ ] Configurar ambiente VTEX Hope Resort

---

Desenvolvido por Openflow
