# 📊 Sistema de Monitoramento e Métricas - Emarsys Server

Este documento descreve o sistema completo de monitoramento, logging e métricas implementado no Emarsys Server.

## 🚀 Funcionalidades Implementadas

### 1. Sistema de Logging Estruturado
- **Winston Logger** com múltiplos transportes
- **Rotação automática** de arquivos de log
- **Logs categorizados** por tipo (aplicação, erro, HTTP, métricas, auditoria)
- **Formato JSON** para fácil processamento
- **Logs coloridos** no console para desenvolvimento

### 2. Métricas com Prometheus
- **Métricas HTTP** (requisições, duração, erros)
- **Métricas de negócio** (contatos, produtos, vendas)
- **Métricas de integração** (APIs externas)
- **Métricas de sistema** (memória, CPU)
- **Métricas de jobs** (background, cron)

### 3. Sistema de Alertas
- **Alertas automáticos** baseados em thresholds
- **Categorização por severidade** (low, medium, high, critical)
- **Histórico de alertas** com persistência
- **Dashboard visual** para gerenciamento
- **Resolução manual** de alertas

### 4. Dashboards
- **Dashboard de Métricas** - Visualização em tempo real
- **Dashboard de Alertas** - Gerenciamento de alertas
- **Health Check** detalhado do sistema

## 📁 Estrutura de Arquivos

```
utils/
├── logger.js          # Sistema de logging com Winston
├── metrics.js         # Métricas Prometheus
├── monitoring.js      # Middleware de monitoramento
└── alerts.js          # Sistema de alertas

routes/
├── metrics.js         # Rotas de métricas
└── alerts.js          # Rotas de alertas

logs/                  # Diretório de logs (criado automaticamente)
├── application-*.log  # Logs gerais da aplicação
├── error-*.log        # Logs de erro
├── http-*.log         # Logs de requisições HTTP
├── metrics-*.log      # Logs de métricas
└── audit-*.log        # Logs de auditoria

data/
└── alerts.json        # Histórico de alertas
```

## 🔧 Configuração

### Variáveis de Ambiente

Adicione ao seu arquivo `.env`:

```env
# Configuração de Logging
LOG_LEVEL=info                    # Nível de log (error, warn, info, http, debug)
NODE_ENV=production              # Ambiente (development, production)

# Configuração de Alertas (opcional)
ALERT_ERROR_RATE=0.1             # Taxa de erro para alerta (10%)
ALERT_RESPONSE_TIME=5000         # Tempo de resposta para alerta (5s)
ALERT_MEMORY_USAGE=0.9           # Uso de memória para alerta (90%)
ALERT_CONSECUTIVE_ERRORS=5       # Erros consecutivos para alerta
```

## 📊 Endpoints Disponíveis

### Métricas
- `GET /api/metrics/dashboard` - Dashboard visual de métricas
- `GET /api/metrics/prometheus` - Métricas em formato Prometheus
- `GET /api/metrics/json` - Métricas em formato JSON
- `GET /api/metrics/health` - Health check detalhado

### Alertas
- `GET /api/alerts/dashboard` - Dashboard visual de alertas
- `GET /api/alerts/active` - Listar alertas ativos
- `GET /api/alerts/history` - Histórico de alertas
- `GET /api/alerts/stats` - Estatísticas de alertas
- `POST /api/alerts/:id/resolve` - Resolver alerta
- `POST /api/alerts` - Criar alerta manual
- `POST /api/alerts/cleanup` - Limpar alertas antigos

## 🎯 Como Usar

### 1. Acessar Dashboards

**Dashboard de Métricas:**
```
http://localhost:3000/api/metrics/dashboard
```

**Dashboard de Alertas:**
```
http://localhost:3000/api/alerts/dashboard
```

### 2. Integrar Logging em Suas Rotas

```javascript
const { logger, logHelpers } = require('../utils/logger');
const { monitorAsyncOperation } = require('../utils/monitoring');

// Log simples
logger.info('Operação iniciada', { userId: 123 });

// Log de erro
logger.error('Erro na operação', { error: error.message, context: 'user-service' });

// Monitorar operação assíncrona
const result = await monitorAsyncOperation('user-creation', async () => {
  return await createUser(userData);
}, { userId: 123 });
```

### 3. Registrar Métricas Personalizadas

```javascript
const { metricsHelpers } = require('../utils/metrics');

// Registrar contatos processados
metricsHelpers.recordContactsProcessed(100, 'success', 'csv-import');

// Registrar chamada de integração
metricsHelpers.recordIntegrationCall('emarsys', 'contacts', 'success', 1500);

// Registrar job em background
metricsHelpers.recordBackgroundJob('sync-products', 'success', 30000);
```

### 4. Criar Alertas Personalizados

```javascript
const alertManager = require('../utils/alerts');

// Alerta manual
alertManager.registerAlert(
  'custom_alert',
  'high',
  'Algo importante aconteceu',
  { userId: 123, action: 'data-export' }
);

// Verificar métricas e gerar alertas
alertManager.checkMetrics({
  httpRequestErrors: 50,
  httpRequestTotal: 1000,
  memoryUsage: 0.85
});
```

## 📈 Métricas Disponíveis

### Métricas HTTP
- `http_requests_total` - Total de requisições
- `http_request_duration_seconds` - Duração das requisições
- `http_request_errors_total` - Total de erros HTTP

### Métricas de Negócio
- `contacts_processed_total` - Contatos processados
- `contacts_imported_total` - Contatos importados
- `products_synced_total` - Produtos sincronizados
- `sales_processed_total` - Vendas processadas

### Métricas de Integração
- `integration_calls_total` - Chamadas para APIs externas
- `integration_duration_seconds` - Duração das integrações

### Métricas de Sistema
- `memory_usage_bytes` - Uso de memória
- `active_connections` - Conexões ativas

## 🚨 Tipos de Alertas

### Alertas Automáticos
- **Taxa de erro alta** - Quando > 10% das requisições falham
- **Tempo de resposta lento** - Quando > 5 segundos
- **Uso de memória alto** - Quando > 90%
- **Erros consecutivos** - Quando > 5 erros seguidos
- **Espaço em disco baixo** - Quando > 90%

### Severidades
- **Critical** - Requer ação imediata
- **High** - Requer atenção urgente
- **Medium** - Requer atenção em breve
- **Low** - Informativo

## 🔍 Exemplos de Uso

### Monitorar Importação de Contatos

```javascript
const { monitorFileProcessing } = require('../utils/monitoring');

const result = await monitorFileProcessing('contacts', 'contatos.csv', async () => {
  const contacts = await parseCsvFile('contatos.csv');
  const imported = await importContacts(contacts);
  return imported;
}, { source: 'csv-upload' });
```

### Monitorar Integração com Emarsys

```javascript
const { monitorIntegration } = require('../utils/monitoring');

const result = await monitorIntegration('emarsys', 'contacts', async () => {
  return await emarsysApi.createContacts(contacts);
}, { batchSize: contacts.length });
```

## 📋 Logs Estruturados

Todos os logs seguem o formato JSON estruturado:

```json
{
  "timestamp": "2024-01-15 10:30:45",
  "level": "info",
  "message": "HTTP Request",
  "method": "POST",
  "url": "/api/emarsys/contacts",
  "statusCode": 200,
  "responseTime": "150ms",
  "userAgent": "Mozilla/5.0...",
  "ip": "192.168.1.100",
  "requestId": "req_1642245045000_abc123"
}
```

## 🛠️ Manutenção

### Limpeza de Logs
Os logs são rotacionados automaticamente:
- **Tamanho máximo**: 20MB por arquivo
- **Retenção**: 7-30 dias dependendo do tipo
- **Compressão**: Automática para arquivos antigos

### Limpeza de Alertas
```bash
# Limpar alertas com mais de 30 dias
curl -X POST http://localhost:3000/api/alerts/cleanup \
  -H "Content-Type: application/json" \
  -d '{"daysOld": 30}'
```

## 🔧 Troubleshooting

### Problemas Comuns

1. **Logs não aparecem**
   - Verifique se o diretório `logs/` existe
   - Verifique as permissões de escrita
   - Verifique a variável `LOG_LEVEL`

2. **Métricas não atualizam**
   - Verifique se o middleware está configurado
   - Verifique se as rotas estão registradas

3. **Alertas não funcionam**
   - Verifique se o arquivo `data/alerts.json` existe
   - Verifique as permissões de escrita
   - Verifique os thresholds configurados

### Logs de Debug

Para ativar logs de debug:
```env
LOG_LEVEL=debug
```

## 📚 Próximos Passos

1. **Integração com Grafana** - Para dashboards mais avançados
2. **Notificações externas** - Email, Slack, Discord
3. **Métricas customizadas** - Para casos de uso específicos
4. **Análise de tendências** - Para prever problemas
5. **Relatórios automáticos** - Para stakeholders

## 🤝 Suporte

Para dúvidas ou problemas:
1. Verifique os logs em `logs/error-*.log`
2. Consulte o dashboard de alertas
3. Verifique as métricas em tempo real
4. Entre em contato com a equipe de desenvolvimento

---

**Desenvolvido com ❤️ para o Emarsys Server**
