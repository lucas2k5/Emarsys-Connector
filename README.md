# 🚀 Piccadilly Emarsys Connector

Sistema de integração completo entre VTEX e Emarsys para sincronização de produtos, pedidos e contatos.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Funcionalidades](#funcionalidades)
- [Instalação e Configuração](#instalação-e-configuração)
- [Uso](#uso)
- [APIs e Endpoints](#apis-e-endpoints)
- [Monitoramento e Métricas](#monitoramento-e-métricas)
- [Manutenção e Troubleshooting](#manutenção-e-troubleshooting)
- [Deploy](#deploy)
- [Contribuição](#contribuição)

## 🎯 Visão Geral

O **Piccadilly Emarsys Connector** é uma aplicação Node.js/Express que atua como ponte entre a plataforma de e-commerce VTEX e a plataforma de marketing Emarsys. Ele automatiza a sincronização de dados críticos para operações de marketing e vendas.

### Principais Casos de Uso

1. **Sincronização de Pedidos**: Importa pedidos da VTEX e envia para Emarsys para análise e campanhas
2. **Sincronização de Produtos**: Mantém catálogo de produtos atualizado na Emarsys
3. **Gestão de Contatos**: Importa e gerencia contatos com integração bidirecional
4. **Relatórios de Vendas**: Gera e envia relatórios CSV automatizados
5. **Integração de Clientes**: Sincroniza base de clientes entre sistemas

## 🏗️ Arquitetura

### Estrutura do Projeto

```
piccadilly.emarsys-connector/
├── api/                        # Endpoints para cron jobs e APIs especiais
│   ├── background/            # APIs para jobs em background
│   │   ├── status.js         # Status dos jobs
│   │   └── sync-products.js  # Sincronização de produtos
│   └── cron/                  # Cron jobs da Vercel
├── config/                     # Configurações da aplicação
├── data/                       # Armazenamento local de dados
│   ├── orders.json            # Cache de pedidos
│   ├── products.json          # Cache de produtos
│   ├── sync-stats.json        # Estatísticas de sincronização
│   └── last-sync.json         # Dados da última sincronização
├── exports/                    # Arquivos CSV gerados
├── logs/                       # Logs da aplicação
├── routes/                     # Rotas da API
│   ├── alerts.js              # Sistema de alertas
│   ├── backgroundJobs.js      # Jobs em background
│   ├── cronJobs.js            # Gerenciamento de cron jobs
│   ├── emarsys*.js            # Rotas Emarsys
│   ├── integration.js         # Integração principal
│   ├── metrics.js             # Métricas e monitoramento
│   └── vtexProducts.js        # Produtos VTEX
├── services/                   # Lógica de negócio
│   ├── contactService.js      # Serviço de contatos
│   ├── emarsys*.js            # Serviços Emarsys
│   ├── integrationService.js  # Serviço de integração
│   └── vtex*.js               # Serviços VTEX
├── utils/                      # Utilitários
│   ├── alerts.js              # Sistema de alertas
│   ├── cronService.js         # Gerenciador de cron
│   ├── logger.js              # Sistema de logs
│   ├── metrics.js             # Coleta de métricas
│   └── monitoring.js          # Monitoramento
├── server.js                   # Servidor principal
├── ecosystem.config.js         # Configuração PM2
└── package.json               # Dependências
```

### Componentes Principais

1. **Server (Express)**: API REST principal com middleware de segurança e monitoramento
2. **Services**: Camada de negócio que implementa integrações
3. **Utils**: Ferramentas auxiliares (logs, métricas, alertas)
4. **Routes**: Endpoints organizados por domínio
5. **Background Jobs**: Processamento assíncrono de tarefas pesadas
6. **Cron Jobs**: Automação de sincronizações periódicas

## 🔧 Funcionalidades

### 1. Sincronização de Pedidos (Orders)

- **Importação Automática**: Busca pedidos da VTEX periodicamente
- **Processamento em Lote**: Otimizado para grandes volumes
- **Controle de Duplicatas**: Evita reprocessamento
- **Geração de CSV**: Formato otimizado para Emarsys

### 2. Sincronização de Produtos

- **Catálogo Completo**: Importa todos os produtos ativos
- **Atualização Incremental**: Sincroniza apenas alterações
- **Imagens e Especificações**: Dados completos do produto
- **CSV para SFTP**: Upload automático via SFTP

### 3. Gestão de Contatos

- **Importação em Massa**: Processa milhares de contatos
- **Validação de Dados**: Garante qualidade dos dados
- **Endereços Completos**: Sincroniza dados de endereço
- **Trigger em Tempo Real**: Criação individual via API

### 4. Integração de Vendas

- **Feed de Vendas**: Dados completos de transações
- **Catálogo de Clientes**: Base unificada
- **Relatórios Customizados**: Períodos e filtros flexíveis
- **WebDAV/SFTP**: Múltiplos métodos de envio

### 5. Sistema de Monitoramento

- **Métricas em Tempo Real**: Dashboard interativo
- **Alertas Automáticos**: Notificações de problemas
- **Logs Estruturados**: Rastreamento completo
- **Health Checks**: Monitoramento de disponibilidade

## 📦 Instalação e Configuração

### Pré-requisitos

- Node.js >= 14.x
- NPM ou Yarn
- PM2 (para produção)
- Credenciais VTEX e Emarsys

### Passo 1: Clonar o Repositório

```bash
git clone https://github.com/seu-usuario/piccadilly.emarsys-connector.git
cd piccadilly.emarsys-connector
```

### Passo 2: Instalar Dependências

```bash
npm install
```

### Passo 3: Configurar Variáveis de Ambiente

```bash
cp env.example .env
```

Edite o arquivo `.env` com suas credenciais:

```env
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# VTEX Configuration
VTEX_ACCOUNT_NAME=piccadilly
VTEX_APP_KEY=seu_app_key
VTEX_APP_TOKEN=seu_app_token
VTEX_BASE_URL=https://piccadilly.myvtex.com

# Emarsys Configuration
EMARSYS_USER=seu_usuario
EMARSYS_SECRET=sua_senha
EMARSYS_ENDPOINT=https://api.emarsys.net/api/v2

# SFTP Configuration
SFTP_HOST=191.252.83.193
SFTP_PORT=22
SFTP_USERNAME=openflowpiccadil1
SFTP_PASSWORD=sua_senha_sftp
SFTP_REMOTE_PATH=/home/storage/catalog/catalog.csv.gz

# Monitoring
LOG_LEVEL=info
ALERT_ERROR_RATE=0.1
ALERT_RESPONSE_TIME=5000
```

### Passo 4: Preparar Diretórios

```bash
npm run monitoring:setup
```

### Passo 5: Iniciar a Aplicação

#### Desenvolvimento
```bash
npm run dev
```

#### Produção com PM2
```bash
npm run prod
```

## 🚀 Uso

### Acessando a Aplicação

Após iniciar, a aplicação estará disponível em:

- **API Principal**: http://localhost:3000
- **Health Check**: http://localhost:3000/health
- **Dashboard de Métricas**: http://localhost:3000/api/metrics/dashboard
- **Documentação da API**: Veja seção [APIs e Endpoints](#apis-e-endpoints)

### Fluxo de Trabalho Básico

#### 1. Verificar Status do Sistema

```bash
# Health check
curl http://localhost:3000/health

# Status das integrações
curl http://localhost:3000/api/integration/test-connections
```

#### 2. Sincronizar Produtos

```bash
# Sincronização manual
curl -X POST http://localhost:3000/api/vtex/products/sync

# Sincronização em background
curl -X POST http://localhost:3000/api/background/sync-products \
  -H "Content-Type: application/json" \
  -d '{"maxProducts": 1000}'
```

#### 3. Sincronizar Pedidos

```bash
# Buscar pedidos dos últimos 7 dias
curl -X POST http://localhost:3000/api/integration/sales-feed \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2025-09-12", "toDate": "2025-09-19"}'
```

#### 4. Processar Contatos

```bash
# Extrair contatos recentes (últimas 6h)
curl -X POST http://localhost:3000/api/emarsys/contacts/extract-recent \
  -H "Content-Type: application/json" \
  -d '{"hours": 6, "useScroll": true}'
```

#### 5. Monitorar Jobs

```bash
# Listar jobs em execução
curl http://localhost:3000/api/background/jobs?status=running

# Verificar status de um job específico
curl http://localhost:3000/api/background/status/{jobId}
```

### Automação com Cron Jobs

O sistema possui cron jobs pré-configurados que executam automaticamente:

| Job | Frequência | Descrição |
|-----|------------|-----------|
| Sync Orders Batched | A cada 10 horas | Sincronização combinada |
| Sync Orders | A cada 12 horas | Apenas pedidos |
| Sync Products | A cada 14 horas | Apenas produtos |
| Products CSV | A cada hora | Geração de CSV |

Para gerenciar os cron jobs:

```bash
# Ver status dos cron jobs
curl http://localhost:3000/api/cron-management/status

# Pausar um cron job
curl -X POST http://localhost:3000/api/cron-management/stop/sync-products

# Reiniciar um cron job
curl -X POST http://localhost:3000/api/cron-management/start/sync-products
```

## 📡 APIs e Endpoints

### Integração Principal

#### `POST /api/integration/sales-feed`
Processa feed de vendas completo (VTEX → Emarsys)

**Parâmetros**:
- `twoYears` (boolean): Buscar últimos 2 anos
- `clientsOnly` (boolean): Apenas clientes
- `startDate` (string): Data inicial (YYYY-MM-DD)
- `toDate` (string): Data final (YYYY-MM-DD)

#### `POST /api/integration/client-catalog`
Processa catálogo de clientes

### Produtos VTEX

#### `GET /api/vtex/products`
Lista produtos com paginação

**Query Parameters**:
- `page` (number): Página atual
- `limit` (number): Itens por página
- `search` (string): Termo de busca

#### `POST /api/vtex/products/sync`
Sincroniza produtos da VTEX

**Body**:
```json
{
  "maxProducts": 1000,
  "forceRefresh": false,
  "batchSize": 50
}
```

#### `POST /api/vtex/products/generate-csv`
Gera CSV dos produtos

### Contatos Emarsys

#### `POST /api/emarsys/contacts/extract-recent`
Extrai contatos recentes

**Body**:
```json
{
  "hours": 6,
  "useScroll": true,
  "filename": "contatos-recentes"
}
```

#### `POST /api/emarsys/contacts/create-single`
Cria contato individual

**Body**:
```json
{
  "nome": "João Silva",
  "email": "joao@email.com",
  "phone": "+5511999999999",
  "birth_date": "1990-05-15"
}
```

### Vendas Emarsys

#### `POST /api/emarsys/sales/send-unsynced`
Envia apenas pedidos não sincronizados

#### `GET /api/emarsys/sales/sync-status`
Status da última sincronização

#### `GET /api/emarsys/sales/orders-count`
Contagem de pedidos por status

### Background Jobs

#### `POST /api/background/sync-complete`
Sincronização completa (produtos + pedidos)

**Body**:
```json
{
  "maxProducts": 5000,
  "maxOrders": 10000
}
```

#### `GET /api/background/jobs`
Lista todos os jobs

**Query Parameters**:
- `status`: running, completed, failed
- `type`: sync-products, sync-orders
- `limit`: número máximo de resultados

### Monitoramento

#### `GET /api/metrics/dashboard`
Dashboard visual de métricas

#### `GET /api/metrics/prometheus`
Métricas no formato Prometheus

#### `GET /api/alerts/active`
Lista alertas ativos

#### `POST /api/alerts`
Cria alerta manual

**Body**:
```json
{
  "type": "custom_alert",
  "severity": "high",
  "message": "Descrição do alerta",
  "metadata": {}
}
```

## 📊 Monitoramento e Métricas

### Dashboard de Métricas

Acesse http://localhost:3000/api/metrics/dashboard para visualizar:

- **Requisições HTTP**: Total, erros, latência
- **Contatos**: Processados, importados
- **Produtos**: Sincronizados, atualizados
- **Jobs**: Em execução, concluídos, falhas
- **Sistema**: CPU, memória, uptime

### Prometheus Integration

Para integrar com Prometheus, adicione ao `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'emarsys-connector'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/metrics/prometheus'
```

### Alertas Automáticos

O sistema gera alertas automáticos para:

- Taxa de erro > 10%
- Tempo de resposta > 5 segundos
- Uso de memória > 90%
- 5 erros consecutivos

### Logs Estruturados

Logs organizados por tipo em `./logs/`:

- `application-{date}.log`: Logs gerais
- `error-{date}.log`: Apenas erros
- `http-{date}.log`: Requisições HTTP
- `metrics-{date}.log`: Métricas de performance
- `audit-{date}.log`: Auditoria de ações

Visualizar logs em tempo real:

```bash
# Logs da aplicação
npm run logs:view

# Apenas erros
npm run logs:error

# Logs HTTP
npm run logs:http
```

## 🔧 Manutenção e Troubleshooting

### Problemas Comuns

#### 1. Erro de Conexão com VTEX

**Sintomas**: Timeout ou 401 nas requisições

**Solução**:
1. Verificar credenciais no `.env`
2. Confirmar whitelist de IPs na VTEX
3. Testar com: `curl http://localhost:3000/api/integration/test-connections`

#### 2. Falha na Sincronização de Produtos

**Sintomas**: Jobs falhando ou produtos não aparecendo

**Solução**:
1. Verificar logs: `npm run logs:error`
2. Limpar cache: `rm data/products.json`
3. Sincronizar com limite menor: `{"maxProducts": 100}`

#### 3. Problemas de Memória

**Sintomas**: Aplicação reiniciando ou lenta

**Solução**:
1. Aumentar limite de memória no PM2
2. Ativar otimizações: `npm run prod:optimize`
3. Configurar garbage collection mais agressivo

#### 4. CSV não sendo gerado

**Sintomas**: Arquivos CSV vazios ou ausentes

**Solução**:
1. Verificar permissões do diretório `exports/`
2. Confirmar dados em `data/orders.json`
3. Executar geração manual

### Comandos Úteis de Manutenção

```bash
# Limpar logs antigos
find ./logs -name "*.log" -mtime +30 -delete

# Backup de dados
tar -czf backup-$(date +%Y%m%d).tar.gz data/ exports/

# Reset completo (desenvolvimento)
rm -rf data/*.json exports/*.csv logs/*.log

# Verificar uso de recursos
pm2 monit

# Reiniciar com limpeza de memória
npm run prod:restart:gc
```

### Performance e Otimização

#### Configurações Recomendadas

**Produção com alto volume**:
```env
# Processamento em lotes
ORDERS_MAX_PAGES=50
ORDERS_PAGE_SIZE=100
ORDERS_DELAY_MS=500

# Rate limiting
API_MAX_CONCURRENT=10
API_MIN_TIME=100

# Background jobs
PRODUCTS_BATCH_SIZE=50
PRODUCTS_CONCURRENCY=4
```

**Ambiente limitado**:
```env
# Reduzir consumo
ORDERS_MAX_PAGES=5
ORDERS_PAGE_SIZE=20
PRODUCTS_BATCH_SIZE=10
PRODUCTS_CONCURRENCY=2
```

#### Monitoramento de Performance

1. **Memory Leaks**: Use `npm run test:gc` para verificar
2. **Slow Queries**: Monitore logs de queries > 5s
3. **Rate Limits**: Ajuste baseado nos logs de 429

## 🚀 Deploy

### Deploy Local/VPS com PM2

1. **Configurar PM2**:
```bash
npm install -g pm2
pm2 install pm2-logrotate
```

2. **Iniciar aplicação**:
```bash
npm run prod
pm2 save
pm2 startup
```

3. **Configurar Nginx** (opcional):
```nginx
server {
    listen 80;
    server_name api.suaempresa.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Deploy na Vercel

1. **Conectar repositório** no dashboard Vercel
2. **Configurar variáveis** de ambiente
3. **Deploy automático** em cada push

### Deploy com Docker

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t emarsys-connector .
docker run -p 3000:3000 --env-file .env emarsys-connector
```

## 🤝 Contribuição

### Diretrizes de Contribuição

1. **Fork** o projeto
2. Crie uma **feature branch** (`git checkout -b feature/AmazingFeature`)
3. **Commit** suas mudanças (`git commit -m 'Add: nova funcionalidade'`)
4. **Push** para a branch (`git push origin feature/AmazingFeature`)
5. Abra um **Pull Request**

### Padrões de Código

- **ESLint**: Configuração padrão
- **Commits**: Usar conventional commits
- **Testes**: Adicionar testes para novas features
- **Documentação**: Atualizar README quando necessário

### Estrutura de Commit

```
tipo(escopo): descrição

[corpo opcional]

[rodapé opcional]
```

Tipos: feat, fix, docs, style, refactor, test, chore

### Reportar Bugs

Use as issues do GitHub com:
- Descrição clara do problema
- Passos para reproduzir
- Comportamento esperado vs atual
- Logs relevantes
- Ambiente (OS, Node version, etc)

## 📄 Licença

Este projeto é proprietário e confidencial.

## 📞 Suporte

Para suporte e dúvidas:
- Email: suporte@mptech.com.br
- Documentação: [Wiki do Projeto](https://github.com/seu-repo/wiki)
- Issues: [GitHub Issues](https://github.com/seu-repo/issues)

---

Desenvolvido com ❤️ por MP Consultoria Tech Commerce
