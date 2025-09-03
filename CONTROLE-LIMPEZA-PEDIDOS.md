# Controle de Limpeza de Pedidos

## Visão Geral

Este documento explica como pausar/habilitar a limpeza automática dos pedidos após o envio para a Emarsys.

## Configuração

A limpeza de pedidos é controlada pela variável de ambiente `ENABLE_ORDER_CLEANUP`:

- `true` (padrão): Limpeza habilitada
- `false`: Limpeza pausada

## Como Pausar a Limpeza

### 1. Via Variável de Ambiente

Adicione ao seu arquivo `.env`:

```
ENABLE_ORDER_CLEANUP=false
```

### 2. Via Sistema Operacional (temporário)

**Windows:**

```powershell
$env:ENABLE_ORDER_CLEANUP="false"
```

**Linux/Mac:**

```bash
export ENABLE_ORDER_CLEANUP=false
```

## Locais Afetados

A limpeza de pedidos ocorre em dois locais principais:

1. **Rota `/api/emarsys/sales/send-csv-file`** (`routes/emarsysSales.js`)

   - Executa limpeza após envio bem-sucedido do CSV
2. **Serviço `sendOrdersToEmarsys`** (`services/vtexOrdersService.js`)

   - Executa limpeza após envio direto de pedidos

## Como Verificar o Status

Ao executar com limpeza pausada, você verá no log:

```
⏸️ Limpeza de orders pausada via ENABLE_ORDER_CLEANUP=false
```

## Como Reabilitar

Para reativar a limpeza automática:

1. Remova ou altere a variável de ambiente:

   ```
   ENABLE_ORDER_CLEANUP=true
   ```
2. Reinicie o servidor

## Importante

- A limpeza é executada de forma assíncrona e não bloqueia as respostas das APIs
- Mesmo com a limpeza pausada, o envio para a Emarsys continua funcionando normalmente
- A configuração afeta ambos os fluxos de envio (CSV e direto)
