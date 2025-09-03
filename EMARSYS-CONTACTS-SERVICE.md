# Serviço de Envio de Contatos para Emarsys

Este documento descreve o novo serviço implementado para envio automatizado de planilhas de contatos extraídas da VTEX para a Emarsys.

## 📋 Visão Geral

O `EmarsysContactsService` foi criado para preencher a lacuna existente entre a extração de contatos (`/api/emarsys/extract-contacts`) e o envio dessas planilhas para a Emarsys. Segue o mesmo padrão do `EmarsysSalesService` usado para pedidos.

## 🏗️ Arquitetura

### Arquivos Criados:
- `services/emarsysContactsService.js` - Serviço principal
- `routes/emarsysContacts.js` - Rotas da API
- `server.js` - Atualizado para incluir as novas rotas

### Métodos de Envio:
1. **WebDAV** (método principal) - Para arquivos grandes
2. **API direta** (fallback) - Para casos específicos

## 🔧 Configuração

### Variáveis de Ambiente Necessárias:

```bash
# WebDAV (método recomendado)
WEBDAV_SERVER=https://your-webdav-server.com
WEBDAV_USER=your-username
WEBDAV_PASS=your-password

# API direta (opcional/fallback)
EMARSYS_CONTACTS_TOKEN=your-api-token
EMARSYS_CONTACTS_API_URL=https://api.emarsys.net/api/v2/contact/import

# Diretório de arquivos
EXPORTS_DIR=/path/to/exports  # Opcional, padrão: ./exports
```

## 📡 Endpoints da API

### Base URL: `/api/emarsys/contacts`

#### 1. **Listar Arquivos**
```bash
GET /api/emarsys/contacts/files
```
Lista todos os arquivos CSV de contatos disponíveis.

#### 2. **Obter Estatísticas**
```bash
GET /api/emarsys/contacts/stats
```
Retorna estatísticas dos arquivos (total, tamanhos, etc.).

#### 3. **Último Arquivo**
```bash
GET /api/emarsys/contacts/latest
```
Obtém informações do arquivo mais recente.

#### 4. **Enviar para Emarsys** ⭐
```bash
POST /api/emarsys/contacts/send
Content-Type: application/json

{
  "filename": "contatos-2025-01-15.csv"  // Opcional
}
```
Envia arquivo CSV para Emarsys (tenta WebDAV primeiro, depois API).

#### 5. **Enviar via WebDAV**
```bash
POST /api/emarsys/contacts/send-webdav
Content-Type: application/json

{
  "filename": "contatos-2025-01-15.csv"  // Opcional
}
```

#### 6. **Enviar via API**
```bash
POST /api/emarsys/contacts/send-api
Content-Type: application/json

{
  "filename": "contatos-2025-01-15.csv"  // Opcional
}
```

#### 7. **Testar Conectividade**
```bash
GET /api/emarsys/contacts/test
```
Testa a configuração dos serviços WebDAV e API.

#### 8. **Download de Arquivo**
```bash
GET /api/emarsys/contacts/download/:filename
```

#### 9. **Preview de Arquivo**
```bash
GET /api/emarsys/contacts/preview/:filename?lines=10
```

#### 10. **Remover Arquivo**
```bash
DELETE /api/emarsys/contacts/files/:filename
```

## 🚀 Uso Prático

### Fluxo Completo:

1. **Extrair Contatos da VTEX**:
```bash
curl -X POST "http://localhost:3000/api/emarsys/extract-contacts" \
  -H "Content-Type: application/json" \
  -d '{
    "maxFileSizeMB": 50,
    "userLimit": 10000,
    "filename": "contatos_vtex",
    "useScroll": true
  }'
```

2. **Verificar Último Arquivo Gerado**:
```bash
curl -X GET "http://localhost:3000/api/emarsys/contacts/latest"
```

3. **Enviar para Emarsys**:
```bash
curl -X POST "http://localhost:3000/api/emarsys/contacts/send" \
  -H "Content-Type: application/json"
```

### Envio de Arquivo Específico:
```bash
curl -X POST "http://localhost:3000/api/emarsys/contacts/send" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "contatos-vtex-2025-01-15T14-30-00.csv"
  }'
```

## 🔍 Detecção de Arquivos

O serviço identifica arquivos CSV de contatos pelos seguintes padrões no nome:
- `contatos`
- `contacts`
- `cl-with-addresses`
- `customers`

## 📊 Exemplo de Resposta

### Envio Bem-sucedido:
```json
{
  "success": true,
  "message": "Arquivo CSV de contatos enviado com sucesso para Emarsys",
  "data": {
    "success": true,
    "method": "webdav",
    "filename": "contatos-vtex-2025-01-15T14-30-00.csv",
    "remotePath": "/contacts/contatos-vtex-2025-01-15T14-30-00.csv",
    "fileSize": 2048576,
    "fileSizeFormatted": "1.95 MB",
    "message": "Contacts CSV uploaded successfully via WebDAV"
  },
  "timestamp": "2025-01-15T17:30:00.000Z"
}
```

### Lista de Arquivos:
```json
{
  "success": true,
  "message": "3 arquivo(s) CSV de contatos encontrado(s)",
  "data": {
    "totalFiles": 3,
    "files": [
      {
        "filename": "contatos-vtex-2025-01-15T14-30-00.csv",
        "filePath": "/exports/contatos-vtex-2025-01-15T14-30-00.csv",
        "size": 2048576,
        "sizeFormatted": "1.95 MB",
        "modified": "2025-01-15T17:30:00.000Z",
        "modifiedFormatted": "2025-01-15T17:30:00.000Z"
      }
    ]
  }
}
```

## 🔒 Segurança

- Validação de tipos de arquivo (apenas CSV de contatos)
- Verificação de existência de arquivos
- Sanitização de nomes de arquivos
- Headers de segurança via Helmet

## 🐛 Tratamento de Erros

O serviço possui tratamento robusto de erros:
- Arquivos não encontrados
- Falhas de conectividade
- Arquivos corrompidos
- Configurações inválidas

## 📈 Monitoramento

Use os endpoints de estatísticas e teste para monitorar:
- Quantidade de arquivos gerados
- Tamanhos dos arquivos
- Status da conectividade
- Últimas execuções

## 🔄 Integração com Cron Jobs

O serviço pode ser facilmente integrado com cron jobs para automação:

```javascript
// Exemplo de cron job
const emarsysContactsService = require('./services/emarsysContactsService');

async function syncContacts() {
  const result = await emarsysContactsService.sendContactsCsvToEmarsys();
  console.log('Sync result:', result);
}
```

## ⚡ Performance

- Suporte a arquivos grandes (até 99MB por padrão)
- Upload assíncrono
- Timeout configurável (2 minutos)
- Compressão automática quando disponível

## 🤝 Compatibilidade

O serviço mantém compatibilidade com:
- Sistema de extração existente (`/api/emarsys/extract-contacts`)
- Estrutura de arquivos atual
- Configurações de ambiente existentes
- Padrões da API Emarsys

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs do servidor
2. Teste a conectividade com `/api/emarsys/contacts/test`
3. Valide as variáveis de ambiente
4. Consulte a documentação da API Emarsys
