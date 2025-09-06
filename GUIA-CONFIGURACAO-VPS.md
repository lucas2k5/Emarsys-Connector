# Guia de Configuração para VPS - Emarsys Server

## Problema Identificado
A aplicação não está respondendo corretamente no IP da VPS (177.93.135.200) porque não está configurada para escutar em todas as interfaces de rede.

## Soluções Aplicadas

### 1. ✅ Configuração de HOST
- **Arquivo**: `env.example` e `ecosystem.config.js`
- **Mudança**: Adicionado `HOST=0.0.0.0` para escutar em todas as interfaces
- **Antes**: Aplicação escutava apenas em localhost (127.0.0.1)
- **Depois**: Aplicação escuta em todas as interfaces (0.0.0.0)

### 2. ✅ Configuração do PM2
- **Arquivo**: `ecosystem.config.js`
- **Mudança**: Adicionado `HOST: '0.0.0.0'` nas configurações de ambiente
- **Resultado**: PM2 agora inicia a aplicação escutando em todas as interfaces

## Passos para Aplicar as Correções na VPS

### 1. Atualizar Variáveis de Ambiente
```bash
# Na VPS, editar o arquivo .env
nano .env

# Adicionar ou modificar:
HOST=0.0.0.0
PORT=3000
NODE_ENV=production
```

### 2. Reiniciar a Aplicação
```bash
# Parar a aplicação atual
pm2 stop emarsys-server

# Reiniciar com as novas configurações
pm2 restart emarsys-server

# Verificar status
pm2 status
```

### 3. Verificar se está Funcionando
```bash
# Verificar se a aplicação está escutando na porta 3000
netstat -tlnp | grep 3000

# Deve mostrar algo como:
# tcp6  0  0  :::3000  :::*  LISTEN  [PID]/node
```

### 4. Testar Conectividade
```bash
# Teste local na VPS
curl http://localhost:3000/health

# Teste externo (do seu computador)
curl http://177.93.135.200:3000/health
```

### 5. Testar a Rota Específica
```bash
curl --location '177.93.135.200:3000/api/emarsys/contacts/create-single' \
--header 'Content-Type: application/json' \
--data-raw '{
    "nome": "Baitaca Mica",
    "email": "baitaca5@baitaca.net",
    "phone": "+5577992098234",
    "birth_of_date": "1995-01-10"
}'
```

## Verificações Adicionais

### Firewall
```bash
# Verificar status do firewall
ufw status

# Se necessário, abrir a porta 3000
ufw allow 3000
```

### Logs da Aplicação
```bash
# Ver logs em tempo real
pm2 logs emarsys-server

# Ver logs de erro
pm2 logs emarsys-server --err
```

### Verificar Processos
```bash
# Ver todos os processos PM2
pm2 list

# Ver informações detalhadas
pm2 show emarsys-server
```

## Script de Diagnóstico

Use o script `check-server-status.js` para testar a conectividade:

```bash
node check-server-status.js
```

## Possíveis Problemas e Soluções

### 1. Aplicação não inicia
- Verificar logs: `pm2 logs emarsys-server --err`
- Verificar se todas as dependências estão instaladas: `npm install`
- Verificar variáveis de ambiente: `cat .env`

### 2. Porta 3000 não está acessível
- Verificar firewall: `ufw status`
- Verificar se a porta está em uso: `netstat -tlnp | grep 3000`
- Abrir porta no firewall: `ufw allow 3000`

### 3. Aplicação inicia mas não responde
- Verificar se HOST=0.0.0.0 está configurado
- Reiniciar aplicação: `pm2 restart emarsys-server`
- Verificar logs para erros: `pm2 logs emarsys-server`

### 4. Timeout nas requisições
- Verificar se a aplicação não está sobrecarregada
- Verificar logs para erros de processamento
- Considerar aumentar timeout nas configurações

## Comandos Úteis

```bash
# Status geral
pm2 status

# Reiniciar aplicação
pm2 restart emarsys-server

# Ver logs
pm2 logs emarsys-server

# Monitorar em tempo real
pm2 monit

# Salvar configuração atual
pm2 save

# Configurar para iniciar automaticamente
pm2 startup
```

## Resultado Esperado

Após aplicar essas correções, a aplicação deve:
1. ✅ Escutar em todas as interfaces (0.0.0.0:3000)
2. ✅ Responder a requisições externas no IP 177.93.135.200
3. ✅ Processar corretamente a rota `/api/emarsys/contacts/create-single`
4. ✅ Retornar respostas JSON válidas

## Teste Final

Execute este comando para confirmar que tudo está funcionando:

```bash
curl -X POST http://177.93.135.200:3000/api/emarsys/contacts/create-single \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Teste VPS",
    "email": "teste@vps.com",
    "phone": "+5577999999999",
    "birth_of_date": "1990-01-01"
  }'
```

Se retornar uma resposta JSON (sucesso ou erro), a configuração está correta!
