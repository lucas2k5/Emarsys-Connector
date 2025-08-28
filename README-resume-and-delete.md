# Serviços VTEX

Este diretório contém os serviços para integração com a API da VTEX, organizados por responsabilidade específica.

## Estrutura dos Serviços

### VtexProductService (`vtexProductService.js`)
Serviço dedicado para consultas relacionadas a produtos da VTEX.

**Funcionalidades:**
- `getAllProducts()` - Busca todos os produtos
- `skuById(skuId)` - Busca SKU específico por ID
- `searchItem(itemId)` - Busca item específico por ID
- `testConnection()` - Testa conexão com a API de produtos

### VtexOrdersService (`vtexOrdersService.js`)
Serviço dedicado para consultas relacionadas a pedidos da VTEX.

**Funcionalidades:**
- `searchOrders(startDate, toDate, page)` - Busca pedidos por período
- `getRealEmail(obfuscatedEmail)` - Obtém email real a partir do email ofuscado
- `getOrdersFeed()` - Obtém feed de pedidos
- `getOrderById(orderId)` - Obtém detalhes de um pedido específico
- `getAllOrdersInPeriod(startDate, toDate)` - Busca todos os pedidos em um período com paginação automática
- `testConnection()` - Testa conexão com a API de pedidos

### VtexService (`vtexService.js`)
Serviço legado focado em pedidos e integração com Emarsys. Mantido para compatibilidade com código existente.

## Uso no IntegrationService

O `IntegrationService` agora usa os dois novos serviços separados:

```javascript
const VtexProductService = require('./vtexProductService');
const VtexOrdersService = require('./vtexOrdersService');

class IntegrationService {
  constructor() {
    this.vtexProductService = new VtexProductService();
    this.vtexOrdersService = new VtexOrdersService();
    // ... outros serviços
  }
}
```

## Benefícios da Separação

1. **Responsabilidade Única**: Cada serviço tem uma responsabilidade específica
2. **Manutenibilidade**: Mais fácil de manter e debugar
3. **Reutilização**: Serviços podem ser usados independentemente
4. **Testabilidade**: Mais fácil de testar cada funcionalidade separadamente
5. **Escalabilidade**: Permite evolução independente de cada serviço

## Configuração

Ambos os serviços usam as mesmas variáveis de ambiente:
- `VTEX_ENV` - URL base da VTEX
- `VTEX_APP_KEY` - Chave da aplicação VTEX
- `VTEX_APP_TOKEN` - Token da aplicação VTEX
