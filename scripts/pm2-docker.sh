#!/bin/sh
# Helper script para executar comandos PM2 no Docker
# Uso: docker-compose exec app sh scripts/pm2-docker.sh <comando>
# Exemplos:
#   docker-compose exec app sh scripts/pm2-docker.sh logs --time
#   docker-compose exec app sh scripts/pm2-docker.sh status
#   docker-compose exec app sh scripts/pm2-docker.sh monit

cd /app
./node_modules/.bin/pm2 "$@"

