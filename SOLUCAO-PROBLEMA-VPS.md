# Solução para Problema de Rota na VPS

## Problema Identificado
- ✅ Endpoint `/health` funciona corretamente
- ❌ Endpoint `/api/emarsys/contacts/create-single` retorna "Route not found"
- ✅ Mesmo código funciona em desenvolvimento local
- ❌ Não funciona em produção na VPS

## Possíveis Causas

### 1. **Ordem das Rotas** (Mais Provável)
O problema pode estar na ordem de registro das rotas. Se houver uma rota mais genérica registrada antes, ela pode estar capturando a requisição.

### 2. **Middleware Interferindo**
Algum middleware pode estar interceptando a requisição antes de chegar à rota.

### 3. **Configuração de Ambiente**
Diferenças na configuração entre desenvolvimento e produção.

## Soluções para Testar na VPS

### Passo 1: Executar Diagnóstico
```bash
# Na VPS, execute o script de diagnóstico
node diagnostico-vps.js
```

### Passo 2: Verificar Logs da Aplicação
```bash
# Ver logs em tempo real
pm2 logs emarsys-server

# Ver logs de erro específicos
pm2 logs emarsys-server --err

# Ver status da aplicação
pm2 status
```

### Passo 3: Testar Rota Específica
```bash
# Execute o script de teste
node test-vps-route.js
```

### Passo 4: Verificar Configuração do Servidor
```bash
# Verificar se a aplicação está escutando na porta correta
netstat -tlnp | grep 3000

# Deve mostrar algo como:
# tcp6  0  0  :::3000  :::*  LISTEN  [PID]/node
```

## Soluções Propostas

### Solução 1: Verificar Ordem das Rotas
O problema pode estar na ordem de registro das rotas no `server.js`. Vamos verificar se há alguma rota que está capturando a requisição antes.

**Verificar no server.js:**
```javascript
// Verificar se há alguma rota mais genérica antes de emarsysContacts
app.use('/api/emarsys', emarsysRoutes);  // Esta pode estar interferindo
app.use('/api/emarsys/contacts', emarsysContactsRoutes);
```

### Solução 2: Adicionar Logs de Debug
Adicionar logs para rastrear onde a requisição está sendo interceptada.

**Modificar server.js:**
```javascript
// Adicionar middleware de debug antes das rotas
app.use('/api/emarsys/contacts', (req, res, next) => {
  console.log(`🔍 Debug: ${req.method} ${req.originalUrl}`);
  next();
}, emarsysContactsRoutes);
```

### Solução 3: Verificar Middleware de Erro
O middleware de erro pode estar sendo executado antes da rota.

**Verificar no server.js:**
```javascript
// Verificar se o middleware 404 está sendo executado antes da rota
app.use('*', (req, res) => {
  console.log(`❌ Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Openflow - Emarsys - Route not found' });
});
```

## Comandos para Executar na VPS

### 1. Verificar Status da Aplicação
```bash
pm2 status
pm2 logs emarsys-server --lines 50
```

### 2. Reiniciar Aplicação
```bash
pm2 restart emarsys-server
pm2 logs emarsys-server --follow
```

### 3. Verificar Configuração
```bash
# Verificar variáveis de ambiente
cat .env | grep -E "(NODE_ENV|HOST|PORT)"

# Verificar se a aplicação está escutando corretamente
netstat -tlnp | grep 3000
```

### 4. Testar Conectividade
```bash
# Teste local na VPS
curl http://localhost:3000/health
curl http://localhost:3000/api/emarsys/contacts/create-single

# Teste externo
curl http://177.93.135.200:3000/health
curl http://177.93.135.200:3000/api/emarsys/contacts/create-single
```

## Script de Correção Rápida

Se o problema for a ordem das rotas, execute este comando na VPS:

```bash
# Fazer backup do server.js
cp server.js server.js.backup

# Verificar a ordem das rotas
grep -n "app.use.*emarsys" server.js
```

## Verificação Final

Após aplicar as correções, teste novamente:

```bash
curl --location '177.93.135.200:3000/api/emarsys/contacts/create-single' \
--header 'Content-Type: application/json' \
--data-raw '{
    "nome": "Baitaca Mica",
    "email": "baitaca6@baitaca.net",
    "phone": "+5577992098234",
    "birth_of_date": "1995-01-10"
}'
```

## Resultado Esperado

Se a correção funcionar, você deve receber uma resposta JSON válida (sucesso ou erro de validação), não mais "Route not found".

## Próximos Passos

1. Execute o diagnóstico na VPS
2. Verifique os logs da aplicação
3. Aplique a correção apropriada
4. Teste novamente a rota
5. Confirme que está funcionando

## Contato para Suporte

Se o problema persistir, forneça:
- Output do `diagnostico-vps.js`
- Logs da aplicação (`pm2 logs emarsys-server`)
- Resultado do `pm2 status`
- Resultado do `netstat -tlnp | grep 3000`

