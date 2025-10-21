# Guia de Configuração do Servidor Linux - Emarsys Connector

Este documento fornece um passo a passo completo para configurar um servidor Linux para executar o Emarsys Connector.

## 📋 Pré-requisitos

- Servidor Linux (Ubuntu 20.04+ ou similar)
- Acesso root ou sudo
- Domínio/IP público configurado
- Certificados SSL (opcional, mas recomendado)

## 🔧 1. Preparação do Sistema

### 1.1 Atualizar o sistema

```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 Instalar dependências básicas

```bash
sudo apt install -y curl wget git unzip software-properties-common
```

## 🐍 2. Instalação do Node.js

### 2.1 Instalar Node.js 18+ (recomendado)

```bash
# Instalar Node.js via NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verificar instalação
node --version
npm --version
```

### 2.2 Instalar PM2 globalmente

```bash
sudo npm install -g pm2
```

## 🌐 3. Configuração do Nginx

### 3.1 Instalar Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 3.2 Configurar Nginx principal

Criar/editar `/etc/nginx/nginx.conf`:

```nginx
user www-data;
worker_processes auto;
pid /run/nginx.pid;
error_log /var/log/nginx/error.log;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 768;
    # multi_accept on;
}

http {
    ##
    # Basic Settings
    ##
    limit_req_zone $binary_remote_addr zone=api_zone:10m  rate=10r/s;
    limit_req_zone $binary_remote_addr zone=site_zone:10m rate=2r/s;
    limit_conn_zone $binary_remote_addr zone=conns:10m;

    sendfile on;
    tcp_nopush on;
    types_hash_max_size 2048;
    # server_tokens off;

    # server_names_hash_bucket_size 64;
    # server_name_in_redirect off;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    ##
    # SSL Settings
    ##

    ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3; # Dropping SSLv3, ref: POODLE
    ssl_prefer_server_ciphers on;

    ##
    # Logging Settings
    ##

    access_log /var/log/nginx/access.log;

    ##
    # Gzip Settings
    ##

    gzip on;

    # gzip_vary on;
    # gzip_proxied any;
    # gzip_comp_level 6;
    # gzip_buffers 16 8k;
    # gzip_http_version 1.1;
    # gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    ##
    # Virtual Host Configs
    ##

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

### 3.3 Configurar site do Emarsys Connector

Criar `/etc/nginx/sites-available/emarsys`:

```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name SEU_DOMINIO_OU_IP;  # Substitua pelo seu domínio ou IP

    # 🔒 Corta WebDAV (PROPFIND etc.) sem gastar bucket de rate limit
    if ($request_method ~* (PROPFIND|PROPPATCH|MKCOL|COPY|MOVE|LOCK|UNLOCK|DELETE)) {
        return 405;
    }

    # ── API (zone própria e tolerante) ────────────────────────────────────────────
    location /api/ {
        limit_req zone=api_zone burst=20 nodelay;
        limit_conn conns 50;

        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_cache_bypass $http_upgrade;

        proxy_connect_timeout 600s;
        proxy_send_timeout    600s;
        proxy_read_timeout    600s;
        send_timeout          600s;

        proxy_buffering       off;
        proxy_buffer_size     128k;
        proxy_buffers         4 256k;
        proxy_busy_buffers_size 256k;
    }

    # (Opcional) rota crítica SEM limit ou com burst maior
    location = /api/integration/orders-extract-all {
        # comente a linha abaixo para SEM rate limit nesta rota:
        limit_req zone=api_zone burst=60 nodelay;

        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # ── Raiz (onde scanners batem) com limite mais rígido ─────────────────────────
    location / {
        limit_req zone=site_zone burst=5 nodelay;

        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Connection        "upgrade";
        proxy_cache_bypass $http_upgrade;

        proxy_connect_timeout 600s;
        proxy_send_timeout    600s;
        proxy_read_timeout    600s;
        send_timeout          600s;

        proxy_buffering       off;
        proxy_buffer_size     128k;
        proxy_buffers         4 256k;
        proxy_busy_buffers_size 256k;
    }
}
```

### 3.4 Ativar configuração do site

```bash
# Criar link simbólico
sudo ln -s /etc/nginx/sites-available/emarsys /etc/nginx/sites-enabled/

# Remover site padrão (opcional)
sudo rm /etc/nginx/sites-enabled/default

# Testar configuração
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

## 📁 4. Deploy da Aplicação

### 4.1 Criar diretório da aplicação

```bash
sudo mkdir -p /opt/emarsys-connector
sudo chown $USER:$USER /opt/emarsys-connector
cd /opt/emarsys-connector
```

### 4.2 Clonar o repositório

```bash
# Substitua pela URL do seu repositório
git clone https://github.com/seu-usuario/emarsys-connector.git .
```

### 4.3 Instalar dependências

```bash
npm install
```

### 4.4 Configurar variáveis de ambiente

```bash
# Copiar arquivo de exemplo
cp env.example .env

# Editar configurações
nano .env
```

**Configurações essenciais no `.env`:**

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
BASE_URL=https://seu-dominio.com

# VTEX Configuration
VTEX_ACCOUNT_NAME=seu_account_name
VTEX_APP_KEY=seu_app_key
VTEX_APP_TOKEN=seu_app_token
VTEX_AUTH_TOKEN=seu_auth_token_aqui
VTEX_BASE_URL=https://{account}.myvtex.com

# Emarsys Configuration
EMARSYS_SALES_TOKEN=seu_token_fixo_emarsys
EMARSYS_USER=seu_username_emarsys
EMARSYS_SECRET=sua_senha_emarsys
EMARSYS_ENDPOINT=https://api.emarsys.net/api/v2

# SFTP Configuration para Emarsys
SFTP_HOST=191.252.83.193
SFTP_PORT=22
SFTP_USERNAME=openflowpiccadil1
SFTP_PASSWORD=8GN8pzotQ9Ju1!!@
SFTP_REMOTE_PATH=/home/storage/d/aa/5d/openflowpiccadil1/catalog/catalog.csv.gz

# Configuração de Monitoramento
LOG_LEVEL=error
ALERT_ERROR_RATE=0.05
ALERT_RESPONSE_TIME=3000
ALERT_MEMORY_USAGE=0.85
ALERT_CONSECUTIVE_ERRORS=3
```

## 🚀 5. Configuração do PM2

### 5.1 Iniciar aplicação com PM2

```bash
# Usar configuração de produção
npm run prod

# Verificar status
pm2 status

# Ver logs
pm2 logs emarsys-server
```

### 5.2 Configurar PM2 para iniciar automaticamente

```bash
# Salvar configuração atual
pm2 save

# Configurar para iniciar no boot
pm2 startup

# Seguir as instruções exibidas (geralmente um comando sudo)
```

## 🔒 6. Configuração de SSL (Opcional mas Recomendado)

### 6.1 Usando Certbot (Let's Encrypt)

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obter certificado (substitua pelo seu domínio)
sudo certbot --nginx -d seu-dominio.com

# Testar renovação automática
sudo certbot renew --dry-run
```

### 6.2 Configuração manual de SSL

Se você tem certificados próprios, adicione ao arquivo de configuração do Nginx:

```nginx
server {
    listen 443 ssl;
    server_name seu-dominio.com;
  
    ssl_certificate /caminho/para/seu-certificado.crt;
    ssl_certificate_key /caminho/para/sua-chave-privada.key;
  
    # ... resto da configuração
}
```

## 📊 7. Monitoramento e Logs

### 7.1 Verificar logs da aplicação

```bash
# Logs do PM2
pm2 logs emarsys-server

# Logs do Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Logs da aplicação
tail -f /opt/emarsys-connector/logs/piccadilly-emarsys-$(date +%Y-%m-%d).log
```

### 7.2 Dashboards de monitoramento

- **Métricas**: `http://seu-dominio.com/api/metrics/dashboard`
- **Alertas**: `http://seu-dominio.com/api/alerts/dashboard`
- **Health Check**: `http://seu-dominio.com/health`

## 🔧 8. Comandos de Manutenção

### 8.1 Gerenciamento da aplicação

```bash
# Parar aplicação
npm run prod:stop

# Reiniciar aplicação
npm run prod:restart

# Recarregar aplicação (sem downtime)
npm run prod:reload

# Ver status
npm run prod:status

# Ver logs
npm run prod:logs
```

### 8.2 Limpeza de logs

```bash
# Limpar logs antigos
npm run clear-logs

# Script de limpeza automática
node scripts/cleanup-old-logs.js
```

## 🛡️ 9. Segurança

### 9.1 Configurar firewall

```bash
# Instalar UFW
sudo apt install -y ufw

# Configurar regras básicas
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443

# Ativar firewall
sudo ufw enable
```

### 9.2 Configurar fail2ban (opcional)

```bash
# Instalar fail2ban
sudo apt install -y fail2ban

# Configurar para Nginx
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Editar configuração
sudo nano /etc/fail2ban/jail.local

# Reiniciar fail2ban
sudo systemctl restart fail2ban
```

## 🔄 10. Backup e Recuperação

### 10.1 Backup da aplicação

```bash
# Criar script de backup
cat > /opt/backup-emarsys.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/emarsys-$DATE"

mkdir -p $BACKUP_DIR
cp -r /opt/emarsys-connector $BACKUP_DIR/
tar -czf "/opt/backups/emarsys-$DATE.tar.gz" -C /opt/backups "emarsys-$DATE"
rm -rf $BACKUP_DIR

# Manter apenas os últimos 7 backups
find /opt/backups -name "emarsys-*.tar.gz" -mtime +7 -delete
EOF

chmod +x /opt/backup-emarsys.sh
```

### 10.2 Configurar backup automático

```bash
# Adicionar ao crontab
crontab -e

# Adicionar linha para backup diário às 2h
0 2 * * * /opt/backup-emarsys.sh
```

## ✅ 11. Verificação Final

### 11.1 Testes de conectividade

```bash
# Testar aplicação localmente
curl http://localhost:3000/health

# Testar através do Nginx
curl http://seu-dominio.com/health

# Testar API
curl http://seu-dominio.com/api/metrics/dashboard
```

### 11.2 Verificar status dos serviços

```bash
# Status do PM2
pm2 status

# Status do Nginx
sudo systemctl status nginx

# Status dos logs
pm2 logs emarsys-server --lines 50
```

## 🚨 12. Troubleshooting

### 12.1 Problemas comuns

**Aplicação não inicia:**

```bash
# Verificar logs
pm2 logs emarsys-server --err

# Verificar configuração
node -c server.js

# Verificar variáveis de ambiente
node -e "console.log(process.env)"
```

**Nginx retorna 502 Bad Gateway:**

```bash
# Verificar se aplicação está rodando
pm2 status

# Verificar logs do Nginx
sudo tail -f /var/log/nginx/error.log

# Testar conectividade
curl http://127.0.0.1:3000/health
```

**Problemas de memória:**

```bash
# Verificar uso de memória
pm2 monit

# Reiniciar se necessário
pm2 restart emarsys-server
```

### 12.2 Logs importantes

- **Aplicação**: `/opt/emarsys-connector/logs/`
- **PM2**: `pm2 logs emarsys-server`
- **Nginx**: `/var/log/nginx/`
- **Sistema**: `/var/log/syslog`

## 📞 13. Suporte

Para problemas específicos:

1. Verificar logs da aplicação
2. Verificar status dos serviços
3. Consultar documentação da API
4. Verificar configurações de rede

---

**Nota**: Este guia assume um ambiente de produção. Para desenvolvimento, algumas configurações podem ser simplificadas.
