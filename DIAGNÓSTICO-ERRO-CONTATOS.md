# 🔍 Diagnóstico do Erro: "Nenhum método de envio disponível ou todos falharam"

## ❌ **Problema Identificado**

O erro `"Nenhum método de envio disponível ou todos falharam"` ocorre quando:

1. **WebDAV não está configurado** OU **falha na conexão WebDAV**
2. **E** o token da API também não está configurado OU **falha na API**

## 🔧 **Diagnóstico Passo a Passo**

### **1. Verificar Configurações**

Execute este comando para verificar o status das configurações:

```bash
curl -X GET "http://localhost:3000/api/emarsys/contacts/test"
```

**Resposta esperada:**
```json
{
  "success": true,
  "data": {
    "webdav": {
      "available": true/false,
      "configured": true/false,
      "message": "..."
    },
    "api": {
      "available": true/false,
      "configured": true/false,
      "message": "..."
    }
  }
}
```

### **2. Verificar Variáveis de Ambiente**

Certifique-se de que pelo menos uma das configurações abaixo está presente no seu `.env`:

#### **Opção A: WebDAV (Recomendado)**
```bash
WEBDAV_SERVER=https://your-webdav-server.com
WEBDAV_USER=your-username
WEBDAV_PASS=your-password
```

#### **Opção B: API Direta**
```bash
EMARSYS_CONTACTS_TOKEN=your-api-token
EMARSYS_CONTACTS_API_URL=https://api.emarsys.net/api/v2/contact/import
```

### **3. Verificar se Existem Arquivos de Contatos**

```bash
curl -X GET "http://localhost:3000/api/emarsys/contacts/files"
```

Se não houver arquivos, primeiro execute a extração:
```bash
curl -X POST "http://localhost:3000/api/emarsys/extract-contacts" \
  -H "Content-Type: application/json" \
  -d '{"userLimit": 100}'
```

## 🛠️ **Soluções por Cenário**

### **Cenário 1: WebDAV não configurado**

**Sintomas:**
- `webdav.configured: false`
- Erro: "Configurações WebDAV não encontradas"

**Solução:**
Adicione as variáveis WebDAV ao `.env`:
```bash
WEBDAV_SERVER=https://seu-servidor-webdav.com
WEBDAV_USER=seu-usuario
WEBDAV_PASS=sua-senha
```

### **Cenário 2: API não configurada**

**Sintomas:**
- `api.configured: false`
- Nenhuma das opções de envio disponível

**Solução:**
Adicione o token da API ao `.env`:
```bash
EMARSYS_CONTACTS_TOKEN=seu-token-api
```

### **Cenário 3: Configurações OK mas conexão falha**

**Sintomas:**
- `configured: true` mas `available: false`
- Erro de conectividade

**Soluções:**
1. **WebDAV:** Verifique URL, credenciais e conectividade de rede
2. **API:** Verifique se o token é válido e tem permissões

### **Cenário 4: Nenhum arquivo de contatos encontrado**

**Sintomas:**
- `"Nenhum arquivo CSV de contatos encontrado"`

**Solução:**
```bash
# 1. Execute a extração primeiro
curl -X POST "http://localhost:3000/api/emarsys/extract-contacts" \
  -H "Content-Type: application/json" \
  -d '{"userLimit": 1000, "filename": "contatos-teste"}'

# 2. Depois tente o envio
curl -X POST "http://localhost:3000/api/emarsys/contacts/send"
```

## 🧪 **Comandos de Teste**

### **Teste Completo:**
```bash
# 1. Verificar configurações
echo "=== TESTE DE CONFIGURAÇÕES ==="
curl -X GET "http://localhost:3000/api/emarsys/contacts/test"

# 2. Verificar arquivos disponíveis
echo -e "\n=== ARQUIVOS DISPONÍVEIS ==="
curl -X GET "http://localhost:3000/api/emarsys/contacts/files"

# 3. Ver último arquivo
echo -e "\n=== ÚLTIMO ARQUIVO ==="
curl -X GET "http://localhost:3000/api/emarsys/contacts/latest"

# 4. Tentar envio
echo -e "\n=== TESTE DE ENVIO ==="
curl -X POST "http://localhost:3000/api/emarsys/contacts/send" \
  -H "Content-Type: application/json"
```

### **Teste Específico WebDAV:**
```bash
curl -X POST "http://localhost:3000/api/emarsys/contacts/send-webdav" \
  -H "Content-Type: application/json"
```

### **Teste Específico API:**
```bash
curl -X POST "http://localhost:3000/api/emarsys/contacts/send-api" \
  -H "Content-Type: application/json"
```

## 📋 **Checklist de Verificação**

- [ ] Variáveis de ambiente configuradas (WebDAV OU API)
- [ ] Servidor rodando corretamente
- [ ] Arquivos CSV de contatos existem no diretório exports
- [ ] Conectividade de rede OK
- [ ] Credenciais válidas
- [ ] Permissões de arquivo corretas

## 🔍 **Logs Detalhados**

Para ver logs mais detalhados, verifique o console do servidor. O serviço mostra:

```
🔧 [EmarsysContactsService] Constructor inicializado:
   📁 ExportsDir: /path/to/exports
   🌐 WebDAV URL: Configurado/NÃO CONFIGURADO
   👤 WebDAV User: Configurado/NÃO CONFIGURADO
   🔐 WebDAV Pass: Configurado/NÃO CONFIGURADO
   🔑 API Token: Configurado/NÃO CONFIGURADO
```

## ⚡ **Solução Rápida**

Se você quer testar rapidamente, configure pelo menos o WebDAV:

```bash
# Adicione ao .env
WEBDAV_SERVER=https://files.emarsys.net
WEBDAV_USER=seu-usuario-emarsys
WEBDAV_PASS=sua-senha-emarsys

# Reinicie o servidor
npm restart

# Teste
curl -X POST "http://localhost:3000/api/emarsys/contacts/send"
```

## 📞 **Se o Problema Persistir**

1. Execute o comando de teste completo acima
2. Copie toda a saída
3. Verifique os logs do servidor
4. Confirme que as variáveis de ambiente estão sendo carregadas corretamente
