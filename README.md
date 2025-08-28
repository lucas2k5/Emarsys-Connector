# Emarsys Server

Servidor Express + Node.js para integração com a API da Emarsys e sincronização de pedidos da VTEX.

## 🚀 Cron Jobs da Vercel

Esta aplicação utiliza **cron jobs nativos da Vercel** para sincronização automática:

- **📦 Sincronização Combinada**: A cada 10 horas (`0 */10 * * *`)
- **📦 Pedidos (Orders)**: A cada 12 horas (`0 */12 * * *`)
- **🛍️ Produtos (Products)**: A cada 14 horas (`0 */14 * * *`)
- **📄 CSV de Produtos**: A cada hora, 15 minutos (`15 * * * *`)

Os cron jobs são configurados no arquivo `vercel.json` e executam automaticamente em produção.

## 🚀 Otimizações Implementadas

### 📄 Otimização de Geração de CSV para Emarsys

O `EmarsysSalesService` foi otimizado para evitar duplicação desnecessária na geração de CSV:

#### **Problema Resolvido**
- Anteriormente, `generateEmarsysCsvContent` era chamado duas vezes no mesmo serviço
- Isso causava processamento desnecessário e overhead de memória

#### **Solução Implementada**
1. **Busca Inteligente de Arquivos**: O serviço agora busca automaticamente o último arquivo CSV gerado no diretório `exports`
2. **Fallback Graceful**: Se não encontrar arquivo, gera o CSV inline como antes
3. **Novas Rotas**: Endpoints para envio direto de arquivos CSV

#### **Novos Métodos no EmarsysSalesService**

```javascript
// Busca o último arquivo CSV de orders
const latestFile = await emarsysSalesService.getLatestOrdersCsvFile();

// Envia arquivo CSV específico ou o mais recente
const result = await emarsysSalesService.sendCsvFileToEmarsys('arquivo.csv');

// Carrega conteúdo de arquivo CSV
const content = await emarsysSalesService.loadCsvContent('/path/to/file.csv');
```

#### **Novas Rotas Disponíveis**

```bash
# Envia arquivo CSV específico ou o mais recente
POST /api/emarsys/sales/send-csv-file
Body: { "filename": "opcional-nome-do-arquivo.csv" }

# Obtém informações do último arquivo CSV
GET /api/emarsys/sales/latest-csv
```

#### **Benefícios**
- ✅ **Performance**: Evita regeneração desnecessária de CSV
- ✅ **Eficiência**: Reutiliza arquivos já processados
- ✅ **Flexibilidade**: Permite envio de arquivos específicos
- ✅ **Compatibilidade**: Mantém fallback para geração inline
- ✅ **Rastreabilidade**: Logs indicam a fonte do CSV (arquivo vs inline)

#### **Fluxo Otimizado**
1. **Tenta usar arquivo existente** → Se encontrado, carrega e envia
2. **Fallback para geração inline** → Se arquivo não encontrado ou erro
3. **Logs detalhados** → Indica fonte do CSV e tamanho
4. **Resposta enriquecida** → Inclui informações sobre fonte e tamanho

#### **Exemplos de Uso**

**1. Envio do último arquivo CSV gerado:**
```bash
curl -X POST http://localhost:3000/api/emarsys/sales/send-csv-file
```

**Resposta:**
```json
{
  "success": true,
  "message": "Arquivo CSV enviado para Emarsys",
  "result": {
    "success": true,
    "response": "OK",
    "source": "file",
    "filename": "openflow-piccadilly-orders-data-2025-08-22T04-51-54.csv",
    "csvSize": 11520,
    "fileSize": 11520
  }
}
```

**2. Envio de arquivo CSV específico:**
```bash
curl -X POST http://localhost:3000/api/emarsys/sales/send-csv-file \
  -H "Content-Type: application/json" \
  -d '{"filename": "openflow-piccadilly-orders-data-2025-08-22T04-51-54.csv"}'
```

**3. Consulta do último arquivo CSV:**
```bash
curl http://localhost:3000/api/emarsys/sales/latest-csv
```

**Resposta:**
```json
{
  "success": true,
  "message": "Último arquivo CSV encontrado",
  "file": {
    "filename": "openflow-piccadilly-orders-data-2025-08-22T04-51-54.csv",
    "size": 11520,
    "modified": "2025-08-22T04:51:54.123Z",
    "filePath": "/path/to/exports/openflow-piccadilly-orders-data-2025-08-22T04-51-54.csv"
  }
}
```

#### **Logs de Exemplo**
```
📄 Último arquivo CSV de orders encontrado: openflow-piccadilly-orders-data-2025-08-22T04-51-54.csv
📄 Tamanho: 11520 bytes, Modificado: 2025-08-22T04:51:54.123Z
📄 Usando arquivo CSV existente: openflow-piccadilly-orders-data-2025-08-22T04-51-54.csv
📄 Conteúdo CSV carregado: 11520 caracteres
📤 Enviando arquivo openflow-piccadilly-orders-data-2025-08-22T04-51-54.csv (11520 caracteres) para Emarsys...
```

## Instalação

1. Clone o repositório
2. Instale as dependências:

```bash
npm install
```

3. Configure as variáveis de ambiente:

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas credenciais:

```
# Credenciais WSSE (para API v2)
EMARSYS_USER=seu_usuario_emarsys
EMARSYS_SECRET=sua_senha_emarsys

# Credenciais OAuth2 (para API v3)
EMARSYS_CLIENT_ID=seu_client_id_emarsys
EMARSYS_CLIENT_SECRET=seu_client_secret_emarsys

# VTEX Configuration
VTEX_ORDERS_URL=https://ems--piccadilly.myvtex.com/_v/orders/list

# Configuração do servidor
PORT=3000
NODE_ENV=development
```

## Executando o projeto

### Desenvolvimento

```bash
npm run dev
```

### Produção

#### Opção 1: Node.js direto
```bash
npm start
```

#### Opção 2: PM2 (Recomendado)
```bash
# Instalar PM2 globalmente (se necessário)
npm install -g pm2

# Iniciar com PM2
npm run pm2:start

# Ou usar arquivo de configuração
pm2 start ecosystem.config.js --env production

# Monitorar aplicação
npm run pm2:monit

# Ver logs
npm run pm2:logs

# Configurar para iniciar com o sistema
npm run pm2:startup
npm run pm2:save
```

**Comandos PM2 disponíveis:**
- `npm run pm2:start` - Iniciar aplicação
- `npm run pm2:stop` - Parar aplicação  
- `npm run pm2:restart` - Reiniciar aplicação
- `npm run pm2:logs` - Ver logs
- `npm run pm2:monit` - Monitoramento em tempo real
- `npm run pm2:save` - Salvar configuração atual
- `npm run pm2:startup` - Configurar para iniciar com o sistema

## Endpoints da API

### Health Check

- **GET** `/health` - Verifica se o servidor está funcionando e retorna configurações da Emarsys e status da VTEX

### Emarsys

- **GET** `/api/emarsys/auth` - Gera e retorna o header X-WSSE para teste
- **GET** `/api/emarsys/oauth2` - Gera token OAuth2 e retorna configurações da Emarsys
- **POST** `/api/emarsys/contact` - Cria ou atualiza um contato
- **GET** `/api/emarsys/contact/:email` - Busca um contato por email
- **PUT** `/api/emarsys/contact/:email` - Atualiza um contato existente

### Emarsys Sales Data API

- **GET** `/api/emarsys/sales/test` - Testa a conexão com a API de vendas da Emarsys
- **POST** `/api/emarsys/sales/send-orders` - Envia todos os pedidos salvos para a Emarsys
- **POST** `/api/emarsys/sales/send-unsynced` - Envia apenas pedidos não sincronizados para a Emarsys
- **POST** `/api/emarsys/sales/send-order/:orderId` - Envia um pedido específico para a Emarsys
- **GET** `/api/emarsys/sales/sync-status` - Obtém status da última sincronização com Emarsys
- **GET** `/api/emarsys/sales/orders-count` - Obtém contagem de pedidos sincronizados vs não sincronizados

### Emarsys CSV API

- **POST** `/api/emarsys/csv/generate` - Gera arquivo CSV com todos os pedidos
- **POST** `/api/emarsys/csv/generate-unsynced` - Gera CSV apenas com pedidos não sincronizados
- **POST** `/api/emarsys/csv/generate-by-date` - Gera CSV com pedidos de um período específico
- **GET** `/api/emarsys/csv/validate` - Valida todos os pedidos para geração de CSV
- **GET** `/api/emarsys/csv/files` - Lista todos os arquivos CSV gerados
- **GET** `/api/emarsys/csv/download/:filename` - Faz download de um arquivo CSV
- **GET** `/api/emarsys/csv/preview/:filename` - Mostra preview de um arquivo CSV
- **DELETE** `/api/emarsys/csv/files/:filename` - Remove um arquivo CSV

### VTEX

- **GET** `/api/vtex/orders` - Obtém todos os pedidos salvos localmente
- **GET** `/api/vtex/orders/:page` - Obtém pedidos com paginação
- **GET** `/api/vtex/orders/search` - Busca pedidos por critérios
- **POST** `/api/vtex/orders/generate-csv` - Gera CSV dos pedidos existentes
- **POST** `/api/vtex/sync` - Executa sincronização manual de pedidos (VTEX + Emarsys)
- **GET** `/api/vtex/sync/status` - Obtém status da sincronização e agendador
- **PUT** `/api/vtex/sync/schedule` - Atualiza o cronograma de sincronização
- **POST** `/api/vtex/sync/start` - Inicia o agendador de tarefas
- **POST** `/api/vtex/sync/stop` - Para o agendador de tarefas

### VTEX Products API

- **GET** `/api/vtex/products/test` - Testa conexão com VTEX
- **GET** `/api/vtex/products/stats` - Obtém estatísticas dos produtos
- **GET** `/api/vtex/products` - Lista produtos (com paginação)
- **GET** `/api/vtex/products/:id` - Obtém detalhes de um produto
- **POST** `/api/vtex/products/sync` - Sincroniza produtos da VTEX
- **POST** `/api/vtex/products/generate-csv` - Gera CSV dos produtos existentes
- **GET** `/api/vtex/products/search?q=termo` - Busca produtos por termo
- **GET** `/api/vtex/products/filter` - Filtra produtos por critérios

### Cron Jobs (Vercel)

- **POST** `/api/cron/sync-orders-batched` - Sincronização combinada (a cada 10 horas)
- **POST** `/api/cron/sync-orders` - Sincronização de pedidos (a cada 12 horas)
- **POST** `/api/cron/sync-products` - Sincronização de produtos (a cada 14 horas)
- **POST** `/api/cron/products-csv` - Geração de CSV de produtos (a cada hora, 15 minutos)
- **GET** `/api/cron/status` - Status dos cron jobs do Vercel

#### ⚠️ Importante: Arquitetura Cron + Inngest

O sistema utiliza uma arquitetura híbrida:

1. **Vercel Cron Jobs**: Disparam eventos para o Inngest
2. **Inngest**: Processa os eventos em background com retry e controle de concorrência

**Fluxo de Produtos:**
- Cron `/api/cron/sync-products` → Dispara evento `vtex.sync.start`
- Inngest processa produtos em chunks de 50 lotes
- Gera NDJSON por lote (no Vercel, arquivos não persistem entre steps)
- Dispara evento `vtex.products.csv` para gerar CSV separadamente
- CSV é gerado buscando dados diretamente da VTEX (fallback para Vercel)

#### 🔧 Correção: Problema de Arquivos NDJSON no Vercel

**Problema:** Arquivos NDJSON não persistem entre steps do Inngest no Vercel
**Solução:** 
- `SKIP_INLINE_CSV_GENERATION=true` (padrão)
- Função `generateProductsCsvFromNdjson` busca dados diretamente da VTEX quando NDJSON não é encontrado
- Processamento em chunks menores (20 lotes) para evitar timeout
- Fallback automático para busca direta da VTEX

## Estrutura do Projeto

```
emarsys-server/
├── data/                    # Dados salvos localmente
│   ├── orders.json         # Pedidos da VTEX
│   ├── products.json       # Produtos da VTEX
│   ├── last-sync.json      # Informações da última sincronização VTEX
│   ├── last-product-sync.json # Informações da última sincronização de produtos
│   └── emarsys-sync.json   # Informações da última sincronização Emarsys
├── api/
│   └── cron/               # Cron jobs da Vercel
│       ├── sync-orders.js  # Sincronização automática de pedidos
│       ├── sync-products.js # Sincronização automática de produtos
│       └── test.js         # Teste de configuração
├── utils/
│   ├── emarsysAuth.js      # Utilitário para autenticação WSSE e OAuth2

├── services/
│   ├── emarsysService.js   # Serviço para interação com API Emarsys
│   ├── emarsysSalesService.js # Serviço para API de vendas da Emarsys
│   ├── emarsysCsvService.js # Serviço para geração de CSV da Emarsys
│   ├── vtexService.js      # Serviço para interação com API VTEX (pedidos)
│   └── vtexProductService.js # Serviço para interação com API VTEX (produtos)
├── routes/
│   ├── emarsys.js          # Rotas da API Emarsys
│   ├── emarsysSales.js     # Rotas da API de vendas da Emarsys
│   ├── emarsysCsv.js       # Rotas da API CSV da Emarsys
│   ├── vtex.js             # Rotas da API VTEX (pedidos)
│   └── vtexProducts.js     # Rotas da API VTEX (produtos)
├── test-example.js         # Script de teste para Emarsys
├── test-manual.js          # Script de teste para VTEX
├── test-emarsys-sales.js   # Script de teste para API de vendas
├── test-vtex-products.js   # Script de teste para produtos VTEX
├── server.js               # Servidor principal
├── package.json
└── README.md
```

## Mapeamento de campos (Emarsys)

A API mapeia os campos da seguinte forma:

- `firstName` → Campo 1 (Primeiro nome)
- `lastName` → Campo 2 (Sobrenome)
- `email` → Campo 3 (Email - chave primária)

Outros campos podem ser enviados diretamente no payload.

## Mapeamento de campos (Emarsys Sales Data API)

Os pedidos da VTEX são mapeados para a API de vendas da Emarsys conforme a [documentação oficial](https://help.sap.com/docs/SAP_EMARSYS/5d44574160f44536b0130abf58cb87cc/fdf5187474c110148fdff2a0cf0e8de0.html):

### Formato da Requisição

```json
{
  "sales_data": [
    {
      "order_id": "string",
      "customer_email": "string", 
      "product_name": "string",
      "price": "number",
      "quantity": "number",
      "order_date": "string"
    }
  ]
}
```

### Mapeamento Completo

```javascript
{
  // Campos obrigatórios conforme documentação oficial
  order_id: order.order,                    // ID do pedido
  customer_email: order.customer_email,     // Email do cliente
  product_name: order.item,                 // Nome do produto
  price: parseFloat(order.price),           // Preço
  quantity: parseInt(order.quantity),       // Quantidade
  order_date: order.timestamp,              // Data do pedido
  
  // Campos opcionais mas recomendados
  customer_name: order.customer_name,       // Nome do cliente
  customer_phone: order.customer_phone,     // Telefone do cliente
  category: order.category,                 // Categoria
  brand: order.brand,                       // Marca
  revenue: parseFloat(order.revenue),       // Receita
  shipping_country: order.shipping_country, // País de entrega
  shipping_state: order.shipping_state,     // Estado de entrega
  shipping_city: order.shipping_city,       // Cidade de entrega
  order_status: order.order_status,         // Status do pedido
  payment_method: order.payment_method,     // Método de pagamento
  
  // Campos específicos da Emarsys
  currency: 'BRL',                          // Moeda (BRL para Brasil)
  language: 'pt-BR',                        // Idioma
  channel: 'web',                           // Canal de venda
  source: 'VTEX',                           // Origem dos dados
  created_at: new Date().toISOString()      // Timestamp de criação
}
```

## Mapeamento de campos (Produtos VTEX)

Os produtos da VTEX são mapeados para CSV com os seguintes campos:

### Estrutura do Produto

```javascript
{
  id: product.ProductId,                    // ID do produto
  name: product.Name,                       // Nome do produto
  description: product.Description,         // Descrição
  brand: product.BrandName,                 // Marca
  category: product.CategoryName,           // Categoria
  department: product.DepartmentName,       // Departamento
  active: product.IsActive,                 // Status ativo
  created_at: product.CreationDate,         // Data de criação
  updated_at: product.LastModified,         // Data de modificação
  skus: product.Skus,                       // Lista de SKUs
  specifications: product.Specifications,   // Especificações
  images: product.Images                    // Imagens
}
```

### Formato CSV de Produtos

```csv
product_id,product_name,description,brand,category,department,active,created_at,updated_at,sku_count,image_count
12345,Produto Exemplo,Descrição do produto,Marca A,Categoria B,Departamento C,Sim,2024-01-01T00:00:00Z,2024-01-01T00:00:00Z,5,3
```

### Autenticação

A API usa autenticação WSSE com header `X-WSSE` contendo:

- Username
- PasswordDigest (SHA1)
- Nonce
- Created timestamp

## Schema dos pedidos (VTEX)

Os pedidos seguem o seguinte schema:

```json
{
  "order": "string",           // Order ID
  "timestamp": "date-time",    // Order timestamp
  "item": "string",            // Item ID (RefId)
  "price": "string",           // Price
  "quantity": "number",        // Quantity
  "customer": "string",        // Customer ID
  "category": "string",        // Category
  "brand": "string",           // Brand
  "revenue": "string",         // Revenue
  "customer_email": "string",  // Customer Email
  "customer_name": "string",   // Customer Name
  "customer_phone": "string",  // Customer Phone
  "shipping_country": "string", // Shipping Country
  "shipping_state": "string",  // Shipping State
  "shipping_city": "string",   // Shipping City
  "order_status": "string",    // Order Status
  "payment_method": "string",  // Payment Method
  "isSync": "boolean"          // Synchronized
}
```

## Autenticação

O servidor suporta dois métodos de autenticação:

### 1. WSSE (API v2)

- Usado para operações de contatos e dados de vendas
- Requer `EMARSYS_USER` e `EMARSYS_SECRET`

### 2. OAuth2 (API v3)

- Usado para buscar configurações e metadados
- Requer `EMARSYS_CLIENT_ID` e `EMARSYS_CLIENT_SECRET`

## Sincronização VTEX + Emarsys

### Fluxo Completo

1. **Busca de Pedidos**: O sistema busca pedidos da API da VTEX
2. **Armazenamento Local**: Os pedidos são salvos em arquivo JSON local
3. **Geração de CSV**: Logo após o JSON, é gerado um arquivo CSV no formato Emarsys
4. **Envio para Emarsys**: Os pedidos são enviados para a API de vendas da Emarsys
5. **Controle de Sincronização**: Apenas pedidos não sincronizados são enviados

### Cronograma

O sistema usa cron para agendar sincronizações automáticas. Exemplos de cronogramas:

- `*/10 * * * *` - A cada 10 minutos (padrão)
- `0 * * * *` - A cada hora
- `0 */6 * * *` - A cada 6 horas
- `0 0 * * *` - Uma vez por dia à meia-noite
- `0 0 * * 0` - Uma vez por semana (domingo)

### Controle de Sincronização

- **Campo `isSync`**: Controla se o pedido já foi enviado para Emarsys
- **Envio Inteligente**: Apenas pedidos com `isSync: false` são enviados
- **Lotes**: Os pedidos são enviados em lotes de 50 conforme recomendação da Emarsys
- **Formato Correto**: Dados enviados no formato oficial da API com estrutura `sales_data`
- **Autenticação WSSE**: Cada requisição usa header WSSE atualizado
- **Retry**: Em caso de falha, o sistema registra o erro para análise
- **Geração Automática de CSV**: Arquivo CSV é gerado automaticamente após processamento JSON
- **Remoção de Duplicatas**: Duplicatas são automaticamente removidas antes da geração do CSV
- **Nomenclatura Padronizada**: Arquivos CSV seguem o padrão `openflow-piccadilly-orders-data-hora`

## Scripts de Teste

### Teste da VTEX

```bash
node test-manual.js
```

### Teste da Emarsys

```bash
node test-example.js
```

### Teste da API de Vendas da Emarsys

```bash
node test-emarsys-sales.js
```

### Teste do Formato Correto da API da Emarsys

```bash
node test-emarsys-sales-format.js
```

### Teste da Geração de CSV da Emarsys

```bash
node test-emarsys-csv.js
```

### Teste da Integração CSV no Fluxo VTEX

```bash
node test-integration-csv.js
```

### Teste da Remoção de Duplicatas no CSV

```bash
node test-csv-deduplication.js
```

### Teste da Nomenclatura dos Arquivos CSV

```bash
node test-csv-naming.js
```

## Exemplos de Uso

### Sincronização Manual Completa

```bash
curl -X POST http://localhost:3000/api/vtex/sync
```

### Envio de Pedidos para Emarsys

```bash
curl -X POST http://localhost:3000/api/emarsys/sales/send-unsynced
```

### Geração de CSV para Emarsys

```bash
# Gerar CSV com todos os pedidos
curl -X POST http://localhost:3000/api/emarsys/csv/generate

# Gerar CSV apenas com pedidos não sincronizados
curl -X POST http://localhost:3000/api/emarsys/csv/generate-unsynced

# Gerar CSV por período
curl -X POST http://localhost:3000/api/emarsys/csv/generate-by-date \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2025-01-01", "endDate": "2025-01-31"}'

# Gerar CSV dos pedidos VTEX existentes
curl -X POST http://localhost:3000/api/vtex/orders/generate-csv
```

### Verificar Status

```bash
curl http://localhost:3000/api/vtex/sync/status
curl http://localhost:3000/api/emarsys/sales/sync-status
```

### Testar Conexão com Emarsys

```bash
curl http://localhost:3000/api/emarsys/sales/test
```

## Nomenclatura dos Arquivos CSV

### Padrão de Nomenclatura

Todos os arquivos CSV gerados seguem o padrão padronizado:

- **CSV de Pedidos**: `openflow-piccadilly-orders-data-YYYY-MM-DDTHH-MM-SS.csv`
- **CSV de Produtos**: `openflow-piccadilly-products-data-YYYY-MM-DDTHH-MM-SS.csv`
- **CSV Não Sincronizados**: `openflow-piccadilly-unsynced-orders-YYYY-MM-DDTHH-MM-SS.csv`
- **CSV por Período**: `openflow-piccadilly-orders-YYYY-MM-DD-to-YYYY-MM-DD.csv`

### Exemplos de Nomes de Arquivo

```
openflow-piccadilly-orders-data-2025-01-15T14-30-00.csv
openflow-piccadilly-products-data-2025-01-15T14-30-00.csv
openflow-piccadilly-unsynced-orders-2025-01-15T14-30-00.csv
openflow-piccadilly-orders-2025-01-01-to-2025-01-31.csv
```

### Localização dos Arquivos

Os arquivos CSV são salvos no diretório `exports/` na raiz do projeto.

## Monitoramento

### Logs do Sistema

O sistema gera logs detalhados para monitoramento:

- ✅ Sincronização bem-sucedida
- ❌ Erros de sincronização
- 📤 Envio de pedidos para Emarsys
- 🔄 Processamento de lotes
- ⏳ Pausas entre requisições

### Arquivos de Controle

- `data/orders.json` - Pedidos da VTEX
- `data/products.json` - Produtos da VTEX
- `data/last-sync.json` - Status da última sincronização VTEX
- `data/last-product-sync.json` - Status da última sincronização de produtos
- `data/emarsys-sync.json` - Histórico de sincronizações com Emarsys

## Troubleshooting

### Erro de Conexão com Emarsys

1. Verifique as credenciais no arquivo `.env`
2. Teste a conexão: `GET /api/emarsys/sales/test`
3. Verifique se a URL da API está correta

### Erro de Sincronização VTEX

1. Verifique se a URL da VTEX está acessível
2. Teste a conexão: `GET /health`
3. Verifique os logs do servidor

### Pedidos Não Sincronizados

1. Verifique o campo `isSync` nos pedidos
2. Use `GET /api/emarsys/sales/orders-count` para verificar contagens
3. Force o envio: `POST /api/emarsys/sales/send-orders`

## Gerenciamento com PM2

### Instalação e Configuração

O PM2 é um gerenciador de processos para Node.js que mantém a aplicação sempre rodando:

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Ou instalar localmente
npm install pm2
```

### Configuração

O arquivo `ecosystem.config.js` contém a configuração do PM2:

- **Auto-restart**: Aplicação reinicia automaticamente em caso de crash
- **Logs**: Logs organizados em `./logs/`
- **Monitoramento**: Limite de memória de 1GB
- **Reinício diário**: Todos os dias às 2h da manhã
- **Máximo de reinícios**: 10 tentativas

### Comandos Principais

```bash
# Iniciar aplicação
npm run pm2:start

# Parar aplicação
npm run pm2:stop

# Reiniciar aplicação
npm run pm2:restart

# Ver logs em tempo real
npm run pm2:logs

# Monitoramento visual
npm run pm2:monit

# Salvar configuração atual
npm run pm2:save

# Configurar para iniciar com o sistema
npm run pm2:startup
```

### Monitoramento

```bash
# Ver status de todas as aplicações
pm2 status

# Ver logs específicos
pm2 logs emarsys-server

# Monitoramento em tempo real
pm2 monit

# Ver informações detalhadas
pm2 show emarsys-server
```

### Logs

Os logs são salvos em:
- `./logs/err.log` - Logs de erro
- `./logs/out.log` - Logs de saída
- `./logs/combined.log` - Logs combinados

### Vantagens do PM2

✅ **Auto-restart** em caso de crash  
✅ **Monitoramento** em tempo real  
✅ **Logs organizados** e persistentes  
✅ **Zero-downtime** deployments  
✅ **Cluster mode** para múltiplas instâncias  
✅ **Inicialização automática** com o sistema  

## Deploy na Vercel

### Configuração Automática

1. **Conecte seu repositório** à Vercel
2. **Configure as variáveis de ambiente** no dashboard da Vercel:
   ```env
   ENABLE_EMARSYS_UPLOAD=true
   VTEX_ACCOUNT_NAME=seu_account_name
   VTEX_APP_KEY=seu_app_key
   VTEX_APP_TOKEN=seu_app_token
   EMARSYS_USERNAME=seu_username
   EMARSYS_PASSWORD=seu_password
   TEST_TOKEN=seu_token_de_teste_aqui
   ```
3. **Deploy automático** - a Vercel fará deploy a cada push
4. **Verificar cron jobs** - acesse o dashboard da Vercel para ver os logs

### Cron Jobs

Os cron jobs são configurados automaticamente no `vercel.json`:

- **Pedidos**: `/api/cron/sync-orders` - a cada 6 horas
- **Produtos**: `/api/cron/sync-products` - a cada 12 horas

### Monitoramento

- **Logs**: Vercel Dashboard → Projeto → Functions → Logs
- **Health Check**: `GET /health`
- **Teste**: `GET /api/cron/test`

## Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request
