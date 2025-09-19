# 🧠 Otimizações de Memória - VPS 8GB

## 📋 Resumo do Problema

A aplicação estava consumindo mais memória do que a VPS de 8GB podia suportar durante a extração de produtos, causando:
- ❌ Falha na geração de planilhas CSV
- ❌ Falha no upload para FTP/SFTP
- ❌ Aplicação funcionando apenas em máquinas com 32GB de RAM

## 🔧 Soluções Implementadas

### 1. **Configurações de Memória Node.js**

#### `package.json`
```json
{
  "scripts": {
    "start": "node --expose-gc --max-old-space-size=6144 server.js",
    "dev": "nodemon --expose-gc --max-old-space-size=6144 server.js"
  }
}
```

#### `ecosystem.config.js` (PM2)
```javascript
{
  max_memory_restart: '6G',
  env: {
    NODE_OPTIONS: '--max-old-space-size=6144'
  }
}
```

### 2. **Otimização do Processamento de Produtos**

#### Antes (Problemático):
- ✗ Batches de 20 produtos simultâneos
- ✗ Sem controle de garbage collection
- ✗ Todos os produtos carregados na memória

#### Depois (Otimizado):
```javascript
// Batches menores para VPS
const batchSize = 5; // Reduzido de 20 para 5

// Garbage collection automático
if (i > 0 && i % (batchSize * 10) === 0) {
  this.memoryOptimizer.optimizeBatchProcessing(
    Math.floor(i/batchSize), 
    Math.ceil(productIds.length/batchSize), 
    10
  );
}

// Delay maior entre requisições
await new Promise(resolve => setTimeout(resolve, 50)); // Aumentado de 25ms
```

### 3. **Otimização da Geração de CSV**

#### Processamento em Lotes:
```javascript
// Processa produtos em lotes de 50
const batchSize = 50;
for (let i = 0; i < products.length; i += batchSize) {
  const batch = products.slice(i, i + batchSize);
  // Processa lote...
  
  // GC a cada 5 lotes
  if (i > 0 && i % (batchSize * 5) === 0) {
    if (global.gc) {
      console.log('🧹 Executando garbage collection...');
      global.gc();
    }
  }
}
```

### 4. **Upload SFTP Otimizado**

#### Configurações para VPS:
```javascript
const sftpConfigOptimized = {
  readyTimeout: 45000,      // 45 segundos
  keepaliveInterval: 20000,  // 20 segundos
  keepaliveCountMax: 3,
  algorithms: {
    kex: ['diffie-hellman-group14-sha1'],    // Algoritmo mais leve
    cipher: ['aes128-ctr'],                  // Criptografia mais leve
    hmac: ['hmac-sha1']                      // Hash mais leve
  }
};

// Chunks menores para VPS
const readStream = fs.createReadStream(localFilePath, { 
  highWaterMark: 32 * 1024  // 32KB chunks
});
```

### 5. **Sistema de Monitoramento de Memória**

#### `utils/memoryOptimizer.js`:
```javascript
class MemoryOptimizer {
  // Monitora uso de memória
  getMemoryInfo()
  
  // Força garbage collection
  forceGarbageCollection()
  
  // Otimiza processamento em lotes
  optimizeBatchProcessing(currentBatch, totalBatches, gcInterval)
  
  // Wrapper para funções que consomem muita memória
  wrapMemoryIntensive(fn, name)
}
```

## 📊 Resultados Esperados

### Antes:
- 🔴 **Memória**: >8GB durante extração
- 🔴 **CSV**: Falha na geração
- 🔴 **Upload**: Timeout/falha
- 🔴 **VPS**: Aplicação travava

### Depois:
- 🟢 **Memória**: <6GB durante extração
- 🟢 **CSV**: Geração em lotes otimizada
- 🟢 **Upload**: Configurações otimizadas para VPS
- 🟢 **VPS**: Funcionamento estável

## 🚀 Como Usar

### 1. **Reiniciar com Configurações Otimizadas**:
```bash
# Parar aplicação atual
pm2 stop emarsys-server

# Iniciar com configurações otimizadas
pm2 start ecosystem.config.js --env production

# Verificar status
pm2 status
pm2 logs emarsys-server
```

### 2. **Testar Otimizações**:
```bash
# Executar teste de memória
node --expose-gc --max-old-space-size=6144 test-memory-optimization.js

# Com monitoramento (30 segundos)
node --expose-gc --max-old-space-size=6144 test-memory-optimization.js --monitor
```

### 3. **Monitorar Durante Extração**:
```bash
# Logs da aplicação
pm2 logs emarsys-server

# Monitoramento de recursos
pm2 monit

# Métricas específicas
curl http://localhost:3000/api/metrics/dashboard
```

## 🔍 Troubleshooting

### Se ainda houver problemas de memória:

1. **Verificar configurações**:
```bash
# Verificar se GC está habilitado
node -e "console.log(global.gc ? 'GC disponível' : 'GC NÃO disponível')"
```

2. **Reduzir batch size ainda mais**:
```javascript
// Em vtexProductService.js, linha ~868
const batchSize = 3; // Reduzir de 5 para 3
```

3. **Aumentar delays**:
```javascript
// Aumentar delay entre lotes
await new Promise(resolve => setTimeout(resolve, 100)); // De 50ms para 100ms
```

4. **Verificar logs específicos**:
```bash
# Procurar por erros de memória
grep -i "memory\|heap\|gc" logs/error-$(date +%Y-%m-%d).log

# Verificar uploads SFTP
grep -i "sftp\|upload" logs/application-$(date +%Y-%m-%d).log
```

## 📈 Monitoramento Contínuo

### Alertas Configurados:
- 🚨 **Memória > 85%**: Alerta automático
- 🚨 **Tempo resposta > 5s**: Alerta de performance
- 🚨 **Erros consecutivos > 5**: Alerta de estabilidade

### Métricas Importantes:
- **Heap Usage**: Deve ficar < 80%
- **System Memory**: Deve ficar < 85%
- **Upload Success Rate**: Deve ser > 90%
- **CSV Generation Time**: Deve ser < 5 minutos

## 🎯 Próximos Passos

1. ✅ **Implementado**: Otimizações de memória
2. ✅ **Implementado**: Upload SFTP otimizado
3. ✅ **Implementado**: Monitoramento automático
4. 🔄 **Em teste**: Funcionamento na VPS 8GB
5. 📋 **Futuro**: Implementar cache inteligente
6. 📋 **Futuro**: Processamento assíncrono com filas

---

**⚠️ Importante**: Sempre testar em ambiente de desenvolvimento antes de aplicar em produção.
