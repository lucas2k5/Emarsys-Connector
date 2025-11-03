# 📁 Estrutura de Logs - Sistema Emarsys Connector

## 🎯 Visão Geral

A estrutura de logs foi reorganizada para ser mais acessível e fácil de navegar. Os nomes dos arquivos agora seguem um padrão simples e intuitivo.

## 📋 Estrutura Atual

### Logs Principais

- `system-DD-MM-YYYY.log` - Logs gerais do sistema
- `errors-DD-MM-YYYY.log` - Logs de erros e falhas
- `http-DD-MM-YYYY.log` - Logs de requisições HTTP
- `sync-DD-MM-YYYY.log` - Logs de sincronização
- `retry-DD-MM-YYYY.log` - Logs de reprocessamento
- `alerts-DD-MM-YYYY.log` - Logs de alertas do sistema

### Logs Especializados

- `metrics-DD-MM-YYYY.log` - Logs de métricas de performance
- `audit-DD-MM-YYYY.log` - Logs de auditoria

### Logs de Negócio (CRO)

- `cro-orders-DD-MM-YYYY.log` - Logs específicos de pedidos
- `cro-products-DD-MM-YYYY.log` - Logs específicos de produtos
- `cro-clients-DD-MM-YYYY.log` - Logs específicos de clientes

## 🔄 Rotação de Logs

- **Padrão de data**: DD-MM-YYYY (ex: 29-09-2025)
- **Tamanho máximo**: 20MB por arquivo (50MB para logs CRO)
- **Retenção**:
  - Sistema/HTTP: 7-14 dias
  - Erros/Alertas: 30 dias
  - Auditoria: 90 dias
  - CRO: 30 dias

## 🛠️ Como Usar

### Logs Gerais

```javascript
const { logger } = require('./utils/logger');

logger.info('Mensagem informativa', { dados: 'extras' });
logger.error('Erro capturado', { erro: 'detalhes' });
```

### Logs Específicos

```javascript
const { ordersLogger, productsLogger, clientsLogger } = require('./utils/logger');

ordersLogger.info('Processando pedido', { orderId: '123' });
productsLogger.info('Atualizando produto', { productId: '456' });
clientsLogger.info('Criando cliente', { clientId: '789' });
```

### Logs de Métricas e Auditoria

```javascript
const { logHelpers } = require('./utils/logger');

logHelpers.logMetric('tempo_resposta', 150, { endpoint: '/api/orders' });
logHelpers.logAudit('usuario_criado', 'admin', { userId: '123' });
```

## 📊 Benefícios da Nova Estrutura

✅ **Nomes mais curtos e intuitivos**
✅ **Fácil navegação e acesso**
✅ **Organização por tipo de operação**
✅ **Rotação automática por data**
✅ **Retenção configurável por tipo**
✅ **Compatibilidade com ferramentas de monitoramento**

## 🔧 Manutenção

### Limpeza de Logs Antigos

```bash
node scripts/cleanup-old-logs.js
```

### Teste da Estrutura

```bash
node scripts/test-new-logging.js
```

## 📈 Monitoramento

Os logs podem ser facilmente integrados com ferramentas como:

- ELK Stack (Elasticsearch, Logstash, Kibana)
- Grafana Loki
- CloudWatch Logs
- Azure Monitor

## 🚀 Migração

A migração dos logs antigos foi automatizada:

- Logs com nomes longos foram removidos
- Nova estrutura implementada sem interrupção
- Compatibilidade mantida com código existente
