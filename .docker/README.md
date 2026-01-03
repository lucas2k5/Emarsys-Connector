# Docker + SQLite Setup

Este projeto foi migrado para usar Docker com SQLite como banco de dados local.

## Estrutura

- **Dockerfile**: Container da aplicação Node.js
- **docker-compose.yml**: Orquestração com volumes persistentes
- **database/sqlite.js**: Serviço de acesso ao SQLite
- **database/migrations/**: Migrations do banco de dados

## Como usar

### 1. Criar arquivo .env

Copie o `env.example` para `.env` e configure as variáveis necessárias:

```bash
cp env.example .env
```

### 2. Build e start com Docker Compose

```bash
docker-compose up --build
```

### 3. Apenas start (sem rebuild)

```bash
docker-compose up
```

### 4. Start em background

```bash
docker-compose up -d
```

### 5. Ver logs

```bash
docker-compose logs -f
```

### 6. Parar containers

```bash
docker-compose down
```

## Volumes

Os seguintes volumes são criados para persistência:

- `./data` - Banco de dados SQLite e arquivos de dados
- `./exports` - Arquivos CSV exportados
- `./logs` - Logs da aplicação

## Banco de Dados SQLite

O banco de dados SQLite está localizado em `./data/orders.db`.

### Estrutura da tabela `orders`

- `id` - ID único do registro
- `order` - ID do pedido (VTEX)
- `item` - ID do item/SKU
- `email` - Email do cliente
- `quantity` - Quantidade
- `price` - Preço
- `timestamp` - Data/hora do pedido
- `isSync` - Status de sincronização (0 = pendente, 1 = sincronizado)
- `order_status` - Status do pedido
- `s_channel_source` - Canal de origem
- `s_store_id` - ID da loja
- `s_sales_channel` - Canal de vendas
- `s_discount` - Desconto aplicado
- `created_at` - Data de criação
- `updated_at` - Data de atualização

## Migrations

As migrations são executadas automaticamente na inicialização da aplicação.

## Verificar status do banco

```bash
docker-compose exec app node -e "const {getDatabase} = require('./database/sqlite'); const db = getDatabase(); db.init().then(() => { console.log(db.getStats()); });"
```

