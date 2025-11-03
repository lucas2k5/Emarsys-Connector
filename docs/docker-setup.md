# Docker Setup Guide - Emarsys Connector

Este guia fornece instruções completas para configurar e executar o Emarsys Connector usando Docker e Docker Compose.

## 📋 Pré-requisitos

- Docker Desktop (Windows/Mac) ou Docker Engine + Docker Compose (Linux)
- Git instalado
- Acesso à internet para baixar imagens

## 🚀 Início Rápido

### 1. Clone o repositório

```bash
git clone <repository-url>
cd piccadilly.emarsys-connector
```

### 2. Configure as variáveis de ambiente

```bash
# Copie o arquivo de exemplo
cp env.example .env

# Edite o arquivo .env com suas credenciais
nano .env  # ou use seu editor preferido
```

**Variáveis essenciais no `.env`:**

```bash
# VTEX API
VTEX_APP_KEY=your-app-key
VTEX_APP_TOKEN=your-app-token
VTEX_BASE_URL=https://your-store.vtexcommercestable.com.br

# Emarsys API
EMARSYS_CLIENT_ID=your-client-id
EMARSYS_CLIENT_SECRET=your-client-secret

# Aplicação
PORT=3000
NODE_ENV=development
```

### 3. Execute com Docker Compose

```bash
# Build e start (primeira vez)
docker-compose up --build

# Ou apenas start (se já foi buildado)
docker-compose up

# Ou execute em background
docker-compose up -d
```

## 📦 Estrutura Docker

### Dockerfile

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
      - sqlite_data:/app/data
    environment:
      NODE_ENV: development
      PORT: 3000
    depends_on:
      - sqlite_db
    command: sh -c "npm install && npm start"

  sqlite_db:
    image: alpine/git
    volumes:
      - sqlite_data:/app/data
    command: "tail -f /dev/null"

volumes:
  sqlite_data:
```

## 🔧 Comandos Docker Compose

### Iniciar serviços

```bash
# Modo interativo (com logs)
docker-compose up

# Modo background
docker-compose up -d

# Com rebuild
docker-compose up --build
```

### Parar serviços

```bash
# Parar sem remover volumes
docker-compose stop

# Parar e remover containers
docker-compose down

# Parar e remover volumes (⚠️ apaga dados SQLite)
docker-compose down -v
```

### Ver logs

```bash
# Todos os serviços
docker-compose logs -f

# Apenas app
docker-compose logs -f app

# Últimas 100 linhas
docker-compose logs --tail=100 -f
```

### Executar comandos no container

```bash
# Acessar shell do container
docker-compose exec app sh

# Executar comando específico
docker-compose exec app node -e "console.log('Hello')"

# Verificar banco SQLite
docker-compose exec app ls -la data/
```

### Rebuild após mudanças

```bash
# Rebuild completo
docker-compose build --no-cache

# Rebuild e restart
docker-compose up --build -d
```

## 💾 Persistência de Dados

### Volumes Docker

Os seguintes volumes são criados para persistência:

- **sqlite_data**: Volume nomeado para o banco de dados SQLite
- **./data**: Diretório local mapeado para dados (backup)
- **./exports**: Arquivos CSV exportados
- **./logs**: Logs da aplicação

### Localização do Banco de Dados

O banco SQLite está localizado em:

- **No container**: `/app/data/orders.db`
- **Volume Docker**: `sqlite_data` (gerenciado pelo Docker)

### Backup do Banco de Dados

```bash
# Copiar banco do container para local
docker-compose exec app cp data/orders.db /tmp/orders.db
docker-compose cp app:/tmp/orders.db ./backup/orders-$(date +%Y%m%d).db

# Ou diretamente do volume
docker run --rm -v piccadilly-emarsys-connector_sqlite_data:/data -v $(pwd):/backup alpine tar czf /backup/sqlite-backup-$(date +%Y%m%d).tar.gz /data
```

### Restaurar Backup

```bash
# Copiar backup para o container
docker-compose cp ./backup/orders-20250124.db app:/app/data/orders.db

# Ou via volume
docker run --rm -v piccadilly-emarsys-connector_sqlite_data:/data -v $(pwd):/backup alpine tar xzf /backup/sqlite-backup-20250124.tar.gz -C /
```

## 🔍 Verificação e Monitoramento

### Verificar status dos containers

```bash
docker-compose ps
```

**Saída esperada:**

```
NAME                COMMAND             STATUS          PORTS
app                 "npm start"         Up 2 minutes    0.0.0.0:3000->3000/tcp
sqlite_db           "tail -f /dev/null" Up 2 minutes
```

### Verificar saúde da aplicação

```bash
# Health check
curl http://localhost:3000/health

# Status dos cron jobs
curl http://localhost:3000/api/cron-management/status
```

### Verificar banco de dados

```bash
# Estatísticas do banco
docker-compose exec app node -e "
const {getDatabase} = require('./database/sqlite');
const db = getDatabase();
db.init().then(() => {
  const stats = db.getStats();
  console.log(JSON.stringify(stats, null, 2));
  db.close();
});
"
```

## 🐛 Troubleshooting

### Container não inicia

```bash
# Ver logs de erro
docker-compose logs app

# Verificar se porta está em uso
netstat -an | grep 3000  # Linux/Mac
netstat -ano | findstr 3000  # Windows
```

### Erro de permissão

```bash
# Ajustar permissões (Linux/Mac)
sudo chown -R $USER:$USER data/ exports/ logs/

# Ou no container
docker-compose exec app chown -R node:node /app/data
```

### Banco de dados não encontrado

```bash
# Verificar se volume existe
docker volume ls | grep sqlite_data

# Criar diretório manualmente
docker-compose exec app mkdir -p /app/data
docker-compose exec app touch /app/data/orders.db
```

### Dependências não instaladas

```bash
# Reinstalar dependências
docker-compose exec app npm install

# Limpar cache e reinstalar
docker-compose exec app npm cache clean --force
docker-compose exec app rm -rf node_modules package-lock.json
docker-compose exec app npm install
```

### Rebuild completo

```bash
# Remover tudo e começar do zero
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

## 📊 Monitoramento de Recursos

### Uso de recursos

```bash
# Estatísticas de uso
docker stats

# Apenas containers do projeto
docker stats $(docker-compose ps -q)
```

### Limpar recursos não utilizados

```bash
# Remover imagens não utilizadas
docker image prune -a

# Remover volumes não utilizados (⚠️ cuidado)
docker volume prune

# Limpeza completa (⚠️ remove tudo não utilizado)
docker system prune -a --volumes
```

## 🔒 Segurança

### Variáveis de ambiente sensíveis

Nunca commite o arquivo `.env` no Git. Ele já está no `.gitignore`.

### Firewall

Em produção, configure firewall para permitir apenas:

- Porta 3000 (aplicação)
- Porta 22 (SSH, se necessário)

### SSL/TLS

Para produção, configure HTTPS usando:

- Nginx como reverse proxy
- Certificados SSL (Let's Encrypt)
- Ou use um load balancer com SSL termination

## 📚 Próximos Passos

- [Orders Sync Service](./orders-sync-service.md)
- [CURL Examples](./curl-examples.md)
- [Server Setup Guide](./server-setup-guide.md)

## 🔗 Links Úteis

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
