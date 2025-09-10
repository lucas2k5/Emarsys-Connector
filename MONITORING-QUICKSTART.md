# 🚀 Guia Rápido - Sistema de Monitoramento

## ⚡ Instalação Rápida

```bash
# 1. Instalar dependências (executa configuração automática)
npm install

# 2. Iniciar o servidor
npm start

# 3. Acessar dashboards
npm run metrics:view
npm run alerts:view
```

## 📊 Dashboards Disponíveis

| Dashboard | URL | Descrição |
|-----------|-----|-----------|
| **Métricas** | http://localhost:3000/api/metrics/dashboard | Visualização em tempo real das métricas |
| **Alertas** | http://localhost:3000/api/alerts/dashboard | Gerenciamento de alertas |
| **Prometheus** | http://localhost:3000/api/metrics/prometheus | Métricas em formato Prometheus |
| **Health Check** | http://localhost:3000/api/metrics/health | Status detalhado do sistema |

## 🔧 Scripts Úteis

```bash
# Testar sistema de monitoramento
npm run test:monitoring

# Ver logs em tempo real
npm run logs:view        # Logs gerais
npm run logs:error       # Logs de erro
npm run logs:http        # Logs HTTP
npm run logs:metrics     # Logs de métricas
npm run logs:audit       # Logs de auditoria

# Abrir dashboards
npm run metrics:view     # Dashboard de métricas
npm run alerts:view      # Dashboard de alertas

# Configurar sistema
npm run monitoring:setup
```

## 📁 Estrutura de Logs

```
logs/
├── application-YYYY-MM-DD.log  # Logs gerais
├── error-YYYY-MM-DD.log        # Logs de erro
├── http-YYYY-MM-DD.log         # Logs HTTP
├── metrics-YYYY-MM-DD.log      # Logs de métricas
└── audit-YYYY-MM-DD.log        # Logs de auditoria
```

## 🚨 Tipos de Alertas

- **Critical** 🔴 - Requer ação imediata
- **High** 🟠 - Requer atenção urgente  
- **Medium** 🟡 - Requer atenção em breve
- **Low** 🔵 - Informativo

## 📈 Métricas Monitoradas

- **HTTP**: Requisições, duração, erros
- **Negócio**: Contatos, produtos, vendas
- **Integração**: APIs externas
- **Sistema**: Memória, CPU, conexões
- **Jobs**: Background e cron jobs

## 🔍 Exemplo de Uso

```javascript
const { logger, logHelpers } = require('./utils/logger');
const { metricsHelpers } = require('./utils/metrics');

// Log simples
logger.info('Operação iniciada', { userId: 123 });

// Registrar métrica
metricsHelpers.recordContactsProcessed(100, 'success', 'csv-import');

// Log de erro
logHelpers.logError(error, { context: 'user-service' });
```

## 🆘 Troubleshooting

### Problema: Logs não aparecem
```bash
# Verificar se diretório existe
ls -la logs/

# Verificar permissões
chmod 755 logs/
```

### Problema: Métricas não atualizam
```bash
# Verificar se servidor está rodando
curl http://localhost:3000/health

# Verificar métricas
curl http://localhost:3000/api/metrics/json
```

### Problema: Alertas não funcionam
```bash
# Verificar arquivo de alertas
ls -la data/alerts.json

# Verificar permissões
chmod 644 data/alerts.json
```

## 📚 Documentação Completa

Para informações detalhadas, consulte:
- `MONITORING.md` - Documentação completa
- `examples/monitoring-integration.js` - Exemplos de integração

---

**Sistema configurado automaticamente após `npm install`! 🎉**
