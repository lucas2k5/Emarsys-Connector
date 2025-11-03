FROM node:18-alpine

# Instalar dependências necessárias para SQLite e compilação
RUN apk add --no-cache python3 make g++ sqlite

# Criar diretório da aplicação
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código da aplicação
COPY . .

# Criar diretórios necessários
RUN mkdir -p data exports logs database/migrations

# Expor porta
EXPOSE 3000

# Comando de inicialização
CMD ["node", "--expose-gc", "--max-old-space-size=3072", "server.js"]

