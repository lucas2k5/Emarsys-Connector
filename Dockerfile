FROM node:18-alpine

# Instalar dependências necessárias para SQLite e compilação
RUN apk add --no-cache python3 make g++ sqlite

# Criar diretório da aplicação
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências (ignorar scripts postinstall - diretórios são criados manualmente)
RUN npm ci --omit=dev --ignore-scripts

# Compilar better-sqlite3 manualmente (módulo nativo que precisa ser compilado)
RUN npm rebuild better-sqlite3

# Copiar código da aplicação
COPY . .

# Criar diretórios necessários
RUN mkdir -p data exports logs database/migrations

# Expor porta
EXPOSE 3000

# Comando de inicialização com PM2
# Usando caminho direto do node_modules/.bin para garantir que encontre o pm2-runtime
CMD ["./node_modules/.bin/pm2-runtime", "start", "ecosystem.config.js", "--env", "production"]

