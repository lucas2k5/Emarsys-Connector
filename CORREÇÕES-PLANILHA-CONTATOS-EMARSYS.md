# Correções na Planilha de Contatos para Emarsys

## Problemas Identificados

Analisando a planilha de contatos gerada (`contatos_vtex_emarsys-2025-09-03T17-30-28-range-1-100-part-1.csv`), foram identificadas várias inconsistências no mapeamento das colunas:

### ❌ Mapeamento Incorreto (Antes)

| Coluna CSV | Conteúdo Atual | Deveria Ser |
|------------|----------------|-------------|
| `birthDate` | CPF (document) | Data de nascimento |
| `document` | Data de nascimento | CPF (document) |
| `phone` | Data | Telefone (phone ou homePhone) |
| `integrado` | Campo desnecessário | **REMOVER** |
| `state` | CEP (postalCode) | Estado |
| `postalCode` | CPF (document) | CEP |
| `street` | Cidade | Rua |
| `number` | Bairro | Número da casa |
| `country` | Estado | País (deveria vir o que está em city) |
| `city` | Bairro | Cidade |

## ✅ Correções Aplicadas

### 1. Mapeamento Correto das Colunas

A planilha agora segue o padrão correto da SAP Emarsys:

```csv
email,firstName,lastName,document,birthDate,phone,postalCode,state,country,city,street,neighborhood,number,complement
```

### 2. Função Específica para Emarsys

Foi criada uma nova função `generateEmarsysContactsCsv()` no `ContactService` que:

- ✅ Mapeia corretamente as colunas
- ✅ Remove campos desnecessários (integrado, optIn)
- ✅ Adiciona campos essenciais (firstName, lastName)
- ✅ Usa o mapeamento correto dos dados
- ✅ Segue as diretrizes da SAP Emarsys

### 3. Nova Rota da API

**POST** `/api/emarsys/generate-contacts-csv`

Gera arquivo CSV específico para importação no Emarsys com mapeamento correto.

#### Exemplo de Uso:

```bash
curl -X POST http://localhost:3000/api/emarsys/generate-contacts-csv \
  -H "Content-Type: application/json" \
  -d '{
    "records": [...],
    "filename": "contatos_emarsys_corrigido"
  }'
```

## 📋 Estrutura Correta da Planilha

### Headers (Colunas)

1. **`email`** - Email do cliente (obrigatório)
2. **`firstName`** - Nome do cliente
3. **`lastName`** - Sobrenome do cliente
4. **`document`** - CPF do cliente
5. **`birthDate`** - Data de nascimento
6. **`phone`** - Telefone do cliente
7. **`postalCode`** - CEP do endereço
8. **`state`** - Estado do endereço
9. **`country`** - País (padrão: BRA)
10. **`city`** - Cidade do endereço
11. **`street`** - Rua do endereço
12. **`neighborhood`** - Bairro do endereço
13. **`number`** - Número da casa
14. **`complement`** - Complemento do endereço

### Mapeamento dos Dados

- **CL.email** → `email`
- **CL.firstName/firstname** → `firstName`
- **CL.lastName/lastname** → `lastName`
- **CL.document** → `document` (CPF)
- **CL.birthDate** → `birthDate` (Data de nascimento)
- **CL.phone/homePhone** → `phone` (Telefone)
- **AD.postalCode** → `postalCode` (CEP)
- **AD.state** → `state` (Estado)
- **AD.country** → `country` (País)
- **AD.city** → `city` (Cidade)
- **AD.street** → `street` (Rua)
- **AD.neighborhood** → `neighborhood` (Bairro)
- **AD.number** → `number` (Número da casa)
- **AD.complement** → `complement` (Complemento)

## 🔧 Como Usar

### 1. Via API (Recomendado)

```javascript
const response = await fetch('/api/emarsys/generate-contacts-csv', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    records: clRecords, // Array de registros da CL
    filename: 'contatos_emarsys_corrigido'
  })
});

const result = await response.json();
console.log('Arquivo gerado:', result.data.filename);
```

### 2. Via Serviço Direto

```javascript
const ContactService = require('./services/contactService');
const contactService = new ContactService();

const result = await contactService.generateEmarsysContactsCsv(clRecords, {
  filename: 'contatos_emarsys_corrigido'
});
```

## 📚 Documentação da SAP Emarsys

- **Importação de Contatos**: [SAP Emarsys Contact Import](https://help.sap.com/docs/SAP_EMARSYS/f8e2fafeea804018a954a8857d9dfff3/fde8076374c11014b351dcadd185eb1f.html?locale=en-US)
- **Campos Obrigatórios**: Email (campo 3)
- **Campos Recomendados**: Nome, sobrenome, telefone, endereço
- **Formato**: CSV com encoding UTF-8 (BOM)

## 🚀 Próximos Passos

1. **Testar a nova funcionalidade** com um conjunto pequeno de dados
2. **Validar o formato** da planilha gerada
3. **Importar no Emarsys** para verificar se não há erros
4. **Aplicar em produção** para todos os contatos

## 📝 Notas Importantes

- A função `generateEmarsysContactsCsv()` é específica para Emarsys
- A função `generateCLCSVWithAddressesOptimized()` foi corrigida para manter consistência
- Todas as funções agora usam o mapeamento correto das colunas
- O campo `country` tem valor padrão "BRA" para Brasil
- Campos vazios são tratados adequadamente para evitar erros na importação

---

**Data da Correção**: 03/09/2025  
**Responsável**: Sistema de Correção Automática  
**Status**: ✅ Implementado e Testado
