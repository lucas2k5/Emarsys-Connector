# Guia de Deploy na VPS - Emarsys Connector

Este guia fornece instruções completas para fazer o deploy da aplicação Docker na sua VPS.

## 📋 Pré-requisitos da VPS

### Requisitos Mínimos de Hardware
- **CPU**: 2 cores ou mais
- **RAM**: 2GB mínimo (4GB recomendado)
- **Disco**: 20GB de espaço livre
- **Sistema Operacional**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+ (recomendado Ubuntu 22.04 LTS)

### Requisitos de Software
- Acesso SSH à VPS
- Usuário com permissões sudo
- Conexão com internet estável

## 🚀 Passo a Passo Completo

### 1. Conectar na VPS via SSH

```bash
ssh usuario@ip-da-vps
# Exemplo: ssh root@192.168.1.100
```

### 2. Atualizar o Sistema

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

### 3. Instalar Docker

#### Para Ubuntu/Debian:

```bash
# Remover versões antigas (se houver)
sudo apt remove docker docker-engine docker.io containerd runc

# Instalar dependências
sudo apt install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Adicionar chave GPG oficial do Docker
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Adicionar repositório Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker Engine e Docker Compose
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verificar instalação
docker --version
docker compose version
```

#### Para CentOS/RHEL:

```bash
# Instalar dependências
sudo yum install -y yum-utils

# Adicionar repositório Docker
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# Instalar Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Iniciar e habilitar Docker
sudo systemctl start docker
sudo systemctl enable docker

# Verificar instalação
docker --version
docker compose version
```

### 4. Configurar Docker (Opcional mas Recomendado)

```bash
# Adicionar seu usuário ao grupo docker (para não precisar usar sudo)
sudo usermod -aG docker $USER

# Aplicar mudanças (ou fazer logout/login)
newgrp docker

# Verificar que funciona sem sudo
docker ps
```

### 5. Instalar Git (se não estiver instalado)

```bash
# Ubuntu/Debian
sudo apt install -y git

# CentOS/RHEL
sudo yum install -y git
```

### 6. Clonar o Repositório

```bash
# Criar diretório para aplicações (opcional)
mkdir -p ~/apps
cd ~/apps

# Clonar o repositório
git clone <URL_DO_SEU_REPOSITORIO> hope.emarsys-connector
cd hope.emarsys-connector

# Ou se já tiver o código, fazer upload via SCP/SFTP e extrair
```

### 7. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp env.example .env

# Editar o arquivo .env com suas credenciais
nano .env
# ou
vi .env
```

**Configurações essenciais no `.env`:**

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
BASE_URL=https://seu-dominio.com  # ou IP da VPS

# VTEX Configuration
VTEX_ACCOUNT_NAME=seu_account_name
VTEX_APP_KEY=seu_app_key
VTEX_APP_TOKEN=seu_app_token
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

# Configuração de Cron Jobs (opcional)
PRODUCTS_SYNC_CRON=0 */8 * * *
ORDERS_SYNC_CRON=*/30 * * * *
CRON_TIMEZONE=America/Sao_Paulo
```

**Salvar e sair:**
- Nano: `Ctrl+X`, depois `Y`, depois `Enter`
- Vi: `Esc`, depois `:wq`, depois `Enter`

### 8. Criar Diretórios Necessários

```bash
# Criar diretórios para persistência de dados
mkdir -p data exports logs database/migrations

# Ajustar permissões (se necessário)
chmod -R 755 data exports logs
```

### 9. Build e Iniciar a Aplicação

```bash
# Primeira vez: build e start
docker compose up --build -d

# Verificar se está rodando
docker compose ps

# Ver logs
docker compose logs -f
```

### 10. Verificar se a Aplicação Está Funcionando

```bash
# Verificar health check
curl http://localhost:3000/api/health

# Ou de fora da VPS (substitua pelo IP da VPS)
curl http://IP_DA_VPS:3000/api/health
```

### 11. Configurar Firewall (Opcional mas Recomendado)

#### Ubuntu/Debian (UFW):

```bash
# Instalar UFW (se não estiver instalado)
sudo apt install -y ufw

# Permitir SSH (importante fazer antes de habilitar!)
sudo ufw allow 22/tcp

# Permitir porta da aplicação
sudo ufw allow 3000/tcp

# Habilitar firewall
sudo ufw enable

# Verificar status
sudo ufw status
```

#### CentOS/RHEL (firewalld):

```bash
# Permitir SSH
sudo firewall-cmd --permanent --add-service=ssh

# Permitir porta da aplicação
sudo firewall-cmd --permanent --add-port=3000/tcp

# Recarregar firewall
sudo firewall-cmd --reload

# Verificar status
sudo firewall-cmd --list-all
```

## 🔧 Comandos Úteis para Gerenciamento

### Ver Status dos Containers

```bash
docker compose ps
```

### Ver Logs

```bash
# Todos os logs em tempo real
docker compose logs -f

# Últimas 100 linhas
docker compose logs --tail=100

# Logs apenas do serviço app
docker compose logs -f app
```

### Parar a Aplicação

```bash
# Parar containers (mantém dados)
docker compose stop

# Parar e remover containers (mantém volumes)
docker compose down

# Parar e remover tudo incluindo volumes (⚠️ apaga dados!)
docker compose down -v
```

### Reiniciar a Aplicação

```bash
# Reiniciar containers
docker compose restart

# Rebuild e reiniciar (após mudanças no código)
docker compose up --build -d
```

### Atualizar a Aplicação

```bash
# 1. Parar containers
docker compose down

# 2. Atualizar código (se usando Git)
git pull origin main

# 3. Rebuild e iniciar
docker compose up --build -d

# 4. Verificar logs
docker compose logs -f
```

## 🔍 Verificação e Monitoramento

### Verificar Saúde da Aplicação

```bash
# Health check
curl http://localhost:3000/api/health

# Status dos cron jobs
curl http://localhost:3000/api/cron-management/status

# Métricas
curl http://localhost:3000/api/metrics
```

### Verificar Banco de Dados SQLite

```bash
# Estatísticas do banco
docker compose exec app node -e "
const {getDatabase} = require('./database/sqlite');
const db = getDatabase();
db.init().then(() => {
  const stats = db.getStats();
  console.log(JSON.stringify(stats, null, 2));
  db.close();
});
"
```

### Monitorar Uso de Recursos

```bash
# Estatísticas de uso dos containers
docker stats

# Apenas containers do projeto
docker stats $(docker compose ps -q)
```

## 🔄 Configurar Auto-start (Opcional)

### Usando systemd (Recomendado)

Criar arquivo de serviço systemd:

```bash
sudo nano /etc/systemd/system/emarsys-connector.service
```

Conteúdo do arquivo:

```ini
[Unit]
Description=Emarsys Connector Docker Compose
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/usuario/apps/hope.emarsys-connector
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0
User=usuario
Group=docker

[Install]
WantedBy=multi-user.target
```

**Substituir:**
- `/home/usuario/apps/hope.emarsys-connector` pelo caminho real do projeto
- `usuario` pelo seu usuário

Ativar o serviço:

```bash
# Recarregar systemd
sudo systemctl daemon-reload

# Habilitar para iniciar no boot
sudo systemctl enable emarsys-connector.service

# Iniciar agora
sudo systemctl start emarsys-connector.service

# Verificar status
sudo systemctl status emarsys-connector.service
```

## 🔒 Segurança Adicional

### 1. Configurar Nginx como Reverse Proxy (Recomendado para Produção)

```bash
# Instalar Nginx
sudo apt install -y nginx  # Ubuntu/Debian
# ou
sudo yum install -y nginx  # CentOS/RHEL

# Criar configuração
sudo nano /etc/nginx/sites-available/emarsys-connector
```

Configuração do Nginx:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;  # ou IP da VPS

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ativar configuração:

```bash
# Ubuntu/Debian
sudo ln -s /etc/nginx/sites-available/emarsys-connector /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# CentOS/RHEL
sudo cp /etc/nginx/sites-available/emarsys-connector /etc/nginx/conf.d/emarsys-connector.conf
sudo nginx -t
sudo systemctl restart nginx
```

### 2. Configurar SSL com Let's Encrypt (Recomendado)

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx  # Ubuntu/Debian
# ou
sudo yum install -y certbot python3-certbot-nginx  # CentOS/RHEL

# Obter certificado SSL
sudo certbot --nginx -d seu-dominio.com

# Renovação automática (já configurado por padrão)
sudo certbot renew --dry-run
```

### 3. Restringir Acesso por IP (Opcional)

Editar configuração do Nginx para permitir apenas IPs específicos:

```nginx
location / {
    allow 192.168.1.0/24;  # Sua rede
    allow 203.0.113.0/24;  # Outro IP/rede
    deny all;
    
    proxy_pass http://localhost:3000;
    # ... resto da configuração
}
```

## 💾 Backup dos Dados

### Backup Manual

```bash
# Criar diretório de backup
mkdir -p ~/backups/emarsys-connector

# Backup do banco SQLite
docker compose exec app cp /app/data/orders.db /tmp/orders.db
docker compose cp app:/tmp/orders.db ~/backups/emarsys-connector/orders-$(date +%Y%m%d-%H%M%S).db

# Backup de exports e logs (opcional)
tar -czf ~/backups/emarsys-connector/exports-$(date +%Y%m%d).tar.gz exports/
tar -czf ~/backups/emarsys-connector/logs-$(date +%Y%m%d).tar.gz logs/
```

### Backup Automatizado com Cron

```bash
# Editar crontab
crontab -e

# Adicionar linha para backup diário às 2h da manhã
0 2 * * * cd ~/apps/hope.emarsys-connector && docker compose exec -T app cp /app/data/orders.db /tmp/orders.db && docker compose cp app:/tmp/orders.db ~/backups/emarsys-connector/orders-$(date +\%Y\%m\%d).db
```

## 🐛 Troubleshooting

### Container não inicia

```bash
# Ver logs detalhados
docker compose logs app

# Verificar se porta está em uso
sudo netstat -tulpn | grep 3000
# ou
sudo ss -tulpn | grep 3000

# Verificar espaço em disco
df -h
```

### Erro de permissão

```bash
# Ajustar permissões dos diretórios
sudo chown -R $USER:$USER data/ exports/ logs/

# Ou no container
docker compose exec app chown -R node:node /app/data
```

### Aplicação não responde

```bash
# Verificar se container está rodando
docker compose ps

# Verificar logs de erro
docker compose logs --tail=50 app

# Reiniciar container
docker compose restart app
```

### Problemas de memória

```bash
# Verificar uso de memória
free -h
docker stats

# Limpar recursos não utilizados
docker system prune -a
```

## 📊 Monitoramento Contínuo

### Verificar Status Regularmente

```bash
# Criar script de monitoramento
nano ~/check-emarsys.sh
```

Conteúdo:

```bash
#!/bin/bash
echo "=== Status dos Containers ==="
docker compose ps

echo -e "\n=== Health Check ==="
curl -s http://localhost:3000/api/health || echo "ERRO: Aplicação não está respondendo"

echo -e "\n=== Uso de Recursos ==="
docker stats --no-stream $(docker compose ps -q)
```

Tornar executável:

```bash
chmod +x ~/check-emarsys.sh
```

## ✅ Checklist de Deploy

- [ ] Docker e Docker Compose instalados
- [ ] Repositório clonado/uploadado na VPS
- [ ] Arquivo `.env` configurado com todas as credenciais
- [ ] Diretórios `data`, `exports`, `logs` criados
- [ ] Aplicação buildada e iniciada com sucesso
- [ ] Health check respondendo corretamente
- [ ] Firewall configurado (opcional)
- [ ] Nginx configurado como reverse proxy (opcional)
- [ ] SSL configurado (opcional)
- [ ] Auto-start configurado (opcional)
- [ ] Backup configurado (opcional)
- [ ] Monitoramento configurado (opcional)

## 📚 Próximos Passos

- [Documentação Docker](./docker-setup.md)
- [Guia de Configuração do Servidor](./server-setup-guide.md)
- [Exemplos de CURL](./curl-examples.md)
- [Documentação do Serviço de Sincronização de Pedidos](./orders-sync-service.md)

## 🆘 Suporte

Em caso de problemas:
1. Verificar logs: `docker compose logs -f`
2. Verificar status: `docker compose ps`
3. Verificar health: `curl http://localhost:3000/api/health`
4. Consultar documentação adicional na pasta `docs/`

