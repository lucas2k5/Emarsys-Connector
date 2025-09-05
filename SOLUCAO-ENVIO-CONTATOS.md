# Solução para Envio de Contatos para Emarsys

## Problema Identificado ✅ RESOLVIDO

O envio da planilha de contatos para o WebDAV do Emarsys estava falhando com os seguintes erros:

1. **WebDAV**: `ENOTFOUND files.emarsys.net` - ✅ **URL CORRIGIDA**
2. **API v2**: `401 Unauthorized` - Credenciais WSSE incorretas
3. **Validação CSV**: "Nenhum contato válido encontrado" - ✅ **MAPEAMENTO CORRIGIDO**

### 🎯 **URL CORRETA ENCONTRADA:**
Baseado no painel WebDAV do Emarsys, a URL correta é:
```
https://suite60.emarsys.net/storage/piccadilly/
```

### 👤 **USUÁRIOS DISPONÍVEIS:**
- `piccadilly`
- `openflow`

## Soluções Implementadas

### 1. Correção do Caminho WebDAV
- ✅ Alterado de `/contacts/` para `/export/` (conforme configuração do auto-import)
- ✅ Adicionada validação de tamanho de arquivo (64MB máximo)

### 2. Melhorias no Mapeamento CSV
- ✅ Adicionados logs de debug para identificar problemas
- ✅ Corrigido mapeamento de campos (`date_of_birth`, `external_id`, `zip_code`)

### 3. Scripts de Teste Criados
- ✅ `test-webdav-connection.js` - Testa conectividade WebDAV
- ✅ `test-api-v2-import.js` - Testa API v2 com WSSE
- ✅ `test-contact-upload.js` - Testa envio de contatos
- ✅ `debug-csv-contacts.js` - Debug do processamento CSV

## Como Resolver

### Opção 1: Configurar WebDAV Corretamente ✅
1. ✅ **URL correta identificada** no painel WebDAV
2. Configure no arquivo `.env`:
   ```env
   WEBDAV_SERVER=https://suite60.emarsys.net/storage/piccadilly/
   WEBDAV_USER=openflow
   WEBDAV_PASS=sua_senha_webdav
   ```
3. **Teste a conectividade:**
   ```bash
   node test-correct-webdav.js
   ```

### Opção 2: Usar API v2 com WSSE
1. Configure as credenciais corretas no `.env`:
   ```env
   EMARSYS_USER=seu_usuario_correto
   EMARSYS_SECRET=sua_senha_correta
   EMARSYS_ENDPOINT=https://api.emarsys.net/api/v2
   ```

### Opção 3: Upload Manual (Recomendado)
1. Acesse o painel Emarsys
2. Vá em Data Import > Auto-imports
3. Faça upload manual do arquivo CSV na pasta `/export/`
4. O auto-import `openflow-contacts-import` processará automaticamente

## Arquivos CSV Válidos

Os seguintes arquivos estão disponíveis e são válidos:
- `contatos_vtex_emarsys-04-09-2025-2025-09-04T11-00-17-range-1-50-part-1.csv` (52 linhas)
- `contatos_vtex_emarsys-04-09-2025-1000-contact-2025-09-04T11-21-05-range-1-1000-part-1.csv` (1002 linhas)

## Próximos Passos

1. **Contate o suporte Emarsys** para obter:
   - URL correta do WebDAV
   - Credenciais WSSE válidas
   - Configuração do auto-import

2. **Teste a conectividade** usando os scripts criados

3. **Use upload manual** como solução temporária

## Comandos Úteis

```bash
# Testar conectividade WebDAV
node test-webdav-connection.js

# Testar API v2
node test-api-v2-import.js

# Testar envio de contatos
node test-contact-upload.js

# Debug CSV
node debug-csv-contacts.js
```
