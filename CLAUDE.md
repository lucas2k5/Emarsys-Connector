# CLAUDE.md — Hope Emarsys Connector

## Agentes disponíveis — USE SEMPRE, não trabalhe sozinho

- `backend-tech-lead` → servidor, API, banco, infra, cron jobs, serviços de integração
- `frontend-tech-lead` → dashboards HTML (metrics, alerts), webhook simulator UI
- `data-scientist` → análise de dados de pedidos/contatos, CSVs, métricas Prometheus
- `code-reviewer` → revisar TUDO antes de finalizar

## Fluxo obrigatório para qualquer feature

1. Planeje quais agentes envolver
2. Delegue para os agentes corretos (em paralelo se possível)
3. USE o `code-reviewer` em tudo ao final
4. Reporte resultado e pontos de atenção

---

## Visão Geral do Projeto

**Hope Emarsys Connector** é um servidor Node.js/Express que atua como ponte de integração entre a plataforma de e-commerce **VTEX** e a plataforma de marketing **Emarsys**. Sincroniza produtos, pedidos e contatos em tempo real e por agendamento.

**Versão atual:** 1.13.0
**Repositório:** `https://dev.azure.com/gabrielaraujo-openflow/Hope/_git/Emarsys-Connector`
**Desenvolvido por:** Lucas Fernandes - Openflow - Tech Lead SAP

### Fluxos principais

```
PRODUTOS:   App → GET VTEX Catalog API → CSV (.gz) → Upload SFTP (a cada 8h)
PEDIDOS:    App → GET VTEX OMS API → SQLite → API Emarsys OAuth2 (a cada 30min)
CONTATOS:   VTEX → POST webhook entrada → SQLite → Webhook saída (tempo real + retry a cada 5min)
```

---

## Stack e Tecnologias

| Categoria     | Tecnologia                        | Versão     |
|---------------|-----------------------------------|------------|
| Runtime       | Node.js                           | >= 22 LTS  |
| Framework     | Express.js                        | 4.18.2     |
| Banco         | SQLite (better-sqlite3, WAL mode) | 11.6.0     |
| HTTP Client   | Axios + axios-rate-limit          | 1.7.2      |
| SFTP          | ssh2                              | 1.16.0     |
| Auth          | OAuth2 (client_credentials), WSSE | —          |
| Segurança     | Helmet, CORS, dotenv              | —          |
| Logging       | Winston + winston-daily-rotate    | 3.17.0     |
| Métricas      | prom-client + express-prometheus  | 13.2.0     |
| Agendamento   | cron                              | 3.1.7      |
| Produção      | PM2                               | 5.3.0      |
| Dev           | nodemon, TypeScript (beta)        | —          |

---

## Como Rodar o Projeto

### Pré-requisitos

- Node.js >= 22.x (LTS)
- NPM
- PM2 (produção): `npm install -g pm2`

### Setup inicial

```bash
git clone https://dev.azure.com/gabrielaraujo-openflow/Hope/_git/Emarsys-Connector
cd Emarsys-Connector
npm install
cp .env.example .env
# Editar .env com as credenciais reais
```

### Desenvolvimento

```bash
npm run dev          # nodemon com --expose-gc --max-old-space-size=3072
```

### Produção (PM2)

```bash
npm run prod         # install + stop anterior + pm2 start ecosystem.config.js --env production
npm run prod:restart # reinstall + pm2 restart
npm run prod:reload  # zero-downtime reload
npm run prod:stop    # parar processo
npm run prod:logs    # ver logs do pm2
npm run prod:status  # status dos processos
npm run prod:monit   # dashboard interativo pm2
```

### Testes

Não há suite de testes automatizados configurada. Estratégias manuais de teste:

```bash
# Modo DEBUG — simula envio sem acionar APIs externas
DEBUG=true npm run dev

# Health check
curl http://localhost:3000/health

# Webhook simulator (só em desenvolvimento)
POST http://localhost:3000/api/webhook-simulator/contacts
GET  http://localhost:3000/api/webhook-simulator/contacts

# Testar sync de pedidos com limite (sem enviar)
curl 'http://localhost:3000/api/integration/orders-extract-all?brazilianDate=2025-09-23&maxOrders=3'

# Testar conectividade SFTP
curl http://localhost:3000/api/vtex/products/test-sftp
```

> **DEBUG=true**: Gera CSV + simula envio + marca `isSync=true` sem chamar APIs externas.

### Scripts utilitários

```bash
npm run clear-logs           # Limpa arquivos de log
npm run cleanup:exports      # Remove exports antigos
npm run cleanup:exports:dry  # Dry run (só mostra o que seria deletado)
npm run logs                 # tail -f do log do dia atual
```

---

## Estrutura de Pastas

```
Emarsys-Connector/
├── server.js                   # Entry point: Express app, middlewares, roteamento, cron bootstrap
├── ecosystem.config.js         # PM2: instância única, 3GB heap, env de produção/desenvolvimento
├── nodemon.json                # Ignorar logs/, data/, exports/ no watch
├── tsconfig.json               # TypeScript (beta — build separado via npm run beta:build)
│
├── routes/                     # Handlers HTTP (17 arquivos)
│   ├── emarsysContacts.js     # Webhook entrada (VTEX→nós) + criar contatos
│   ├── integration.js         # Orquestração central: extração e sync de pedidos
│   ├── backgroundJobs.js      # Jobs assíncronos com rastreamento em memória
│   ├── cronJobs.js            # Execução manual de cron jobs via API
│   ├── cronManagement.js      # Controle de cron: start/stop/restart por nome
│   ├── vtexProducts.js        # Sync de produtos VTEX → SFTP
│   ├── emarsysSales.js        # Sales data endpoints
│   ├── emarsys.js             # Acesso direto API Emarsys
│   ├── emarsysCsv.js          # Upload de CSVs
│   ├── emsClients.js          # Clientes via Master Data
│   ├── emsOrders.js           # Pedidos via Master Data
│   ├── metrics.js             # Dashboard HTML + Prometheus + JSON
│   ├── alerts.js              # Sistema de alertas
│   ├── contactErrors.js       # Rastreamento de erros de contatos
│   └── crashProtection.js     # API de proteção contra crash loops
│
├── services/                   # Lógica de negócio (24 arquivos)
│   ├── contactWebhookService.js    # Envio via webhook + persistência SQLite
│   ├── contactRetryService.js      # Retry com backoff exponencial (max 5 tentativas)
│   ├── emarsysOAuth2Service.js     # Auth OAuth2 com cache de token
│   ├── emarsysOrdersApiService.js  # Envio de pedidos via Scarab Research HAPI
│   ├── ordersSyncService.js        # Orquestração completa do sync de pedidos
│   ├── vtexOrdersService.js        # Wrapper VTEX OMS API com rate limit
│   ├── vtexProductService.js       # Catálogo VTEX → CSV → SFTP
│   ├── emarsysCsvService.js        # Geração e upload de CSVs Emarsys
│   ├── emarsysHapiService.js       # HAPI endpoints (legado)
│   ├── ordersSftpService.js        # Upload de pedidos via SFTP (legado)
│   ├── integrationService.js       # Orquestrador unificado
│   ├── contactService.js           # Extração de contatos via VTEX CL API
│   ├── retryService.js             # Retry genérico
│   ├── systemMonitor.js            # Monitoramento de recursos do sistema
│   └── ...                         # emsClientsService, emsOrdersService, addressService
│
├── database/                   # Camada de dados SQLite
│   ├── sqlite.js              # Singleton + init + métodos CRUD
│   └── migrations/            # SQL puro (001_orders, 002_contacts, 003_client_type)
│
├── utils/                      # Utilitários transversais
│   ├── logger.js              # Winston com rotação diária + helpers por módulo
│   ├── metrics.js             # Prometheus counters/histograms/gauges
│   ├── monitoring.js          # Middleware de request timing
│   ├── cronService.js         # Gerenciamento de cron jobs (products, orders, retry)
│   ├── crashProtection.js     # Bloqueio se ≥5 crashes/hora
│   └── dateUtils.js           # Conversão timezone America/Sao_Paulo
│
├── middleware/                 # Middlewares Express customizados
├── helpers/                    # Helpers de sync de pedidos
│   ├── orderSyncHelper.js     # VTEX order synchronization helpers
│   └── syncOrderHelper.js     # Marcar pedidos como sincronizados
│
├── config/                     # Configurações de memória e monitoramento
├── api/                        # Vercel serverless functions (background, cron, health)
├── scripts/                    # Manutenção: deploy, cleanup, logs, logrotate
├── exports/                    # CSVs gerados (limpos automaticamente)
├── data/                       # Cache local: products.json, orders.db (SQLite)
├── logs/                       # Logs rotativos diários (ignorados no git)
├── docs/                       # Documentação extra (deploy-vps.md, docker-setup.md)
├── .azure/                     # CI/CD Azure Pipelines
├── .docker/                    # Docker + Grafana + Prometheus configs
└── .nginx/                     # Reverse proxy config
```

---

## Variáveis de Ambiente

Copie `.env.example` e preencha. Todas as variáveis abaixo são necessárias em produção.

### Servidor

```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=development       # ou production
BASE_URL=                  # URL base da aplicação (usado nos crons)
DEBUG=false                # true = simula envios sem chamar APIs externas
```

### VTEX

```env
VTEX_BASE_URL=https://hope.myvtex.com
VTEX_APP_KEY=
VTEX_APP_TOKEN=
VTEX_ORDERS_URL=/_v/orders/list
```

### Emarsys — Pedidos (OAuth2 + HAPI)

```env
EMARSYS_OAUTH2_CLIENT_ID=
EMARSYS_OAUTH2_CLIENT_SECRET=
EMARSYS_OAUTH2_TOKEN_ENDPOINT=https://auth.emarsys.net/oauth2/token
EMARSYS_ORDERS_API_URL=https://admin.scarabresearch.com/hapi/merchant/{MERCHANT_ID}/sales-data/api
EMARSYS_ORDERS_API_TIMEOUT=60000
```

### Emarsys — API Legada (WSSE)

```env
EMARSYS_USER=
EMARSYS_SECRET=
EMARSYS_USERNAME=
EMARSYS_PASSWORD=
EMARSYS_SALES_TOKEN=
```

### SFTP — Produtos

```env
SFTP_PRODUCTS_HOST=exchange.si.emarsys.net
SFTP_PRODUCTS_PORT=22
SFTP_PRODUCTS_USERNAME=bu_hope
SFTP_PRODUCTS_PASSWORD=
SFTP_PRODUCTS_REMOTE_PATH=/catalog/
```

### SFTP — Pedidos (legado)

```env
SFTP_ORDERS_HOST=
SFTP_ORDERS_PORT=22
SFTP_ORDERS_USERNAME=
SFTP_ORDERS_PASSWORD=
SFTP_ORDERS_REMOTE_PATH=
```

### Webhooks — Contatos

```env
CONTACTS_WEBHOOK_URL=                  # URL padrão (fallback)
CONTACTS_WEBHOOK_URL_HOPE=             # URL específica Hope (opcional)
CONTACTS_WEBHOOK_URL_RESORT=           # URL específica Resort (opcional)
CONTACTS_WEBHOOK_CLIENT_TYPE=hope
CONTACTS_WEBHOOK_AUTH_HEADER=
CONTACTS_WEBHOOK_TIMEOUT=30000
```

### Banco de Dados

```env
SQLITE_DB_PATH=./data/orders.db
```

### Cron Jobs

```env
PRODUCTS_SYNC_CRON=0 */8 * * *        # A cada 8h
ORDERS_SYNC_CRON=*/30 * * * *         # A cada 30min
CONTACTS_RETRY_CRON=*/5 * * * *       # A cada 5min
CRON_TIMEZONE=America/Sao_Paulo
ORDERS_SYNC_ENABLED=false             # ATENÇÃO: false = cron ativo, true = cron pausado
ENABLE_EMARSYS_UPLOAD=true
```

> **ATENÇÃO:** `ORDERS_SYNC_ENABLED=false` **ativa** o cron de pedidos. Nomenclatura invertida — não altere sem verificar `cronService.js`.

### Performance

```env
PRODUCTS_TIMEOUT_MS=600000     # 10 min
ORDERS_TIMEOUT_MS=900000       # 15 min
LOG_LEVEL=info                 # debug | info | warn | error
```

### Alertas

```env
ALERT_ERROR_RATE=0.1           # 10% de erros
ALERT_RESPONSE_TIME=5000       # 5s
ALERT_MEMORY_USAGE=0.9         # 90% memória
ALERT_CONSECUTIVE_ERRORS=5
```

---

## Padrões de Código

### Async/Await

Todo o código usa `async/await` exclusivamente. Sem callbacks, sem `.then()` chains.

```javascript
// ✅ Correto
async function syncOrders() {
  try {
    const orders = await vtexOrdersService.getOrders(period);
    const result = await db.insertBatch(orders);
    logger.info('✅ Pedidos sincronizados', { count: result.processed });
    return result;
  } catch (error) {
    logger.error('❌ Erro ao sincronizar pedidos', { error: error.message });
    throw error;
  }
}
```

### Logging com Emojis

Winston com prefixos emoji para distinção visual. Sempre incluir contexto estruturado.

```javascript
const { logHelpers } = require('../utils/logger');

// Por módulo
logHelpers.logOrders('🔄 Iniciando sync de pedidos', { period, count });
logHelpers.logProducts('✅ Upload SFTP concluído', { file, size });
logHelpers.logClients('⚠️ Contato em retry', { email, attempts });

// Logger genérico
const logger = require('../utils/logger');
logger.info('🚀 Servidor iniciado', { port: 3000 });
logger.error('❌ Falha crítica', { error: err.message, stack: err.stack });
```

**Padrão de emojis:**
- `🚀` inicialização
- `✅` sucesso
- `❌` erro
- `⚠️` aviso
- `🔄` operação em andamento
- `📊` métricas/stats
- `🕐` timing/scheduling

### Respostas de Erro

Sempre retornar JSON estruturado com `success`, `error` e `timestamp`.

```javascript
// ✅ Sucesso
res.json({ success: true, data: result, timestamp: new Date().toISOString() });

// ✅ Erro do cliente
res.status(400).json({ success: false, error: 'Email obrigatório', timestamp: new Date().toISOString() });

// ✅ Erro interno
res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
```

### Acesso ao Banco de Dados

Sempre usar o singleton. Nunca criar nova instância diretamente.

```javascript
const { getDatabase } = require('../database/sqlite');
const db = getDatabase();
await db.init();

// UPSERT (padrão para pedidos)
const result = db.upsertOrder({ order, item, email, quantity, price, timestamp, isSync: false });
// result: { success, id, action: 'inserted' | 'updated' }

// Queries comuns
db.findOrder(orderId, item, status)
db.listPendingSync({ limit: 1000, offset: 0, startDate, endDate })
db.markAsSynced([ids])
db.insertBatch(orderArray)              // Dentro de transaction para performance
db.getStats()                           // { total, pending, synced }
```

### Rate Limiting para VTEX

Limite de 3.900 req/s na API da VTEX.

```javascript
const rateLimit = require('axios-rate-limit');
const client = rateLimit(axios.create({ baseURL, headers }), {
  maxRequests: 3900,
  perMilliseconds: 1000
});
```

### Retry com Backoff Exponencial

```javascript
// Padrão de retry em serviços
const delay = attempts * 2 * 60 * 1000;  // 2min, 4min, 6min, 8min, 10min
await new Promise(resolve => setTimeout(resolve, delay));
```

### Processamento em Lotes

```javascript
const batchSize = 100;
for (let i = 0; i < items.length; i += batchSize) {
  const batch = items.slice(i, i + batchSize);
  await Promise.all(batch.map(item => processItem(item)));
  if (i + batchSize < items.length) {
    await new Promise(r => setTimeout(r, 200));  // Pausa entre lotes
  }
}
```

### Autenticação VTEX

```javascript
headers: {
  'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
  'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
  'Content-Type': 'application/json'
}
```

### Autenticação Emarsys WSSE

```javascript
const crypto = require('crypto');
const nonce = crypto.randomBytes(16).toString('hex');
const created = new Date().toISOString();
const digest = crypto.createHash('sha1')
  .update(nonce + created + process.env.EMARSYS_SECRET)
  .digest('base64');
// Header: UsernameToken Username="...", PasswordDigest="...", Nonce="...", Created="..."
```

---

## Schema do Banco de Dados (SQLite)

### Tabela `orders`

```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "order" TEXT,               -- ID do pedido VTEX
  item TEXT,                  -- SKU do produto
  email TEXT,
  quantity INTEGER,
  price REAL,
  timestamp TEXT,             -- ISO datetime do pedido
  isSync INTEGER DEFAULT 0,  -- 0=pendente, 1=sincronizado
  order_status TEXT,
  s_channel_source TEXT,
  s_store_id TEXT,
  s_sales_channel TEXT,
  s_discount TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  UNIQUE("order", item, order_status)
);
```

### Tabela `contacts`

```sql
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT,
  payload TEXT,               -- JSON completo do contato
  status TEXT,                -- pending | sent | failed | dead
  attempts INTEGER DEFAULT 0,
  client_type TEXT,           -- hope | resort
  last_error TEXT,
  created_at DATETIME,
  updated_at DATETIME
);
```

---

## APIs Principais

### Produtos

| Método   | Endpoint                              | Descrição                    |
|----------|---------------------------------------|------------------------------|
| POST/GET | `/api/vtex/products/sync`             | Sync completo (background)   |
| POST     | `/api/vtex/products/generate-csv`     | Gera CSV dos produtos        |
| POST     | `/api/vtex/products/generate-emarsys-csv` | Gera CSV + upload SFTP   |
| GET      | `/api/vtex/products/test-sftp`        | Testa conectividade SFTP     |
| GET      | `/api/vtex/products/stats`            | Estatísticas dos produtos    |
| GET      | `/api/vtex/products/search?q=termo`   | Busca produtos               |

### Pedidos

| Método | Endpoint                                | Descrição                  |
|--------|-----------------------------------------|----------------------------|
| GET    | `/api/integration/orders-extract-all`   | Extrai e processa pedidos  |
| POST   | `/api/integration/sales-feed`           | Feed de vendas completo    |
| GET    | `/api/emarsys/sales/sync-status`        | Status da sincronização    |
| POST   | `/api/emarsys/sales/send-unsynced`      | Envia pedidos pendentes    |

### Contatos

| Método | Endpoint                                | Descrição                                |
|--------|-----------------------------------------|------------------------------------------|
| POST   | `/api/emarsys/contacts/webhook`         | Webhook entrada VTEX → SQLite → saída    |
| POST   | `/api/emarsys/contacts/create-single`   | Cria contato manual (teste/Postman)      |
| POST   | `/api/emarsys/contacts/create`          | Cria contato formato legado              |
| POST   | `/api/emarsys/contacts/extract-recent`  | Extrai contatos recentes da VTEX         |

### Monitoramento

| Método | Endpoint                              | Descrição                         |
|--------|---------------------------------------|-----------------------------------|
| GET    | `/health`                             | Health check                      |
| GET    | `/api/metrics/dashboard`              | Dashboard HTML de métricas        |
| GET    | `/api/metrics/prometheus`             | Métricas formato Prometheus       |
| GET    | `/api/metrics/json`                   | Métricas formato JSON             |
| GET    | `/api/metrics/contacts/retry-status`  | Status do retry de contatos       |
| GET    | `/api/alerts/active`                  | Alertas ativos                    |
| GET    | `/api/background/jobs`                | Jobs em execução                  |
| GET    | `/api/cron-management/status`         | Status dos cron jobs              |
| POST   | `/api/cron-management/start/:jobName` | Inicia um cron job específico     |
| POST   | `/api/cron-management/stop/:jobName`  | Para um cron job específico       |
| POST   | `/api/cron-management/restart-all`    | Reinicia todos os cron jobs       |

---

## Sistema de Logs

Arquivos gerados em `./logs/` com rotação diária (formato `DD-MM-YYYY`):

| Arquivo                           | Conteúdo                            |
|-----------------------------------|-------------------------------------|
| `ems-pcy-combined-%DATE%.log`     | Todos os logs                       |
| `ems-pcy-system-%DATE%.log`       | Eventos do sistema                  |
| `ems-pcy-errors-%DATE%.log`       | Apenas erros                        |
| `ems-pcy-http-%DATE%.log`         | Requisições HTTP                    |
| `ems-pcy-sync-%DATE%.log`         | Operações de sincronização          |
| `ems-pcy-retry-%DATE%.log`        | Reprocessamento de contatos         |
| `ems-pcy-alerts-%DATE%.log`       | Alertas do sistema                  |
| `ems-pcy-pm2-err.log`             | Erros do processo PM2               |
| `ems-pcy-pm2-out.log`             | Saída do processo PM2               |

```bash
# Logs em tempo real
npm run logs

# Logs de erro do dia
tail -f logs/ems-pcy-errors-$(date +%d-%m-%Y).log

# Logs do PM2
npm run prod:logs
npm run prod:logs:error

# Limpar todos os logs
npm run clear-logs
```

---

## Middleware Stack (ordem em server.js)

1. **Helmet** — Security headers HTTP
2. **CORS** — Cross-origin resource sharing
3. **Suspicious path blocking** — Bloqueia dotfiles e exploits comuns
4. **Unknown route rate limiter** — 5 tentativas por IP a cada 30min
5. **Metrics middleware** — Coleta Prometheus
6. **Resource monitor** — Rastreia memória e tempo de resposta
7. **JSON parser** — Com captura de raw body para debug
8. **HTTP logger** — Winston request/response
9. **Monitoring middleware** — Request timing
10. **Error handler** — Catch-all global

---

## Cron Jobs

Três jobs nativos gerenciados por `CronService` (`utils/cronService.js`):

| Job               | Schedule padrão    | Ação                                        |
|-------------------|--------------------|---------------------------------------------|
| `products-sync`   | `0 */8 * * *`      | GET `/api/vtex/products/sync`               |
| `orders-sync`     | `*/30 * * * *`     | POST `/api/background/cron-orders`          |
| `contacts-retry`  | `*/5 * * * *`      | `contactRetryService.processFailedContacts()` |

Controlados via API:
```bash
# Status de todos os jobs
GET /api/cron-management/status

# Controle manual
POST /api/cron-management/start/products-sync
POST /api/cron-management/stop/orders-sync
POST /api/cron-management/restart-all
```

---

## Pendências Abertas

- [x] ~~Integrar `emarsysOrdersApiService` no cron de pedidos (substituir fluxo SFTP legado)~~ — integrado via `autoSend: true` em `ordersSyncService.syncOrders`
- [ ] Configurar credenciais SFTP de produtos **Hope Resort**
- [ ] Configurar ambiente VTEX **Hope Resort** (conta, app key/token)
- [ ] Adicionar campo `s_tipo_pagamento` no schema de pedidos (quando disponível da VTEX)
- [ ] Implementar suite de testes automatizados

---

## Docker e Deploy

### Docker

```bash
docker build -t emarsys-connector -f .docker/Dockerfile .
docker run -p 3000:3000 --env-file .env emarsys-connector
```

### VPS com PM2

```bash
npm install -g pm2
npm run prod
pm2 save
pm2 startup
```

Guias detalhados em:
- `docs/deploy-vps.md`
- `docs/docker-setup.md`

---

## Memória e Performance

- **Node.js heap:** 3GB (`--max-old-space-size=3072`)
- **GC exposto:** `--expose-gc` (PM2 e nodemon)
- **PM2 restart threshold:** 3GB (`max_memory_restart: '3G'`)
- **Batch size:** 100–200 itens por execução
- **VTEX rate limit:** 3.900 req/s
- **Timezone:** `America/Sao_Paulo` em todas as operações de data
