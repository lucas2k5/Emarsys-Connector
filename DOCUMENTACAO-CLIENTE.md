### Documento do Sistema — Emarsys Server (v1.3.20)

Este documento apresenta a visão geral, arquitetura, operação e detalhes técnicos do aplicativo de integração Emarsys ↔ VTEX. Foi elaborado para atender públicos técnico e não técnico.


## Visão Geral (não técnico)

- **Objetivo**: Consolidar dados de pedidos e produtos da VTEX e disponibilizá-los na Emarsys de forma confiável e automatizada.
- **Principais entregas**:
  - **Sincronização de Pedidos (Sales Data)** para a Emarsys, com geração de CSV no padrão esperado.
  - **Sincronização de Produtos** e geração de CSV compatível com import da Emarsys, com envio via SFTP.
  - **Automação** via Cron Jobs nativos da Vercel e processamento assíncrono com Inngest.
  - **APIs REST** para operações manuais e monitoramento.
- **Benefícios**:
  - Redução de esforço manual e erros.
  - Fluxos resilientes com retentativas e limitação de taxa.
  - Observabilidade por endpoints de status e logs.


## Sumário executivo (o que está no ar)

- **Tecnologias**: Node.js + Express, Vercel (Serverless), Inngest (background), PM2 (opcional on-prem), Axios, Bottleneck, Helmet, CORS.
- **Integrações**: VTEX (pedidos e produtos), Emarsys (WSSE e OAuth2), SFTP para upload de catálogo.
- **Automação**: Cron Jobs Vercel para sincronizações agendadas (orders, products e CSV de produtos).
- **Status/Health**: `/health`, `/api/cron/status`, `/api/inngest-status`, além de endpoints específicos de background jobs.


## Arquitetura (técnico)

- **Aplicação web**: `Express` exposto via `serverless-http` na Vercel (`/api/index.js`).
- **Serverless Functions dedicadas**:
  - `api/inngest.js`: expõe funções do Inngest.
  - `api/inngest-status.js`: inspeção do cliente e funções Inngest.
  - `api/sales-data-status.js`: status dos arquivos CSV de Sales Data.
  - `api/health.js`: health-check simples.
- **Agendamento**: `vercel.json` define cron jobs nativos que chamam rotas da aplicação.
- **Background/Jobs**: `lib/inngest.js` orquestra jobs de sincronização com controle de concorrência, retentativa e chunking.
- **Persistência de arquivos**:
  - Ambiente Vercel: `/tmp/exports` (ephemeral, por execução). 
  - Ambiente local/servidor: `exports/` e `data/` (criadas em tempo de execução, se necessário).
- **Segurança e robustez**: Helmet, CORS, limites de body, rate limit com Bottleneck, logs detalhados, status endpoints.


## Fluxos principais

- **Pedidos (VTEX → Emarsys Sales Data)**
  1) Busca pedidos na VTEX (paginações e janelas configuráveis).
  2) Armazena JSON localmente (ambientes persistentes) e gera CSV no padrão Emarsys.
  3) Envia para Emarsys (token fixo de Sales Data) e registra status.

- **Produtos (VTEX → CSV Emarsys → SFTP)**
  1) Coleta `productIds` e detalhes (via APIs pública/privada da VTEX), em lotes.
  2) Gera NDJSON por lote para reduzir memória (em local/servidor; no Vercel arquivos podem não persistir entre steps).
  3) Consolida CSV conforme o formato Emarsys e realiza upload via SFTP (quando habilitado).

- **Integrações sob demanda** (`/api/integration/*`)
  - Fluxos "Sales Feed" e "Client Catalog" com parâmetros de data e escopo (2 anos, apenas clientes, etc.).


## Endpoints principais (agrupados)

Observação: Base URL local padrão `http://localhost:3000`.

- **Health**
  - `GET /health`: status do servidor e configurações detectadas.

- **Emarsys (contatos e OAuth2)**
  - `GET /api/emarsys/auth`: gera header X-WSSE a partir do `.env`.
  - `GET /api/emarsys/oauth2`: obtém token OAuth2 e `settings` (ver notas sobre variáveis abaixo).
  - `POST /api/emarsys/contact`: cria/atualiza contato.
  - `GET /api/emarsys/contact/:email`: consulta contato.
  - `PUT /api/emarsys/contact/:email`: atualiza contato por email.

- **Emarsys Sales Data**
  - `GET /api/emarsys/sales/test`: testa conectividade.
  - `POST /api/emarsys/sales/send-unsynced`: envia apenas pedidos não sincronizados.
  - `POST /api/emarsys/sales/send-order/:orderId`: envia pedido específico.
  - `GET /api/emarsys/sales/sync-status`: consulta status da última sincronização.

- **Emarsys CSV (Pedidos)**
  - `POST /api/emarsys/csv/generate`: gera CSV de todos os pedidos.
  - `POST /api/emarsys/csv/generate-unsynced` (deprecated): apenas não sincronizados.
  - `POST /api/emarsys/csv/generate-by-date`: CSV por período.
  - `GET /api/emarsys/csv/validate`: valida dados para o CSV.
  - `GET /api/emarsys/csv/files`: lista arquivos CSV.
  - `GET /api/emarsys/csv/download/:filename`: download de CSV.
  - `GET /api/emarsys/csv/preview/:filename`: preview de N linhas.
  - `DELETE /api/emarsys/csv/files/:filename`: remove arquivo.

- **VTEX Products**
  - `GET /api/vtex/products/test`: teste de conectividade.
  - `GET /api/vtex/products/search-test`: busca de produtos diretamente na API da VTEX.
  - `GET /api/vtex/products/test-private-api`: consulta `productIds` via API privada.
  - `GET /api/vtex/products/test-private-endpoints`: valida endpoints privados.
  - `POST /api/vtex/products/update-product-ids`: atualiza `productIds` locais.
  - `GET /api/vtex/products/product-ids-info`: informações dos `productIds` armazenados.
  - `GET /api/vtex/products/stats`: estatísticas.
  - `GET /api/vtex/products`: listagem paginada a partir de arquivo.
  - `GET /api/vtex/products/:id`: detalhes por id (arquivo).
  - `POST /api/vtex/products/sync` e `GET /api/vtex/products/sync`: inicia sincronização completa de produtos.
  - `POST /api/vtex/products/export`: gera CSV a partir de lista de `productIds` informada no body (opcional upload).
  - `POST /api/vtex/products/generate-csv`: CSV de produtos existentes (arquivo).
  - `GET /api/vtex/products/test-sftp`: teste de conectividade SFTP Emarsys.
  - `POST /api/vtex/products/generate-emarsys-csv`: gera e envia CSV compatível Emarsys (com filtros opcionais).
  - `GET /api/vtex/products/test-csv-format`: CSV de teste (amostra pequena).
  - `GET /api/vtex/products/search`: busca por termo.
  - `GET /api/vtex/products/filter`: filtros por marca/categoria/departamento/ativo.

- **Integração (VTEX → Emarsys)**
  - `GET|POST /api/integration/sales-feed`: executa feed de vendas (opções: `2y`, `cl`, `startDate`, `toDate`).
  - `GET|POST /api/integration/client-catalog`: executa catálogo de clientes (opções de data e escopo).
  - `GET /api/integration/test-connections`: testa VTEX, WebDAV, HAPI.
  - `GET /api/integration/status`: status geral (conexões, uptime, memória, versão).
  - `GET /api/integration/export/:filename`: download de arquivo (requer `Authorization: Bearer 1234`).
  - `GET /api/integration/health`: health check.

- **Background Jobs (Inngest)**
  - `POST /api/background/sync-products`: dispara sincronização de produtos em background.
  - `POST /api/background/sync-orders`: dispara sincronização de pedidos.
  - `POST /api/background/sync-complete`: dispara sincronização completa.
  - `GET /api/background/status/:jobId`: status de um job específico.
  - `GET /api/background/jobs`: lista jobs (filtros por `status`, `type`, `limit`).
  - `DELETE /api/background/jobs/:jobId`: remove job concluído/falho do histórico.
  - `POST /api/background/update-status`: endpoint interno para atualização de status.
  - `GET /api/background/health`: health de background.

- **Cron (Vercel)**
  - `POST /api/cron/sync-orders-batched`: sincronização combinada (orders + produtos).
  - `POST /api/cron/sync-orders`: sincronização de pedidos.
  - `POST /api/cron/sync-products`: sincronização de produtos.
  - `POST /api/cron/products-csv`: geração de CSV de produtos.
  - `GET /api/cron/status`: status e cronograma configurado.

- **Serverless dedicados**
  - `GET /api/health`
  - `GET /api/inngest-status`
  - `ANY /api/inngest` (Inngest serve)
  - `GET /api/sales-data-status`


## Cron Jobs e agendamento (produção)

Definidos em `vercel.json`:

- **sync-orders-batched**: `0 */10 * * *` (a cada 10 horas) → `POST /api/cron/sync-orders-batched`
- **sync-orders**: `0 */12 * * *` (a cada 12 horas) → `POST /api/cron/sync-orders`
- **sync-products**: `0 */14 * * *` (a cada 14 horas) → `POST /api/cron/sync-products`
- **products-csv**: `15 * * * *` (a cada hora, no minuto 15) → `POST /api/cron/products-csv`


## Variáveis de ambiente (essenciais)

- **Servidor**
  - `PORT` (ex.: 3000)
  - `NODE_ENV` (`development` | `production`)

- **VTEX**
  - `VTEX_ACCOUNT_NAME`
  - `VTEX_APP_KEY`
  - `VTEX_APP_TOKEN`

- **Emarsys (Sales Data e Autenticação)**
  - `EMARSYS_SALES_TOKEN`: token fixo para Sales Data API.
  - `EMARSYS_USER` e `EMARSYS_SECRET`: usados para WSSE e (no código atual) também para OAuth2.
  - Alternativos/legado: `EMARSYS_USERNAME`, `EMARSYS_PASSWORD`, `EMARSYS_ENDPOINT`.

- **Inngest / Background** (opcional)
  - `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_ENV`.

- **Rate limiting e batches**
  - `API_MAX_CONCURRENT`, `API_MIN_TIME` (padrão 5/200ms)
  - `PRODUCT_MAX_CONCURRENT`, `PRODUCT_MIN_TIME`
  - `PRODUCTS_BATCH_SIZE` (ex.: 20), `INNGEST_CHUNK_SIZE` (ex.: 50)
  - `PRODUCTS_INTRA_BATCH_CONCURRENCY`, `PRODUCTS_INTER_CHUNK_SLEEP_MS`
  - `SKIP_INLINE_CSV_GENERATION` (true no Vercel para evitar uso de arquivos entre steps)

- **Outros**
  - `ENABLE_EMARSYS_UPLOAD`, `TEST_TOKEN`, `ORDERS_MAX_PAGES`, `ORDERS_PAGE_SIZE`, `ORDERS_DELAY_MS`.
  - `EXPORTS_DIR` (override do diretório de saída; padrão: `exports/` local, `/tmp/exports` no Vercel).

Nota importante sobre OAuth2: o endpoint `/api/emarsys/oauth2` e o `/health` verificam OAuth2. O código utilitário usa `EMARSYS_USER/EMARSYS_SECRET` para gerar OAuth2; alguns trechos/documentos referem-se a `EMARSYS_CLIENT_ID/EMARSYS_CLIENT_SECRET`. Para evitar inconsistências, configure `EMARSYS_USER` e `EMARSYS_SECRET` (e, se desejar, replique para as variáveis `EMARSYS_CLIENT_ID/EMARSYS_CLIENT_SECRET` no painel da Vercel).


## Operação e Deploy

- **Ambiente local (desenvolvimento)**
  - Instalação: `npm install`
  - Executar: `npm run dev`
  - Health: `GET /health`

- **Produção — Vercel (recomendado)**
  - Conectar repositório na Vercel, configurar variáveis e fazer deploy automático.
  - Cron Jobs nativos executarão as rotinas nas janelas definidas.

- **Produção — PM2 (on-prem/servidor próprio)**
  - Iniciar: `npm run pm2:start` ou `pm2 start ecosystem.config.js --env production`
  - Logs/monitor: `npm run pm2:logs` / `npm run pm2:monit`


## Monitoramento e Saúde

- **Endpoints de status**
  - `GET /health`: status geral, ambiente, cron/VTEX info.
  - `GET /api/cron/status`: cronogramas ativos e endpoints.
  - `GET /api/inngest-status`: status do cliente Inngest e funções.
  - `GET /api/vtex/products/stats`: estatísticas de produtos (lidas de arquivo).
  - `GET /api/background/health` e `GET /api/background/status/:jobId`.
  - `GET /api/sales-data-status`: status dos arquivos CSV (Sales Data).

- **Logs**
  - Vercel: Dashboard → Functions → Logs.
  - PM2: `./logs/*.log` conforme `ecosystem.config.js`.


## Segurança

- **Segredos**: manter tokens/credenciais apenas em variáveis de ambiente seguras (Vercel/servidor). Evitar commit em repositório.
- **Acesso a exportações**: `GET /api/integration/export/:filename` exige `Authorization: Bearer 1234` (ajustar para seu token em produção).
- **CORS/Helmet**: habilitados no servidor para reforço básico de segurança.
- **Dados sensíveis**: payloads e CSVs podem conter PII; armazenar/transportar de forma compatível com LGPD.


## Limitações e decisões de design

- **Armazenamento ephemeral no Vercel**: arquivos persistem apenas durante a execução; por isso, a geração de CSV via Inngest é preferencialmente disparada por evento separado (`SKIP_INLINE_CSV_GENERATION=true`).
- **Rate limits de APIs externas**: Bottleneck parametrizável para reduzir erros 429/timeout.
- **Espaço em disco**: salvaguardas para evitar falhas por baixo espaço em `/tmp`.
- **Batching/Chunking**: processamento de produtos em lotes/chunks para respeitar limites de steps/tempo do Inngest.


## Troubleshooting (rápido)

- **Emarsys indisponível/OAuth2 falha**
  - Verifique variáveis `EMARSYS_USER/EMARSYS_SECRET`.
  - Teste `GET /api/emarsys/sales/test` e `GET /api/emarsys/oauth2`.

- **VTEX falha/busca vazia**
  - Valide `VTEX_ACCOUNT_NAME/VTEX_APP_KEY/VTEX_APP_TOKEN`.
  - Cheque `GET /health` e logs.

- **CSV não gerado (Vercel)**
  - Defina `SKIP_INLINE_CSV_GENERATION=true` e use o evento dedicado para gerar CSV.

- **Jobs sem avanço**
  - Consulte `GET /api/background/status/:jobId` e `GET /api/inngest-status`.


## Mapeamentos (resumo)

- **Sales Data (Emarsys)**: inclui `order_id`, `customer_email`, `product_name`, `price`, `quantity`, `order_date`, além de campos opcionais como `customer_name`, `brand`, `revenue`, `shipping_*`, `payment_method`, etc. Moeda `BRL`, idioma `pt-BR`, canal `web`, origem `VTEX`.
- **Produtos (CSV Emarsys)**: colunas como `title`, `item`, `category`, `available`, `description`, `price`, `msrp`, `link`, `image`, `zoom_image`, `group_id`, `c_stock`, `c_ean`, `c_dataLancamento`, `c_tamanho`, entre outras customizadas.


## Glossário

- **VTEX**: plataforma de e-commerce fonte de dados de pedidos e produtos.
- **Emarsys**: plataforma de automação/engajamento que consome dados de clientes, pedidos e catálogo.
- **Inngest**: orquestrador de jobs/eventos em background.
- **Serverless**: execução por função (Vercel) com filesystem ephemeral.


## Referências rápidas

- **Start local**: `npm run dev`
- **Health**: `GET /health`
- **Sincronização manual**:
```bash
# Pedidos (Sales Data)
curl -X POST http://localhost:3000/api/emarsys/sales/send-unsynced

# Produtos (sync + CSV)
curl -X POST http://localhost:3000/api/vtex/products/sync
curl -X POST http://localhost:3000/api/vtex/products/generate-csv
```

---

Contato do time para dúvidas e evolução do escopo disponível no canal de projeto.

## Inngest — o que é, como funciona e custos (resumo)

- **O que é**: Plataforma/ferramenta para orquestrar jobs assíncronos por eventos (event-driven), com retentativas, controle de concorrência e steps.
- **Como funciona (no app)**:
  - **Eventos usados**: `vtex.sync.start` (produtos), `vtex.orders.sync` (pedidos), `vtex.sync.complete` (fluxo completo).
  - **Funções**: definidas em `lib/inngest.js` e expostas via `api/inngest.js`.
  - **Recursos**: retries, `concurrency.limit: 1` por tipo de sync, chunking/batching de produtos, sleeps entre chunks, logs.
  - **Config**: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_ENV`, além de parâmetros de batch em `.env`.
  - **Disparo**: manual (endpoints `/api/background/*`) e indireto via cron (Vercel) ou outros sistemas (eventos).
- **Custos**:
  - O custo prático decorre principalmente de invocações serverless (Vercel) e do plano do Inngest escolhido.
  - O Inngest oferece planos gratuitos e pagos baseados em volume de eventos/execuções e SLAs. Consulte a página oficial de preços do Inngest para valores e limites atuais.
- **Docs**: ver documentação do Inngest para Express/Serverless e modelo de functions/eventos (ex.: client, serve, createFunction).

## Vercel — o que é, como funciona e custos (resumo)

- **O que é**: Plataforma serverless para deploy de apps web/Node com CDN, preview por PR e Cron Jobs nativos.
- **Como funciona (no app)**:
  - Deploy automático a cada push; endpoints expostos como Functions sob `/api/*` (via `serverless-http` e handlers dedicados).
  - **Cron Jobs** definidos em `vercel.json` chamam as rotas `/api/cron/*` nos horários configurados.
  - Armazenamento efêmero em `/tmp` durante cada execução (CSV/NDJSON não persistem entre execuções/steps).
- **Custos (referência, verificar site oficial)**:
  - Plano gratuito (Hobby) para projetos pessoais.
  - Plano Pro (cobrança por usuário/mês) com maiores limites de bandwidth/execuções e recursos de equipe.
  - Enterprise sob contrato (SSO/SAML, SLAs, observabilidade avançada, suporte dedicado).
  - Observação: custos variam com uso (bandwidth, invocações, GB-horas). Verifique a página de preços da Vercel para valores atuais.
- **Docs**: Cron Jobs, Functions (Node), limites de execução e filesystem efêmero.

## Emarsys — documentação oficial e endpoints usados

- **Autenticação**:
  - **WSSE (v2)** para endpoints legados (contatos): cabeçalho `X-WSSE` gerado via `utils/emarsysAuth.js`.
  - **OAuth2** para API v3: token via endpoint de token e uso do header `Authorization: Bearer ...`.
- **Endpoints usados no app**:
  - **Contatos (v2)** — base `https://api.emarsys.net/api/v2`:
    - `POST /contact` (criar/atualizar com `key_id: 3` para email)
    - `GET /contact/email/{email}` (buscar contato por email)
    - `PUT /contact` (atualizar por email com `key_id: 3`)
  - **Sales Data (HAPI)** — envio de CSV (header `Authorization: bearer {token}`, `Content-type: text/csv`):
    - `POST https://api.emarsys.net/api/v2/sales-data` (envio direto) — usado em `emarsysSalesService`
    - `POST /hapi/merchant/{merchantId}/sales-data/api` (variação HAPI) — usado em `emarsysHapiService`
  - **Settings (v3)** — `GET https://api.emarsys.net/api/v3/settings` (requer OAuth2) — usado em `/api/emarsys/oauth2` e `/health`
  - **OAuth2** — `POST https://auth.emarsys.net/oauth2/token` (grant `client_credentials`)
- **Links úteis (documentação oficial)**:
  - Sales Data API (formato/headers, CSV e mapeamentos): [Documentação SAP Emarsys – Sales Data](https://help.sap.com/docs/SAP_EMARSYS/5d44574160f44536b0130abf58cb87cc/fdf5187474c110148fdff2a0cf0e8de0.html)
  - Import de Produtos (estrutura de catálogo): [Documentação SAP Emarsys – Product Import](https://help.sap.com/docs/SAP_EMARSYS/5d44574160f44536b0130abf58cb87cc/fdf6fbc574c11014855de082fd7ded5b.html)
  - API v2 (WSSE, contatos): [Documentação SAP Emarsys – API v2](https://help.sap.com/docs/SAP_EMARSYS/5d44574160f44536b0130abf58cb87cc)
  - OAuth2 e API v3 (settings): [Documentação SAP Emarsys – API v3](https://help.sap.com/docs/SAP_EMARSYS/5d44574160f44536b0130abf58cb87cc)
- **Variáveis relevantes**:
  - `EMARSYS_SALES_TOKEN` (Sales Data), `EMARSYS_USER`/`EMARSYS_SECRET` (WSSE e OAuth2, conforme implementação), `EMARSYS_USERNAME`/`EMARSYS_PASSWORD` (legado), `EMARSYS_HAPI_URL`/`EMARSYS_MERCHANT_ID` (HAPI), `WEBDAV_*` ou SFTP (catálogo).

## Recursos e links

- **Inngest**:
  - Documentação: https://www.inngest.com/docs
  - Preços: https://www.inngest.com/pricing
- **Vercel**:
  - Documentação: https://vercel.com/docs
  - Cron Jobs (docs): https://vercel.com/docs/cron-jobs
  - Preços: https://vercel.com/pricing