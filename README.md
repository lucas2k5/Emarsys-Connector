# 🚀 Piccadilly Emarsys Connector

Sistema de integração completo entre VTEX e Emarsys para sincronização de produtos, pedidos e contatos.

## 🐛 **MODO DEBUG - LEIA PRIMEIRO**

> **⚠️ IMPORTANTE:** Antes de executar qualquer sincronização, configure `DEBUG=true` no arquivo `.env` para testar a lógica de marcação `isSync=true` sem enviar dados reais para a Emarsys.

### 🎯 **Para que serve o DEBUG:**
- ✅ **Testa marcação `isSync=true`** sem envio real para Emarsys
- ✅ **Evita duplicação** de pedidos na próxima execução
- ✅ **Valida fluxo completo** antes do envio real
- ✅ **Debug de problemas** de sincronização

### 🚀 **Como usar:**
```bash
# 1. Ativar DEBUG
echo "DEBUG=true" >> .env

# 2. Executar sincronização (simula envio)
curl --location 'http://localhost:3000/api/integration/orders-extract-all?brazilianDate=2025-09-23&maxOrders=3&startTime=00:00&endTime=05:00&per_page=100'

# 3. Verificar se pedidos foram marcados
curl http://localhost:3000/api/ems-orders/pending-sync

# 4. Desativar DEBUG para produção
echo "DEBUG=false" >> .env
```

### 📋 **Comportamento:**
- **DEBUG=true**: Gera CSV + Simula envio + Marca `isSync=true` + Deleta `orders.json`
- **DEBUG=false**: Gera CSV + Envia real + Marca `isSync=true` + Deleta `orders.json`

### 📖 **Documentação completa:** [Especificação do Modo DEBUG](docs/debug-mode-specification.md)

---

## 📋 Índice

- [🐛 Modo DEBUG](#-modo-debug---leia-primeiro)
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

# Debug Mode - CRÍTICO: Configure DEBUG=true para testar antes do envio real
DEBUG=false

# VTEX Configuration
VTEX_ACCOUNT_NAME=piccadilly
VTEX_APP_KEY=seu_app_key
VTEX_APP_TOKEN=seu_app_token
VTEX_BASE_URL=https://piccadilly.myvtex.com
VTEX_AUTH_TOKEN=seu_auth_token_aqui

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

# Data Entities
EMS_ORDERS_ENTITY_ID=emsOrdersV2
ENABLE_ORDER_CLEANUP=false
```

### 🐛 Configuração do Modo DEBUG

**IMPORTANTE:** Configure `DEBUG=true` para testar a lógica de marcação `isSync=true` antes de enviar dados reais para a Emarsys.

```env
# Para testes (recomendado)
DEBUG=true

# Para produção (apenas após validar em DEBUG)
DEBUG=false
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

#### 🐛 1. Testar em Modo DEBUG (OBRIGATÓRIO)

**SEMPRE execute em DEBUG primeiro para validar a marcação `isSync=true`:**

```bash
# 1. Ativar modo DEBUG
echo "DEBUG=true" >> .env

# 2. Reiniciar aplicação
npm run dev

# 3. Verificar status DEBUG
curl -X POST http://localhost:3000/api/ems-orders/test-debug-mode

# 4. Listar pedidos pendentes para teste
curl http://localhost:3000/api/ems-orders/pending-for-test

# 5. Executar sincronização em DEBUG (simula envio)
curl --location 'http://localhost:3000/api/integration/orders-extract-all?brazilianDate=2025-09-23&maxOrders=3&startTime=00:00&endTime=05:00&per_page=100'

# 6. Verificar se pedidos foram marcados como isSync=true
curl http://localhost:3000/api/ems-orders/pending-sync

# 7. Desativar DEBUG para produção
echo "DEBUG=false" >> .env
```

#### 2. Verificar Status do Sistema

```bash
# Health check
curl http://localhost:3000/health

# Status das integrações
curl http://localhost:3000/api/integration/test-connections
```

#### 3. Sincronizar Produtos

```bash
# Sincronização manual
curl -X POST http://localhost:3000/api/vtex/products/sync

# Sincronização em background
curl -X POST http://localhost:3000/api/background/sync-products \
  -H "Content-Type: application/json" \
  -d '{"maxProducts": 1000}'
```

#### 4. Sincronizar Pedidos

```bash
# Buscar pedidos dos últimos 7 dias
curl -X POST http://localhost:3000/api/integration/sales-feed \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2025-09-12", "toDate": "2025-09-19"}'
```

#### 5. Processar Contatos

```bash
# Extrair contatos recentes (últimas 6h)
curl -X POST http://localhost:3000/api/emarsys/contacts/extract-recent \
  -H "Content-Type: application/json" \
  -d '{"hours": 6, "useScroll": true}'
```

#### 6. Monitorar Jobs

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

### 🐛 Modo DEBUG

#### `POST /api/ems-orders/test-debug-mode`
Testa o modo DEBUG e executa marcação de pedidos pendentes.

**Resposta DEBUG=true:**
```json
{
  "success": true,
  "message": "Modo DEBUG ativado - Teste de marcação concluído",
  "debugMode": true,
  "testOrders": 3,
  "result": {
    "updated": 3,
    "errors": 0,
    "total": 3
  }
}
```

#### `GET /api/ems-orders/pending-for-test`
Lista pedidos pendentes para teste (primeiros 5).

**Resposta:**
```json
{
  "success": true,
  "message": "5 pedidos pendentes encontrados",
  "totalPending": 15,
  "testOrders": [
    {
      "id": "12345",
      "order": "1563641491289-01",
      "email": "cliente@email.com",
      "isSync": false
    }
  ]
}
```

#### `POST /api/ems-orders/test-edit-single`
Testa edição de um registro específico.

**Body:**
```json
{
  "orderId": "1563641491289-01"
}
```

### Integração Principal

#### `GET /api/integration/orders-extract-all`
Extrai TODOS os pedidos do período com processamento completo (Hook → CSV → Emarsys)

**Parâmetros (opcionais)**:
- `brazilianDate` (string): Data brasileira (YYYY-MM-DD)
- `startDate` (string): Data inicial UTC (ISO)
- `toDate` (string): Data final UTC (ISO)
- `startTime` (string): Horário inicial brasileiro (HH:MM, padrão: 00:00)
- `endTime` (string): Horário final brasileiro (HH:MM, padrão: 23:59)
- `per_page` (number): Pedidos por página (padrão: 100)
- `batching` (boolean): Usar processamento em lotes
- `daysPerBatch` (number): Dias por lote (padrão: 7)

**🆕 Funcionalidade Automática**: Se nenhum parâmetro for fornecido, usa período baseado em `ORDERS_SYNC_CRON`

**Exemplos**:
```bash
# Sem parâmetros (usa período do cron automaticamente)
GET /api/integration/orders-extract-all

# Com data brasileira
GET /api/integration/orders-extract-all?brazilianDate=2025-09-28&startTime=08:00&endTime=18:00

# Com datas UTC
GET /api/integration/orders-extract-all?startDate=2025-09-28T00:00:00.000Z&toDate=2025-09-28T23:59:59.999Z
```

**Configurações de Cron Suportadas**:
- `*/30 * * * *`: A cada 30 minutos (último intervalo até agora)
- `0 */2 * * *`: A cada 2 horas (último intervalo até agora)
- `0 0 * * *`: Diariamente à meia-noite (dia anterior se antes das 6h)
- `0 8 * * *`: Diariamente às 8h (dia anterior se antes das 8h)
- `0 0 * * 1`: Segunda-feira à meia-noite (semana anterior se não for segunda)

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

### Logs Estruturados e Isolados

Sistema de logging aprimorado com logs isolados por módulo e melhor visualização:

#### Logs por Módulo (Isolados)
- `orders-logs-{date}.log`: Logs específicos de sincronização de pedidos
- `product-logs-{date}.log`: Logs específicos de sincronização de produtos  
- `clients-logs-{date}.log`: Logs específicos de sincronização de clientes

#### Logs Gerais do Sistema
- `piccadilly-emarsys-system-{date}.log`: Logs gerais do sistema
- `piccadilly-emarsys-errors-{date}.log`: Apenas erros
- `piccadilly-emarsys-http-{date}.log`: Requisições HTTP
- `piccadilly-emarsys-metrics-{date}.log`: Métricas de performance
- `piccadilly-emarsys-audit-{date}.log`: Auditoria de ações
- `piccadilly-emarsys-sync-{date}.log`: Logs de sincronização
- `piccadilly-emarsys-alerts-{date}.log`: Alertas do sistema

#### Melhorias na Visualização
- **Divisórias visuais**: Cada log é separado por linhas de igual (=) para melhor leitura
- **Timezone São Paulo**: Todos os timestamps no fuso horário de Brasília
- **Contexto detalhado**: Logs incluem informações específicas do módulo
- **Estrutura JSON**: Logs estruturados para análise programática

#### Comandos de Logs

```bash
# Visualizar logs em tempo real
npm run logs

# Limpar todos os logs e dados
npm run clear-logs

# Logs específicos por módulo
tail -f logs/orders-logs-$(date +%Y-%m-%d).log
tail -f logs/product-logs-$(date +%Y-%m-%d).log
tail -f logs/clients-logs-$(date +%Y-%m-%d).log

# Logs de erro
tail -f logs/piccadilly-emarsys-errors-$(date +%Y-%m-%d).log

# Logs HTTP
tail -f logs/piccadilly-emarsys-http-$(date +%Y-%m-%d).log
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
# Limpar todos os logs e dados (NOVO)
npm run clear-logs

# Limpar logs antigos manualmente
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

### Otimizações de Timeout

O sistema foi otimizado para resolver problemas de timeout em produção:

#### Configurações de Timeout Otimizadas
```env
# Timeouts configuráveis (em milissegundos)
PRODUCTS_TIMEOUT_MS=600000    # 10 minutos para produtos
ORDERS_TIMEOUT_MS=900000      # 15 minutos para pedidos
```

#### Melhorias Implementadas
- **Timeouts aumentados**: De 5 minutos para 10-15 minutos conforme o módulo
- **Logs específicos**: Cada módulo tem seus próprios logs para melhor debugging
- **Contexto detalhado**: Logs incluem informações completas sobre timeouts
- **Configuração flexível**: Timeouts configuráveis via variáveis de ambiente

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
