# Deploy em Servidor Linux — Emarsys Connector

Guia de deploy em produção usando **Node.js + PM2** diretamente no servidor.

## Requisitos de Hardware

| Recurso | Mínimo | Recomendado |
|---|---|---|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disco | 20 GB | 40 GB |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

---

## 1. Preparar o servidor

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential
```

### Instalar Node.js 22 (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar
node -v   # v22.x.x
npm -v
```

### Instalar PM2 globalmente

```bash
npm install -g pm2
```

---

## 2. Clonar o repositório

```bash
mkdir -p ~/apps && cd ~/apps

git clone https://dev.azure.com/gabrielaraujo-openflow/Hope/_git/Emarsys-Connector
cd Emarsys-Connector

npm install
```

---

## 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env
```

Variáveis obrigatórias para Hope Lingerie:

```env
# Servidor
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
BASE_URL=https://seu-dominio.com.br

# VTEX — Hope Lingerie
VTEX_BASE_URL=https://hopelingerie.vtexcommercestable.com.br
VTEX_APP_KEY=
VTEX_APP_TOKEN=
STORE_BASE_URL=https://www.hopelingerie.com.br

# Emarsys — Pedidos (token estático tem prioridade sobre OAuth2)
EMARSYS_ORDERS_API_URL=https://admin.scarabresearch.com/hapi/merchant/1789FBAF0A6EF683/sales-data/api
EMARSYS_SALES_TOKEN=
EMARSYS_ORDERS_API_TIMEOUT=60000

# OAuth2 (fallback — preencher se não usar token estático)
EMARSYS_OAUTH2_CLIENT_ID=
EMARSYS_OAUTH2_CLIENT_SECRET=
EMARSYS_OAUTH2_TOKEN_ENDPOINT=https://auth.emarsys.net/oauth2/token

# SFTP — Produtos
SFTP_PRODUCTS_HOST=exchange.si.emarsys.net
SFTP_PRODUCTS_PORT=22
SFTP_PRODUCTS_USERNAME=bu_hope
SFTP_PRODUCTS_PASSWORD=
SFTP_PRODUCTS_REMOTE_PATH=/

# Webhook — Contatos
CONTACTS_WEBHOOK_URL=
CONTACTS_WEBHOOK_URL_HOPE=
CONTACTS_WEBHOOK_CLIENT_TYPE=hope
CONTACTS_WEBHOOK_AUTH_HEADER=
CONTACTS_WEBHOOK_TIMEOUT=30000

# Banco de dados
SQLITE_DB_PATH=./data/orders.db

# Cron jobs
PRODUCTS_SYNC_CRON=0 2 * * *
ORDERS_SYNC_CRON=5,35 * * * *
CONTACTS_RETRY_CRON=*/5 * * * *
CLIENTS_SYNC_CRON=*/30 * * * *
CRON_TIMEZONE=America/Sao_Paulo
ORDERS_SYNC_ENABLED=true        # obrigatório para o cron de pedidos rodar
CLIENTS_SYNC_ENABLED=true

# Performance
PRODUCTS_TIMEOUT_MS=600000
ORDERS_TIMEOUT_MS=900000
LOG_LEVEL=error
```

---

## 4. Criar diretórios necessários

```bash
mkdir -p data exports logs
```

---

## 5. Iniciar em produção

```bash
npm run prod
```

Este comando executa `pm2 start ecosystem.config.js --env production`, que sobe **dois processos**:

| Processo | Script | Responsabilidade |
|---|---|---|
| `api` | `server.js` | Express HTTP, rotas, webhooks |
| `worker` | `worker.js` | Cron jobs: produtos, pedidos, retry de contatos |

Os dois processos são independentes — se um reiniciar, o outro continua.

### Verificar se subiu

```bash
pm2 status

# Deve mostrar:
# api     online
# worker  online
```

### Health check

```bash
curl http://localhost:3000/health
# {"ok": true}
```

---

## 6. Configurar auto-start após reboot

```bash
pm2 save           # salva lista de processos atual
pm2 startup        # gera e exibe comando systemd — copie e execute o comando gerado
```

O comando gerado tem o formato:
```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME
```

Execute-o e então:
```bash
pm2 save           # salva novamente após startup configurado
```

---

## 7. Nginx como reverse proxy (recomendado)

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/emarsys-connector
```

```nginx
server {
    listen 80;
    server_name seu-dominio.com.br;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/emarsys-connector /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL com Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com.br
```

---

## 8. Comandos do dia a dia

```bash
# Status dos processos
pm2 status
npm run prod:status

# Logs ao vivo
npm run prod:logs           # logs da API
npm run prod:logs:worker    # logs do worker (crons)
npm run logs                # tail do log combinado do dia

# Reiniciar após atualização de código
git pull origin main
npm run prod:restart        # npm install + pm2 restart

# Reload sem downtime (se não houver mudança de dependências)
npm run prod:reload

# Parar tudo
npm run prod:stop

# Dashboard interativo PM2
npm run prod:monit
```

---

## 9. Atualizar para nova versão

```bash
cd ~/apps/Emarsys-Connector

git pull origin main
npm run prod:restart
```

O `prod:restart` executa `npm install` + `pm2 restart api worker`. As **migrations do SQLite rodam automaticamente** no boot — se houver migrations novas, o banco é atualizado sem intervenção manual.

---

## 10. Backup do banco de dados

O SQLite fica em `./data/orders.db`. Recomendado backup diário via crontab:

```bash
crontab -e
```

```bash
# Backup diário às 3h da manhã
0 3 * * * cp ~/apps/Emarsys-Connector/data/orders.db ~/backups/orders-$(date +\%Y\%m\%d).db

# Manter apenas os últimos 30 dias
0 4 * * * find ~/backups/ -name "orders-*.db" -mtime +30 -delete
```

```bash
mkdir -p ~/backups
```

---

## 11. Firewall

```bash
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
sudo ufw status
```

> Não é necessário expor a porta 3000 externamente se estiver usando Nginx.

---

## 12. Troubleshooting

### Processo não sobe

```bash
pm2 logs api --lines 50
pm2 logs worker --lines 50
```

Causa comum: variável de ambiente obrigatória ausente no `.env`.

### Migrations falhando no boot

```bash
# Ver o erro específico
pm2 logs worker --lines 20

# Verificar estado das migrations aplicadas
sqlite3 data/orders.db "SELECT * FROM migrations;"
```

### Cron de pedidos não dispara

Verificar se `ORDERS_SYNC_ENABLED=true` está no `.env` e se o worker está online:

```bash
pm2 status
curl http://localhost:3000/api/cron-management/status
```

### Pedidos não chegando no Emarsys

```bash
# Verificar pedidos pendentes no banco
sqlite3 data/orders.db "SELECT COUNT(*) FROM orders WHERE isSync=0;"

# Forçar envio manual
curl -X POST http://localhost:3000/api/emarsys/sales/send-unsynced
```

### Contatos travados em retry

```bash
curl http://localhost:3000/api/metrics/contacts/retry-status
```

---

## Checklist de go-live

- [ ] Node.js 22 instalado
- [ ] PM2 instalado globalmente
- [ ] Repositório clonado e `npm install` executado
- [ ] `.env` preenchido com todas as credenciais de produção
- [ ] `ORDERS_SYNC_ENABLED=true` no `.env`
- [ ] Diretórios `data/`, `exports/`, `logs/` criados
- [ ] `npm run prod` — api e worker `online` no `pm2 status`
- [ ] `curl http://localhost:3000/health` retorna `{"ok":true}`
- [ ] `pm2 save` + `pm2 startup` configurados
- [ ] Nginx configurado como reverse proxy
- [ ] SSL configurado
- [ ] Firewall habilitado
- [ ] Backup do SQLite agendado
- [ ] Cron de pedidos validado: `GET /api/cron-management/status`
