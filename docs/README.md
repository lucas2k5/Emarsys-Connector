# Documentação - Emarsys Connector

Bem-vindo à documentação do Emarsys Connector. Esta pasta contém guias detalhados sobre configuração, uso e operação do sistema.

## 📚 Documentos Disponíveis

### 1. [Docker Setup Guide](./docker-setup.md)

Guia completo para configurar e executar o sistema usando Docker e Docker Compose.

**Conteúdo:**

- Instalação e configuração inicial
- Comandos Docker Compose
- Persistência de dados e volumes
- Backup e restauração
- Troubleshooting

### 2. [Orders Sync Service](./orders-sync-service.md)

Documentação técnica do novo serviço de sincronização de pedidos.

**Conteúdo:**

- Visão geral do serviço
- Principais métodos e APIs
- Fluxo de sincronização
- Estrutura de dados
- Integração com rotas
- Troubleshooting

### 3. [CURL Examples](./curl-examples.md)

Exemplos práticos de uso da API via CURL.

**Conteúdo:**

- Nova rota `/cron-orders` (SQLite)
- Rotas de background jobs
- Endpoints de reprocessamento
- Exemplos de requisições e respostas

### 4. [Server Setup Guide](./server-setup-guide.md)

Guia para configuração do servidor Linux em produção.

**Conteúdo:**

- Instalação do Node.js
- Configuração do Nginx
- SSL/TLS
- PM2 para gerenciamento de processos
- Firewall e segurança

### 5. [Logging Structure](./logging-structure.md)

Estrutura e organização dos logs do sistema.

**Conteúdo:**

- Formato dos logs
- Níveis de log
- Localização dos arquivos
- Rotação de logs

### 6. [Releases](./releases.md)

Histórico de releases e versões.

## 🚀 Início Rápido

### Docker (Recomendado)

```bash
# 1. Clone o repositório
git clone <repository-url>
cd hope.emarsys-connector

# 2. Configure variáveis de ambiente
cp env.example .env
# Edite o .env com suas credenciais

# 3. Execute com Docker
docker-compose up --build
```

Ver [Docker Setup Guide](./docker-setup.md) para mais detalhes.

### Execução Manual

```bash
# 1. Instale dependências
npm install

# 2. Configure variáveis de ambiente
cp env.example .env
# Edite o .env com suas credenciais

# 3. Execute a aplicação
npm start
```

## 📖 Exemplos de Uso

### Extração Manual de Pedidos (Nova Rota SQLite)

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

Ver [CURL Examples](./curl-examples.md) para mais exemplos.

## 🔗 Links Rápidos

- **Docker Setup**: [docker-setup.md](./docker-setup.md)
- **Orders Sync Service**: [orders-sync-service.md](./orders-sync-service.md)
- **CURL Examples**: [curl-examples.md](./curl-examples.md)
- **Server Setup**: [server-setup-guide.md](./server-setup-guide.md)
- **Logging**: [logging-structure.md](./logging-structure.md)

## 📝 Notas Importantes

### Nova Arquitetura SQLite

O sistema agora suporta duas arquiteturas:

1. **SQLite (Nova)**: Usa `ordersSyncService` e rota `/cron-orders`

   - Armazenamento local em SQLite
   - Usado pelo cron job
   - Recomendado para produção
2. **VTEX Entity (Original)**: Usa `vtexOrdersService` e rota `/sync-orders`

   - Armazena na entidade VTEX `emsOrdersV2`
   - Mantida para compatibilidade e rollback

### Rotas Disponíveis

| Rota                                    | Serviço              | Uso                             |
| --------------------------------------- | --------------------- | ------------------------------- |
| `/api/background/cron-orders`         | `ordersSyncService` | ✅ Cron e produção            |
| `/api/background/sync-orders`         | `vtexOrdersService` | 🔄 Mantida para compatibilidade |
| `/api/integration/orders-extract-all` | `vtexOrdersService` | 🔄 Mantida para compatibilidade |

## 🆘 Suporte

Para problemas ou dúvidas:

1. Consulte a documentação específica
2. Verifique os logs: `docker-compose logs -f app`
3. Verifique o status: `curl http://localhost:3000/health`
