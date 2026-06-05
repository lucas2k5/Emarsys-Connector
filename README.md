# Hope Emarsys Connector

Sistema de integração entre VTEX e Emarsys para sincronização de produtos, pedidos e contatos.

![Arquitetura](./docs/arquitetura.png)

## Visão Geral

O **Hope Emarsys Connector** é uma aplicação Node.js/Express que atua como ponte entre a plataforma de e-commerce VTEX e a plataforma de marketing Emarsys.

### Tecnologias

| Categoria | Tecnologia | Uso |
|---|---|---|
| Runtime | Node.js 22 (LTS) | Servidor |
| Framework | Express.js | API REST |
| Banco de Dados | SQLite (better-sqlite3, WAL) | Persistência de contatos |
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
PRODUTOS (Hope):   VTEX hopelingerie → products.csv (ativos + inativos) → SFTP bu_hope        (diário 02h)
PRODUTOS (Resort): VTEX lojahr       → products_resort.csv              → SFTP hope_resort    (diário 03h)
PEDIDOS (Hope):    VTEX hopelingerie → SQLite → CSV binary → Emarsys merchant 1789FBAF0A6EF683 bearer token  (a cada 30min, em :05 e :35)
PEDIDOS (Resort):  VTEX lojahr       → SQLite → CSV binary → Emarsys merchant 15232C841F7635A9 bearer token  (a cada 30min, em :05 e :35)
CONTATOS (push):          VTEX → POST webhook entrada → SQLite → Webhook saída (tempo real + retry por client_type)
CLIENTES Hope (delta):    VTEX hopelingerie Master Data CL+AD → Webhook saída (cron 30min, 703.145 clientes na base)
CLIENTES Resort (delta):  VTEX lojahr Master Data CL+AD → Webhook saída (cron 30min, independente do Hope)
```

### Processos em produção

```
pm2 → api    (server.js)   — Express HTTP, rotas, webhooks, monitoramento
pm2 → worker (worker.js)   — Cron jobs exclusivamente: produtos, pedidos, retry de contatos
```

Os dois processos são independentes. Se o worker travar num sync longo, a API continua respondendo normalmente. Se a API reiniciar, os crons continuam no worker sem interrupção.

| Processo | Reiniciar sem afetar | Crons ativos |
|---|---|---|
| `api` | worker continua | nenhum |
| `worker` | api continua | produtos, pedidos, retry contatos |

**Cron jobs no worker:**

| Job | Schedule | Ação |
|---|---|---|
| `products-sync` | `PRODUCTS_SYNC_CRON` (padrão `0 */8 * * *`) | Direto: `fetchAllProductRows` → CSV → SFTP (sem passar pela API) |
| `clients-sync` | `CLIENTS_SYNC_CRON` (padrão `*/30 * * * *`, em :00 e :30) | Direto: delta sync CL+AD Hope → `contactWebhookService.sendContact()` (requer `CLIENTS_SYNC_ENABLED=true`) |
| `clients-sync-resort` | `CLIENTS_SYNC_CRON_RESORT` (fallback `CLIENTS_SYNC_CRON`) | Direto: delta sync CL+AD Resort → `contactWebhookService.sendContact()` (requer `CLIENTS_SYNC_ENABLED_RESORT=true`) |
| `orders-sync` | `ORDERS_SYNC_CRON` (padrão `*/30 * * * *`, em :05 e :35) | POST `/api/background/cron-orders` → Hope + Resort (requer `ORDERS_SYNC_ENABLED=true`) |
| `contacts-retry` | `CONTACTS_RETRY_CRON` (padrão `*/5 * * * *`) | Direto: `contactRetryService.processFailedContacts()` |

> **Ordem de execução importa:** `clients-sync` roda em :00/:30 e `orders-sync` em :05/:35, garantindo 5 minutos de margem para que o contato já exista no Emarsys antes de o pedido ser enviado ao Scarab HAPI. Sem isso, pedidos de clientes novos não seriam atribuídos a nenhum contato.

> O cron de pedidos dispara via HTTP para a própria API (retorna jobId imediatamente, execução em background). Produtos e retry de contatos chamam os serviços diretamente, sem depender da API estar no ar.

## Arquitetura

```
Emarsys-Connector/
├── server.js                   # Servidor Express — rotas, middlewares, webhooks (sem crons)
├── worker.js                   # Processo worker — cron jobs exclusivamente (sem HTTP)
├── scripts/
│   ├── syncProducts.js        # Sync diário Hope (02h) + Resort (03h)
│   └── syncOrders.js          # Sync 30min Hope + Resort (crons independentes)
├── services/
│   ├── vtexProductService.js      # fetchAllProductRows + fetchAllProductRowsResort
│   ├── vtexOrderService.js        # fetchNewOrderRows + fetchNewOrderRowsResort
│   ├── emarsysOrdersApiService.js # Envio CSV binary via OAuth2 para Scarab/HAPI
│   ├── emarsysOAuth2Service.js    # Token OAuth2 com cache e renovação automática
│   ├── contactWebhookService.js   # Webhook de contatos + persistência SQLite
│   ├── contactRetryService.js     # Retry de contatos com backoff exponencial
│   └── ...                        # outros serviços legados
├── helpers/
│   ├── csvHelper.js           # generateCsv(rows, fileName) — products.csv e products_resort.csv
│   └── sftpHelper.js          # uploadToSftp (Hope) + uploadToSftpResort
├── routes/                    # Endpoints REST (produtos, pedidos, contatos, métricas)
├── database/                  # SQLite WAL (contatos)
├── utils/                     # Logger, cron service, métricas, auth
├── data/                      # lastOrderSync.json + lastOrderSyncResort.json, SQLite DB
├── tmp/                       # CSVs gerados localmente
└── logs/                      # Logs rotativos diários
```

---

## Fluxo de Produtos

### Processo completo

Roda via `scripts/syncProducts.js` ou manualmente com `npm run sync:products`.

Ambas as lojas usam a **mesma lógica interna** — apenas com credenciais e destinos diferentes:

| | Hope Lingerie | Hope Resort |
|---|---|---|
| **VTEX** | `hopelingerie.vtexcommercestable.com.br` | `lojahr.vtexcommercestable.com.br` |
| **Arquivo** | `products.csv` | `products_resort.csv` |
| **SFTP user** | `bu_hope` | `hope_resort` |
| **SFTP path** | `/` | `/` |
| **Cron** | diário 02h | diário 03h |

```
PASSO 1 — GetProductAndSkuIds
  Coleta todos os skuIds (ativos + inativos + invisíveis)
  ~188 chamadas paginadas de 50 em 50
  Resultado: ~27.287 skuIds únicos

PASSO 2 — products/search (lotes de 50)
  Busca detalhes dos SKUs visíveis na loja
  Retorna: price, msrp, c_stock, title, link, image, category, available
  ~546 chamadas → ~3.378 SKUs ativos

PASSO 3 — stockkeepingunitbyid (lotes de 25 paralelos)
  SKUs inativos/invisíveis que não retornaram no PASSO 2
  price/msrp/c_stock ficam vazios (produto inativo)
  ~970 lotes → ~24.225 SKUs inativos

PASSO 4 — Deduplicar + gerar CSV
  Ativos têm prioridade em duplicatas
  BOM UTF-8 obrigatório, separador vírgula

PASSO 5 — Upload SFTP
  fastPut com keepalive para arquivos grandes (~16MB)
```

> **Por que incluir inativos:** pedidos históricos de 2 anos cruzam com o catálogo — se o produto não existir no Emarsys, o histórico de compras do cliente fica incompleto e recomendações quebram.

### Colunas do products.csv

Ordem exata obrigatória — não alterar:

| Coluna | Ativos | Inativos |
|---|---|---|
| `item` | itemId numérico | itemId numérico |
| `title` | productName | ProductName |
| `link` | URL completa VTEX | STORE_BASE_URL + DetailUrl |
| `image` | imageUrl | ImageUrl |
| `category` | Ex: `Calcinhas > Biquíni` | Ex: `Calcinhas > Biquíni` |
| `available` | `"true"` ou `"false"` | `"false"` (IsActive) |
| `description` | Texto limpo sem \n | Texto limpo sem \n |
| `price` | Preço de venda | vazio |
| `msrp` | Preço de lista | vazio |
| `group_id` | productId | ProductId |
| `c_stock` | AvailableQuantity | `0` |
| `c_sku_id` | itemId | Id |
| `c_product_id` | productId | ProductId |

### Performance

| Etapa | Chamadas | Tempo |
|---|---|---|
| GetProductAndSkuIds | ~188 | ~1-2 min |
| products/search | ~546 | ~3-5 min |
| stockkeepingunitbyid | ~970 lotes de 25 | ~12-15 min |
| CSV + SFTP | — | ~1 min |
| **Total** | **~1.704** | **~17-23 min** |

### SFTP de Produtos

```env
# Hope
SFTP_PRODUCTS_HOST=exchange.si.emarsys.net
SFTP_PRODUCTS_PORT=22
SFTP_PRODUCTS_USERNAME=bu_hope
SFTP_PRODUCTS_PASSWORD=***
SFTP_PRODUCTS_REMOTE_PATH=/
STORE_BASE_URL=https://www.hopelingerie.com.br

# Hope Resort
RESORT_SFTP_HOST=exchange.si.emarsys.net
RESORT_SFTP_PORT=22
RESORT_SFTP_USER=hope_resort
RESORT_SFTP_PASSWORD=***
RESORT_SFTP_REMOTE_DIR=/
RESORT_STORE_BASE_URL=https://www.lojahr.com.br
```

---

## Fluxo de Pedidos

### Processo completo

Acionado pelo worker a cada 30 minutos via POST interno para `/api/background/cron-orders`. Pode ser rodado manualmente com `npm run sync:orders`.

As duas lojas rodam em **crons independentes** com controle de concorrência separado e persistência via SQLite:

| | Hope Lingerie | Hope Resort |
|---|---|---|
| **VTEX** | `hopelingerie.vtexcommercestable.com.br` | `lojahr.vtexcommercestable.com.br` |
| **Emarsys merchant** | `1789FBAF0A6EF683` | `15232C841F7635A9` |
| **Persistência** | SQLite `orders` table (`isSync=false/true`) | SQLite `orders` table |
| **Cron** | a cada 30min (em :05 e :35) | a cada 30min (em :05 e :35) |

> **Ordem de execução:** `clients-sync` roda em :00/:30, `orders-sync` em :05/:35 — 5 minutos de margem garantem que o contato já exista no Emarsys antes de o pedido ser atribuído.

```
A cada 30 minutos (por loja):

PASSO 1 — GET /api/oms/pvt/orders
  Filtra por f_creationDate=[lastSync TO now]
  Apenas pedidos com status=invoiced (faturados) são processados
  Pagina até esgotar (100 por página)

PASSO 2 — GET /api/oms/pvt/orders/{orderId}
  Detalhe completo do pedido (paymentData, marketingData, items)
  Retry 3x em erro, aguarda 5s em 429

PASSO 3 — Persistir no SQLite + mapear para linhas CSV
  CPF → SHA256 (nunca usar email — vem mascarado pela VTEX)
  1 linha por item do pedido
  Campos extras: s_canal, s_loja, s_tipo_pagamento, s_cupom, f_valor_desconto
  Migration 004 adiciona essas colunas automaticamente no boot

PASSO 4 — Gerar CSV binary e enviar para Scarab/HAPI
  POST via EmarsysOrdersApiService (token estático ou OAuth2)
  Sucesso → marca isSync=true no SQLite
  Em caso de erro → isSync permanece false → reprocessado na próxima execução
```

> **Atenção:** o Emarsys trata `order` como chave única — reenviar o mesmo pedido gera duplicata. O sync não usa overlap nem margem de tempo para evitar isso.

### Colunas do CSV de Pedidos

Ordem exata obrigatória — não alterar:

| Campo | Descrição | Origem VTEX |
|---|---|---|
| `item` | SKU (mesmo do products.csv) — formato `ProductRefId + SkuName` com padding VTEX (ex: `00038800AVL000P`) | `items[n].refId` |
| `price` | Preço unitário (`149.90`) | `items[n].price ÷ 100` |
| `order` | ID do pedido | `orderId` |
| `timestamp` | Data/hora ISO 8601 UTC (`2024-04-01T13:22:00Z`) | `creationDate` |
| `customer` | CPF hasheado SHA-256 (64 hex chars) | `clientProfileData.document` |
| `quantity` | Quantidade — SKUs duplicados no mesmo pedido têm quantities somadas | `items[n].quantity` |
| `s_sales_channel` | Canal de vendas — valor fixo `Online` | fixo |
| `s_store_id` | Hostname da loja | `hostname` |
| `s_canal` | Canal de origem — De/Para: `1`=`Conta Principal`, `4`=`TikTok`, `5`=`APP`, `8`=`Mercado Livre` | `salesChannel` |
| `s_loja` | Hostname da loja | `hostname` |
| `s_tipo_pagamento` | Forma de pagamento | `paymentData.transactions[0].payments[0].paymentSystemName` |
| `s_cupom` | Código do cupom (somente o código, ex: `PROMO10`) | `marketingData.coupon` |
| `f_valor_desconto` | Valor absoluto do desconto em decimal (`75.00`) — vazio se sem desconto. Prefixo `f_` = float no Emarsys | `abs(totals[Discounts].value) ÷ 100` |

### Autenticação

A API Scarab HAPI usa **token estático bearer** (prioridade). OAuth2 é mantido como fallback.

```env
# Hope
EMARSYS_SALES_TOKEN=<bearer_token_hope>
EMARSYS_ORDERS_API_URL=https://admin.scarabresearch.com/hapi/merchant/1789FBAF0A6EF683/sales-data/api
EMARSYS_ORDERS_API_TIMEOUT=60000

# Hope Resort
EMARSYS_SALES_TOKEN_RESORT=<bearer_token_resort>
EMARSYS_ORDERS_API_URL_RESORT=https://admin.scarabresearch.com/hapi/merchant/15232C841F7635A9/sales-data/api
EMARSYS_ORDERS_API_TIMEOUT_RESORT=60000

# OAuth2 (fallback — usado se EMARSYS_SALES_TOKEN não estiver configurado)
EMARSYS_OAUTH2_CLIENT_ID=
EMARSYS_OAUTH2_CLIENT_SECRET=
EMARSYS_OAUTH2_TOKEN_ENDPOINT=https://auth.emarsys.net/oauth2/token
```

### Performance

```
A cada 30 minutos em produção:
  ~5-20 pedidos × detalhe individual = ~2-6s total ✅

Pico (campanha):
  ~200 pedidos × detalhe individual = ~60s — dentro dos 30min ✅
```

---

## Fluxo de Delta Sync de Clientes

### O que é

Complementa o webhook de contatos (que funciona por push). O delta sync roda a cada 30 minutos via cron e busca **apenas os clientes atualizados desde a última execução** no VTEX Master Data — garantindo que nenhuma atualização de perfil passe despercebida mesmo que o webhook de entrada não seja acionado.

### Lojas suportadas

| | Hope Lingerie | Hope Resort |
|---|---|---|
| **VTEX** | `hopelingerie.vtexcommercestable.com.br` | `lojahr.vtexcommercestable.com.br` |
| **Total de clientes na base** | **703.145** | — |
| **Controle de estado** | `data/lastClientSync.json` | `data/lastClientSyncResort.json` |
| **Habilitar** | `CLIENTS_SYNC_ENABLED=true` | `CLIENTS_SYNC_ENABLED_RESORT=true` |
| **Cron** | `CLIENTS_SYNC_CRON` | `CLIENTS_SYNC_CRON_RESORT` (fallback `CLIENTS_SYNC_CRON`) |

As duas lojas rodam de forma **totalmente independente** — controle de estado separado, crons separados, arquivos de controle separados. Falha em uma não afeta a outra.

### Processo completo

```
A cada 30 minutos (por loja):

PASSO 1 — Ler data/lastClientSync[Resort].json
  Se não existe: busca últimos 30 minutos (primeira execução)
  now capturado ANTES das chamadas de API

PASSO 2 — GET /api/dataentities/CL/search
  Filtra: (updatedIn between {lastSync-60min} AND {now}) OR (createdIn between {lastSync-60min} AND {now})
  Overlap de 60 minutos no início para compensar lag de indexação do VTEX Master Data
  Clientes novos têm updatedIn=null e só são capturados pelo filtro de createdIn
  Paginação via REST-Range (50 por página)
  Total lido via header rest-content-range (ex: "resources 1-50/703145")
  Resultado: array de clientes atualizados/criados no intervalo

PASSO 3 — GET /api/dataentities/AD/search (5 em paralelo)
  Filtra: userId={client.id}
  Retorna o primeiro endereço cadastrado
  Se não encontrar: address=null (não bloqueia o envio)
  Lookup paralelo com concorrência 5 — ~5× mais rápido que sequencial

PASSO 4 — Montar payload unificado CL + AD
  customer_id: CPF sem formatação (ou email se não tiver CPF)
  Endereço: street + number + complement concatenados
  country: 24 (fixo — código Emarsys para Brasil)

PASSO 5 — Enviar via contactWebhookService.sendContact()
  Persiste no SQLite (status: pending → sent)
  Retry automático em caso de falha (fila de retry a cada 5min)
  Delay 100ms entre envios

PASSO 6 — Salvar lastClientSync[Resort].json
  Só atualiza se não houve erro geral
  Em erro: reprocessa todo o intervalo na próxima execução
```

### Payload enviado ao webhook

```json
{
  "customer_id": "69873852034",
  "client_type": "hope",
  "email": "cliente@email.com",
  "cpf": "69873852034",
  "first_name": "Maria",
  "last_name": "Silva",
  "phone": "+5511999998888",
  "mobile": null,
  "gender": "F",
  "address": "Rua das Flores, 123",
  "city": "São Paulo",
  "state": "SP",
  "country": 24,
  "postal_code": "01310-100",
  "opt_in": true
}
```

> `customer_id` é o CPF puro (somente dígitos), ou o email se o cliente não tiver CPF cadastrado. `phone` vem do campo `homePhone` do Master Data (número principal), `mobile` vem de `phone` (celular, frequentemente `null`).

### Mapeamento de campos (CL + AD)

| Campo payload | Origem | Observação |
|---|---|---|
| `customer_id` | `CL.document` (CPF) ou `CL.email` | CPF sem formatação; fallback para email |
| `email` | `CL.email` | Lowercase, trim |
| `cpf` | `CL.document` | Somente dígitos |
| `first_name` | `CL.firstName` | — |
| `last_name` | `CL.lastName` | — |
| `phone` | `CL.homePhone` | Número principal no Master Data |
| `mobile` | `CL.phone` | Celular (geralmente `null`) |
| `gender` | `CL.gender` | `male`→`M`, `female`→`F` |
| `address` | `AD.street + AD.number + AD.complement` | Concatenados com `, ` |
| `city` | `AD.city` | — |
| `state` | `AD.state` | — |
| `country` | fixo `24` | Código Emarsys para Brasil |
| `postal_code` | `AD.postalCode` | Como vem do Master Data |
| `opt_in` | `CL.isNewsletterOptIn` | Boolean estrito |

### Controle de estado

Cada loja tem seu próprio arquivo de controle:

```
data/lastClientSync.json        → Hope Lingerie
data/lastClientSyncResort.json  → Hope Resort
```

Conteúdo:

```json
{
  "lastSync": "2026-05-13T14:30:00.000Z",
  "lastCount": 23,
  "updatedAt": "2026-05-13T14:30:08.400Z"
}
```

Em caso de erro geral (ex: VTEX indisponível), o arquivo **não é atualizado** — na próxima execução o intervalo inteiro é reprocessado, garantindo zero perda de dados.

### Estimativa de chamadas por execução

```
Delta típico (30 min): ~20-100 clientes
  → 1-2 chamadas CL (paginação REST-Range)
  → 4-20 lotes AD (5 paralelos por lote, 200ms entre lotes)
  → Total: ~6-22 chamadas — tempo estimado: ~1-5s ✅

Delta pesado (pós-campanha): ~500 clientes
  → 10 chamadas CL
  → 100 lotes AD × 200ms = ~20s
  → Total: ~110 chamadas — dentro do intervalo de 30min ✅
```

### Configuração

```env
# ── Hope Lingerie ──────────────────────────────────────────
# Habilitar o cron de delta sync de clientes Hope
CLIENTS_SYNC_ENABLED=true

# Frequência do cron — roda em :00 e :30 (ANTES do orders-sync em :05 e :35)
CLIENTS_SYNC_CRON=*/30 * * * *

# Credenciais VTEX Hope (mesmas do sync de produtos/pedidos)
VTEX_BASE_URL_HOPE=https://hopelingerie.vtexcommercestable.com.br
VTEX_APP_KEY_HOPE=
VTEX_APP_TOKEN_HOPE=

# ── Hope Resort ────────────────────────────────────────────
# Habilitar o cron de delta sync de clientes Resort
CLIENTS_SYNC_ENABLED_RESORT=true

# Cron exclusivo para Resort (opcional — se vazio usa CLIENTS_SYNC_CRON)
CLIENTS_SYNC_CRON_RESORT=

# Credenciais VTEX Resort
VTEX_BASE_URL_RESORT=https://lojahr.vtexcommercestable.com.br
VTEX_APP_KEY_RESORT=
VTEX_APP_TOKEN_RESORT=

# ── Webhook de destino (compartilhado — client_type distingue as lojas) ───
CONTACTS_WEBHOOK_URL=
CONTACTS_WEBHOOK_CLIENT_TYPE=hope
```

### Arquivos

| Arquivo | Papel |
|---|---|
| `scripts/syncClients.js` | Orquestrador: `runDeltaSync` (Hope) e `runDeltaSyncResort` (Resort) — lê/grava arquivos de controle, aplica overlap 60min, envia via webhook |
| `services/vtexClientService.js` | Factory `createFetcher` compartilhada — busca CL paginado com filtro `updatedIn OR createdIn`, busca AD em 5 paralelos, monta payload unificado |
| `utils/cronService.js` | Jobs `clients-sync` (Hope) e `clients-sync-resort` (Resort) integrados ao `startAll()` do worker |
| `data/lastClientSync.json` | Estado Hope — última execução bem-sucedida |
| `data/lastClientSyncResort.json` | Estado Resort — última execução bem-sucedida |
| `scripts/simulate-clients-sync.js` | Simula delta sync sem enviar ao webhook — `--since 2h`, `--since 30m` ou início do dia |
| `scripts/backfill-clients.js` | Backfill manual: busca clientes de um período e envia ao webhook. Uso: `node scripts/backfill-clients.js --from YYYY-MM-DD --to YYYY-MM-DD` |
| `scripts/export-backfill-clients-csv.js` | Exporta clientes do período backfill (15-19/05/2026) para CSV em `tmp/` sem envio ao webhook |

### Logs esperados

```
[clients-sync:hope]   2026-05-13T14:00:00.000Z → 2026-05-13T14:30:00.000Z  (overlap -60min aplicado)
[clients-sync:hope]   23 clientes → buscando endereços (5 paralelos)...
[clients-sync:hope]   Endereço não encontrado para 5e4dcac9-... (normal)
[clients-sync:hope]   23 payloads para enviar
[clients-sync:hope]   ✓ 23 enviados, 0 erros — 2.1s

[clients-sync:resort] 2026-05-13T14:00:00.000Z → 2026-05-13T14:30:00.000Z
[clients-sync:resort] Nenhum cliente atualizado

[clients-sync:hope]   2026-05-13T14:30:00.000Z → 2026-05-13T15:00:00.000Z
[clients-sync:hope]   Nenhum cliente atualizado
```

### Execução manual

```bash
npm run sync:clients
```

---

## Fluxo de Contatos

### Arquitetura de Webhooks (entrada + saída)

```
VTEX Master Data (cliente criado/atualizado)
  │
  └─ POST https://api.hopeoficial.com.br/api/emarsys/contacts/webhook    ← Webhook de ENTRADA
       │
       ├─ Valida email obrigatório
       ├─ Idempotência (ignora duplicatas em janela de 15s)
       ├─ Persiste no SQLite (status: pending, client_type: hope|resort)
       │
       └─ POST <CONTACTS_WEBHOOK_URL>/sync         ← Webhook de SAÍDA
            │
            ├─ Sucesso → status: sent
            └─ Falha → status: failed
                 │
                 └─ Cron (5min) reprocessa por fila separada
                      ├─ Fila "hope"   → CONTACTS_WEBHOOK_URL_HOPE
                      ├─ Fila "resort" → CONTACTS_WEBHOOK_URL_RESORT
                      ├─ Backoff exponencial: attempts × 2 min
                      ├─ Máx 5 tentativas
                      └─ Excedeu → dead (alerta crítico)
```

### Payload de Entrada (VTEX → conector)

O único campo obrigatório é `email`. Todos os outros são opcionais.

```json
{
  "client_type": "hope",
  "email": "cliente@exemplo.com",
  "cpf": "42570399817",
  "customer_id": "42570399817",
  "first_name": "Wesley",
  "last_name": "Lopes",
  "phone": "+551133334444",
  "mobile": "+5511917127262",
  "gender": "M",
  "address": "Rua X, 123, Ap 45",
  "city": "São Paulo",
  "state": "SP",
  "country": 24,
  "postal_code": "04709-011",
  "opt_in": true
}
```

### Transformação aplicada pelo conector

O conector **não passa o payload direto** — aplica a mesma lógica do delta sync de clientes antes de entregar ao webhook de saída:

| Campo saída | Regra |
|---|---|
| `customer_id` | `cpf` (só dígitos) se disponível; senão `email` — **ignora o `customer_id` recebido** |
| `email` | lowercase + trim |
| `cpf` | somente dígitos (`cleanDocument`) — omitido se vazio |
| `first_name` / `last_name` | passados diretamente — omitidos se vazios |
| `phone` / `mobile` | passados diretamente — omitidos se vazios |
| `gender` | normalizado para `M` ou `F` — omitido se vazio |
| `address` / `city` / `state` / `postal_code` | passados diretamente — omitidos se vazios |
| `country` | sempre `24` (Brasil fixo — código Emarsys) |
| `opt_in` | `true` só se explicitamente verdadeiro; padrão `false`. Aceita `opt_in` ou `optin` |

> **Campos com valor `null` ou ausentes não são enviados** ao webhook de saída — o clients-connector usa Zod com `z.string().min(1).optional()` que rejeita `null`.

### Payload de Saída (conector → webhook Emarsys)

**Cliente completo (com CPF):**

```json
{
  "customer_id": "42570399817",
  "client_type": "hope",
  "email": "cliente@exemplo.com",
  "cpf": "42570399817",
  "first_name": "Wesley",
  "last_name": "Lopes",
  "phone": "+551133334444",
  "mobile": "+5511917127262",
  "gender": "M",
  "address": "Rua X, 123, Ap 45",
  "city": "São Paulo",
  "state": "SP",
  "country": 24,
  "postal_code": "04709-011",
  "opt_in": true
}
```

**Lead (sem CPF):**

```json
{
  "customer_id": "lead@exemplo.com",
  "client_type": "hope",
  "email": "lead@exemplo.com",
  "first_name": "Ana",
  "country": 24,
  "opt_in": false
}
```

### Configuração

```env
CONTACTS_WEBHOOK_URL=https://exemplo.ngrok-free.dev/sync
CONTACTS_WEBHOOK_URL_HOPE=https://hope-webhook.exemplo.com/sync
CONTACTS_WEBHOOK_URL_RESORT=https://resort-webhook.exemplo.com/sync
CONTACTS_WEBHOOK_CLIENT_TYPE=hope
CONTACTS_WEBHOOK_AUTH_HEADER=
CONTACTS_WEBHOOK_TIMEOUT=30000
```

---

## Instalação

### Pré-requisitos

- Node.js >= 22.x (LTS)
- NPM
- PM2 (produção)

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
npm run prod           # inicia api + worker via PM2
pm2 list               # api e worker ambos online
npm run prod:logs      # logs da API
npm run prod:logs:worker  # logs do worker (crons)
```

---

## Scripts

### Produção / Desenvolvimento

| Script | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor Express com nodemon (desenvolvimento) |
| `npm run worker:dev` | Inicia o worker de cron jobs com nodemon (desenvolvimento) |
| `npm run prod` | Inicia api + worker via PM2 (produção) |
| `npm run prod:reload` | Zero-downtime reload de api + worker |
| `npm run prod:restart` | Reinstall + restart de api + worker |
| `npm run prod:stop` | Para os processos PM2 |
| `npm run prod:logs` | Logs da API (PM2) |
| `npm run prod:logs:worker` | Logs do worker/crons (PM2) |
| `npm run prod:status` | Status dos processos PM2 |
| `npm run prod:monit` | Dashboard interativo PM2 |

### Sync Manual

| Script | Descrição |
|---|---|
| `npm run sync:products` | Sync completo de produtos Hope + Resort (VTEX → CSV → SFTP) |
| `npm run sync:orders` | Sync de pedidos Hope + Resort (VTEX OMS → SQLite → Scarab HAPI) |
| `npm run sync:clients` | Delta sync de clientes Hope + Resort (VTEX Master Data → Webhook) |

### Diagnóstico e SQLite

Scripts para inspecionar e corrigir o banco em produção. Não alteram estado externo.

| Script | Descrição |
|---|---|
| `node scripts/db-query.js stats` | Estatísticas do SQLite: total, pendentes, sincronizados |
| `node scripts/db-query.js pending` | Lista pedidos pendentes de sync |
| `node scripts/db-query.js all` | Lista todos os pedidos (limitado) |
| `node scripts/db-clear.js --pending` | Remove apenas pedidos pendentes (`isSync=0`) |
| `node scripts/db-clear.js --all` | Remove todos os registros da tabela |
| `node scripts/db-clear.js --drop` | Remove o arquivo `.db` completamente (recria no próximo boot) |
| `node scripts/generate-csv-from-pending.js` | Gera CSV dos pedidos pendentes no SQLite sem enviar ao Emarsys |
| `node scripts/sample-orders.js` | Busca os 50 pedidos mais recentes da Hope e salva em `tmp/` — sem alterar estado |

### Backfill e Carga Histórica

Scripts de uso pontual para reprocessamento de dados históricos ou recuperação de janelas perdidas.

| Script | Descrição |
|---|---|
| `node scripts/backfill-clients.js --from YYYY-MM-DD --to YYYY-MM-DD` | Reprocessa clientes atualizados/criados no período e envia ao webhook |
| `node scripts/simulate-clients-sync.js` | Simula delta sync do início do dia **sem enviar** ao webhook nem atualizar `lastClientSync.json` |
| `node scripts/simulate-clients-sync.js --since 2h` | Simula delta sync das últimas 2 horas (aceita `2h`, `30m`, etc.) |
| `node scripts/historical-orders-load.js` | Carga histórica de pedidos Hope — dry-run (não envia) |
| `node scripts/historical-orders-load.js --send --from 2024-06 --to 2024-09` | Carga histórica Hope — envia mês a mês para o Scarab HAPI |
| `node scripts/historical-orders-load-resort.js --send --from 2024-05 --to 2026-05` | Carga histórica Resort — envia mês a mês para o Scarab HAPI merchant Resort |

> **Atenção (`historical-orders-load`):** o Emarsys trata `order` como chave única — reenviar o mesmo pedido gera duplicata. Sempre use dry-run primeiro para validar o intervalo antes de `--send`.

### Exportação e Análise Interna

Scripts de extração pontual. Não enviam dados nem alteram estado — apenas geram arquivos em `tmp/`.

| Script | Descrição |
|---|---|
| `node scripts/export-clients-full.js` | Extração full de clientes Hope (CL) → CSV. Divide em fatias semestrais para contornar limite de scroll da VTEX (~700k registros) |
| `node scripts/export-clients-resort-full.js` | Extração full Hope Resort (CL + AD em duas fases) → CSV |
| `node scripts/export-backfill-clients-csv.js` | Exporta clientes do período de backfill para CSV sem envio ao webhook |
| `node scripts/export-orders-with-cpf.js --from YYYY-MM --to YYYY-MM` | Exporta pedidos do período com CPF em texto plano (uso interno/análise) |
| `node scripts/enrich-addresses.js` | Enriquece um CSV de clientes com endereços do VTEX Master Data AD (CL → AD lookup, 10 paralelas) |

### Utilitários

| Script | Descrição |
|---|---|
| `npm run clear-logs` | Limpa todos os arquivos de log em `logs/` |
| `npm run cleanup:exports` | Remove exports antigos de `exports/` |
| `npm run cleanup:exports:dry` | Dry-run: mostra o que seria removido sem deletar |
| `npm run logs` | Tail ao vivo do log combinado do dia |

---

## APIs Principais

### Produtos

| Método | Endpoint | Descrição |
|---|---|---|
| POST/GET | `/api/vtex/products/sync` | Sincroniza produtos (background) |
| GET | `/api/vtex/products/test-sftp` | Testa conectividade SFTP |
| GET | `/api/vtex/products/stats` | Estatísticas dos produtos |

### Pedidos

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/integration/orders-extract-all` | Extrai e processa pedidos |
| GET | `/api/emarsys/sales/sync-status` | Status da sincronização |
| POST | `/api/emarsys/sales/send-unsynced` | Envia pedidos pendentes |
| GET | `/api/emarsys/sales/exports` | Lista CSVs gerados em `exports/` |
| GET | `/api/emarsys/sales/exports/:filename` | Download de CSV específico |
| GET | `/api/emarsys/sales/db-sample` | Diagnóstico: amostra do SQLite com stats de `customer` |
| POST | `/api/emarsys/sales/reset-sync` | Reseta `isSync=0` por período (reenvio) — body: `{ startDate, endDate }` |

### Contatos

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/api/emarsys/contacts/webhook` | Webhook de entrada (VTEX → nós → saída) |
| POST | `/api/emarsys/contacts/create-single` | Cria contato manual |
| POST | `/api/emarsys/contacts/extract-recent` | Extrai contatos recentes da VTEX |

### Monitoramento

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/metrics/dashboard` | Dashboard de métricas |
| GET | `/api/metrics/prometheus` | Métricas Prometheus |
| GET | `/api/metrics/contacts/retry-status` | Status do retry de contatos |
| GET | `/api/alerts/active` | Alertas ativos |
| GET | `/api/cron-management/status` | Status dos cron jobs |

---

## Configuração

### Variáveis de Ambiente Principais

```env
# Server
PORT=3000
NODE_ENV=development
BASE_URL=https://api.hopeoficial.com.br

# VTEX - Hope Lingerie
VTEX_BASE_URL_HOPE=https://hopelingerie.vtexcommercestable.com.br
VTEX_APP_KEY_HOPE=
VTEX_APP_TOKEN_HOPE=
STORE_BASE_URL=https://www.hopelingerie.com.br

# VTEX - Hope Resort
RESORT_VTEX_BASE_URL=https://lojahr.vtexcommercestable.com.br
RESORT_VTEX_APP_KEY=
RESORT_VTEX_APP_TOKEN=
RESORT_STORE_BASE_URL=https://www.lojahr.com.br

# SFTP Produtos - Hope
SFTP_PRODUCTS_HOST=exchange.si.emarsys.net
SFTP_PRODUCTS_PORT=22
SFTP_PRODUCTS_USERNAME=
SFTP_PRODUCTS_PASSWORD=
SFTP_PRODUCTS_REMOTE_PATH=/

# SFTP Produtos - Hope Resort
RESORT_SFTP_HOST=exchange.si.emarsys.net
RESORT_SFTP_PORT=22
RESORT_SFTP_USER=
RESORT_SFTP_PASSWORD=
RESORT_SFTP_REMOTE_DIR=/catalog/

# OAuth2 Pedidos - Hope
EMARSYS_OAUTH2_CLIENT_ID=
EMARSYS_OAUTH2_CLIENT_SECRET=
EMARSYS_OAUTH2_TOKEN_ENDPOINT=https://auth.emarsys.net/oauth2/token
EMARSYS_ORDERS_API_URL=

# OAuth2 Pedidos - Hope Resort
EMARSYS_OAUTH2_CLIENT_ID_RESORT=
EMARSYS_OAUTH2_CLIENT_SECRET_RESORT=
EMARSYS_OAUTH2_TOKEN_ENDPOINT_RESORT=https://auth.emarsys.net/oauth2/token
EMARSYS_ORDERS_API_URL_RESORT=

# Webhook Contatos
CONTACTS_WEBHOOK_URL=
CONTACTS_WEBHOOK_URL_HOPE=
CONTACTS_WEBHOOK_URL_RESORT=

# Database
SQLITE_DB_PATH=./data/orders.db
```

Veja `.env.example` para a lista completa.

---

## Logs

| Arquivo | Conteúdo |
|---|---|
| `ems-pcy-cro-products-{date}.log` | Sync de produtos |
| `ems-pcy-cro-orders-{date}.log` | Sync de pedidos |
| `ems-pcy-cro-clients-{date}.log` | Contatos |
| `ems-pcy-errors-{date}.log` | Erros |
| `ems-pcy-combined-{date}.log` | Todos os logs |

```bash
npm run logs                                              # tail ao vivo
tail -f logs/ems-pcy-errors-$(date +%d-%m-%Y).log       # só erros
npm run clear-logs                                        # limpar tudo
```

---

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

---

Desenvolvido por Lucas Fernandes - Openflow - Tech Lead SAP
