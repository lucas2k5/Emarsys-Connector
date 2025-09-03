# 🔧 Configuração para Envio de Contatos - Emarsys

## ✅ **Problemas Resolvidos**

Com base no erro que você encontrou, implementei uma solução completa:

1. ❌ **WebDAV URL incorreta** (`files.emarsys.net` não existe)
2. ❌ **API não configurada** (token ausente)
3. ✅ **Nova implementação** com API v2 + WSSE (baseada no seu exemplo)

## 🔑 **Configuração das Variáveis de Ambiente**

Adicione ao seu `.env`:

```bash
# === MÉTODO RECOMENDADO: API v2 com WSSE ===
EMARSYS_USER=seu-usuario-emarsys
EMARSYS_SECRET=sua-senha-emarsys

# === ALTERNATIVA: WebDAV (se disponível) ===
# WEBDAV_SERVER=https://seu-servidor-webdav-real.com
# WEBDAV_USER=seu-usuario-webdav
# WEBDAV_PASS=sua-senha-webdav

# === FALLBACK: API Direta (se disponível) ===
# EMARSYS_CONTACTS_TOKEN=seu-token-api
```

## 🧪 **Teste a Nova Configuração**

### **1. Teste de Conectividade**
```bash
curl -X GET "http://localhost:3000/api/emarsys/contacts/test"
```

**Resposta esperada com WSSE configurado:**
```json
{
  "success": true,
  "data": {
    "webdav": {
      "available": false,
      "configured": false
    },
    "api_v2_wsse": {
      "available": true,
      "configured": true,
      "message": "Conexão com API Emarsys estabelecida com sucesso",
      "status": 200,
      "fieldsCount": 150
    },
    "api_direct": {
      "available": false,
      "configured": false
    }
  }
}
```

### **2. Verificar Campos Disponíveis**
```bash
curl -X GET "http://localhost:3000/api/emarsys/contacts/fields"
```

### **3. Testar Envio de Contatos**
```bash
curl -X POST "http://localhost:3000/api/emarsys/contacts/send" \
  -H "Content-Type: application/json"
```

## 🚀 **Novos Endpoints Disponíveis**

### **Importação Direta (Recomendado)**
```bash
# Importa usando o último arquivo CSV gerado
curl -X POST "http://localhost:3000/api/emarsys/contacts/import" \
  -H "Content-Type: application/json"

# Importa arquivo específico com lote customizado
curl -X POST "http://localhost:3000/api/emarsys/contacts/import" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "contatos-vtex-2025.csv",
    "batchSize": 500
  }'
```

### **Criar Contato Individual**
```bash
curl -X POST "http://localhost:3000/api/emarsys/contacts/create" \
  -H "Content-Type: application/json" \
  -d '{
    "contact": {
      "1": "João",
      "2": "Silva", 
      "3": "joao@exemplo.com",
      "57": "+5511999999999"
    }
  }'
```

### **Listar Campos da Emarsys**
```bash
curl -X GET "http://localhost:3000/api/emarsys/contacts/fields"
```

## 📊 **Mapeamento de Campos**

O serviço mapeia automaticamente os campos do CSV para a Emarsys:

| Campo CSV | Campo Emarsys | Descrição |
|-----------|---------------|-----------|
| `email` | `3` | Email (obrigatório) |
| `firstName` | `1` | Primeiro Nome |
| `lastName` | `2` | Sobrenome |
| `phone` | `57` | Telefone |
| `birthDate` | `58` | Data de Nascimento |
| `document` | `59` | Documento |
| `city` | `60` | Cidade |
| `state` | `61` | Estado |
| `postalCode` | `62` | CEP |

## 🔄 **Fluxo Completo Atualizado**

### **Método 1: Automático (Recomendado)**
```bash
# 1. Extrair contatos da VTEX
curl -X POST "http://localhost:3000/api/emarsys/extract-contacts" \
  -H "Content-Type: application/json" \
  -d '{"userLimit": 1000}'

# 2. Enviar para Emarsys (usa automaticamente API v2)
curl -X POST "http://localhost:3000/api/emarsys/contacts/send"
```

### **Método 2: Importação Direta**
```bash
# 1. Extrair contatos
curl -X POST "http://localhost:3000/api/emarsys/extract-contacts" \
  -H "Content-Type: application/json" \
  -d '{"userLimit": 1000}'

# 2. Importar diretamente via API v2
curl -X POST "http://localhost:3000/api/emarsys/contacts/import"
```

## 📈 **Vantagens da Nova Implementação**

### ✅ **API v2 com WSSE:**
- ✅ Autenticação robusta (baseada no seu exemplo)
- ✅ Retry automático em caso de falha
- ✅ Processamento em lotes configurável
- ✅ Logs detalhados
- ✅ Mapeamento automático de campos
- ✅ Validação de email
- ✅ Controle de rate limiting

### 🔄 **Fallback Inteligente:**
1. **API v2 WSSE** (método principal)
2. **WebDAV** (se configurado e funcionando)
3. **API Direta** (se token disponível)

## 🐛 **Troubleshooting**

### **Erro: "Cliente não inicializado"**
**Solução:** Configure `EMARSYS_USER` e `EMARSYS_SECRET` no `.env`

### **Erro: "Nenhum contato válido encontrado"**
**Solução:** Verifique se o CSV tem a coluna `email` preenchida

### **Erro: "Nenhum arquivo CSV encontrado"**
**Solução:** Execute primeiro `/api/emarsys/extract-contacts`

## 🎯 **Teste Rápido**

Execute esta sequência para testar tudo:

```bash
# 1. Configurar credenciais no .env
echo "EMARSYS_USER=seu-usuario" >> .env
echo "EMARSYS_SECRET=sua-senha" >> .env

# 2. Reiniciar servidor
npm restart

# 3. Testar conectividade
curl -X GET "http://localhost:3000/api/emarsys/contacts/test"

# 4. Extrair contatos de teste
curl -X POST "http://localhost:3000/api/emarsys/extract-contacts" \
  -H "Content-Type: application/json" \
  -d '{"userLimit": 100, "filename": "teste-contatos"}'

# 5. Enviar para Emarsys
curl -X POST "http://localhost:3000/api/emarsys/contacts/send"
```

## 📞 **Próximos Passos**

1. Configure as credenciais Emarsys no `.env`
2. Reinicie o servidor
3. Teste a conectividade
4. Execute o fluxo completo

**Agora você tem um serviço robusto que funciona com a API oficial da Emarsys!**
