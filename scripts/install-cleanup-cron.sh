#!/bin/bash

###############################################################################
# Script de instalação do Cron de Limpeza de Exports
# 
# Este script configura automaticamente o cron job para limpar arquivos
# antigos da pasta exports todo domingo às 00:00
#
# Uso: bash scripts/install-cleanup-cron.sh
###############################################################################

set -e  # Sair se houver erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para printar com cor
print_color() {
  color=$1
  message=$2
  echo -e "${color}${message}${NC}"
}

print_color "$BLUE" "═══════════════════════════════════════════════════════════"
print_color "$BLUE" "  🧹 Instalação do Cron de Limpeza de Exports"
print_color "$BLUE" "═══════════════════════════════════════════════════════════"
echo

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then 
  print_color "$RED" "❌ Este script precisa ser executado como root"
  echo "   Use: sudo bash scripts/install-cleanup-cron.sh"
  exit 1
fi

print_color "$GREEN" "✅ Executando como root"
echo

# Obter o diretório atual
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

print_color "$BLUE" "📂 Diretório do projeto: $PROJECT_DIR"
echo

# Verificar se o script existe
CLEANUP_SCRIPT="$PROJECT_DIR/scripts/cleanup-old-exports.js"
if [ ! -f "$CLEANUP_SCRIPT" ]; then
  print_color "$RED" "❌ Script de limpeza não encontrado: $CLEANUP_SCRIPT"
  exit 1
fi

print_color "$GREEN" "✅ Script de limpeza encontrado"
echo

# Detectar a porta do servidor
PORT=3000
if [ -f "$PROJECT_DIR/.env" ]; then
  PORT_FROM_ENV=$(grep "^PORT=" "$PROJECT_DIR/.env" | cut -d '=' -f2)
  if [ ! -z "$PORT_FROM_ENV" ]; then
    PORT=$PORT_FROM_ENV
  fi
fi

print_color "$BLUE" "🔌 Porta detectada: $PORT"
echo

# Pergunta ao usuário qual método usar
print_color "$YELLOW" "Escolha o método de instalação:"
echo "1) Crontab do sistema (Recomendado)"
echo "2) Executar via linha de comando no cron"
echo "3) Apenas mostrar instruções"
echo
read -p "Escolha uma opção (1-3): " choice

case $choice in
  1)
    print_color "$BLUE" "📋 Configurando crontab..."
    echo
    
    # Criar linha do cron
    CRON_LINE="0 0 * * 0 curl -X POST http://localhost:$PORT/api/cron/cleanup-exports > /var/log/emarsys-cleanup.log 2>&1"
    
    # Verificar se já existe
    if crontab -l 2>/dev/null | grep -q "cleanup-exports"; then
      print_color "$YELLOW" "⚠️  Cron job já existe no crontab"
      read -p "Deseja substituir? (s/N): " replace
      if [[ $replace =~ ^[Ss]$ ]]; then
        # Remover linha antiga
        crontab -l 2>/dev/null | grep -v "cleanup-exports" | crontab -
        print_color "$GREEN" "✅ Linha antiga removida"
      else
        print_color "$BLUE" "ℹ️  Mantendo configuração existente"
        exit 0
      fi
    fi
    
    # Adicionar ao crontab
    (crontab -l 2>/dev/null; echo "# Limpeza automática de exports - Todo domingo às 00:00"; echo "$CRON_LINE") | crontab -
    
    print_color "$GREEN" "✅ Cron job adicionado com sucesso!"
    echo
    print_color "$BLUE" "📋 Crontab atual:"
    crontab -l | grep -A1 "Limpeza automática"
    echo
    
    # Criar arquivo de log se não existir
    touch /var/log/emarsys-cleanup.log
    chmod 644 /var/log/emarsys-cleanup.log
    
    print_color "$GREEN" "✅ Arquivo de log criado: /var/log/emarsys-cleanup.log"
    echo
    
    print_color "$GREEN" "🎉 Instalação concluída!"
    print_color "$BLUE" "📅 O cron será executado todo domingo às 00:00"
    print_color "$BLUE" "📊 Logs disponíveis em: /var/log/emarsys-cleanup.log"
    ;;
    
  2)
    print_color "$BLUE" "📋 Configurando crontab com execução direta..."
    echo
    
    # Criar linha do cron com node
    CRON_LINE="0 0 * * 0 cd $PROJECT_DIR && /usr/bin/node scripts/cleanup-old-exports.js > /var/log/emarsys-cleanup.log 2>&1"
    
    # Verificar se já existe
    if crontab -l 2>/dev/null | grep -q "cleanup-old-exports"; then
      print_color "$YELLOW" "⚠️  Cron job já existe no crontab"
      read -p "Deseja substituir? (s/N): " replace
      if [[ $replace =~ ^[Ss]$ ]]; then
        # Remover linha antiga
        crontab -l 2>/dev/null | grep -v "cleanup-old-exports" | crontab -
        print_color "$GREEN" "✅ Linha antiga removida"
      else
        print_color "$BLUE" "ℹ️  Mantendo configuração existente"
        exit 0
      fi
    fi
    
    # Adicionar ao crontab
    (crontab -l 2>/dev/null; echo "# Limpeza automática de exports - Todo domingo às 00:00"; echo "$CRON_LINE") | crontab -
    
    print_color "$GREEN" "✅ Cron job adicionado com sucesso!"
    echo
    print_color "$BLUE" "📋 Crontab atual:"
    crontab -l | grep -A1 "Limpeza automática"
    echo
    
    # Criar arquivo de log se não existir
    touch /var/log/emarsys-cleanup.log
    chmod 644 /var/log/emarsys-cleanup.log
    
    print_color "$GREEN" "✅ Arquivo de log criado: /var/log/emarsys-cleanup.log"
    echo
    
    print_color "$GREEN" "🎉 Instalação concluída!"
    print_color "$BLUE" "📅 O cron será executado todo domingo às 00:00"
    print_color "$BLUE" "📊 Logs disponíveis em: /var/log/emarsys-cleanup.log"
    ;;
    
  3)
    print_color "$BLUE" "📖 Instruções de instalação manual:"
    echo
    print_color "$YELLOW" "1. Edite o crontab:"
    echo "   sudo crontab -e"
    echo
    print_color "$YELLOW" "2. Adicione a seguinte linha (via API):"
    echo "   0 0 * * 0 curl -X POST http://localhost:$PORT/api/cron/cleanup-exports > /var/log/emarsys-cleanup.log 2>&1"
    echo
    print_color "$YELLOW" "   OU (via linha de comando):"
    echo "   0 0 * * 0 cd $PROJECT_DIR && /usr/bin/node scripts/cleanup-old-exports.js > /var/log/emarsys-cleanup.log 2>&1"
    echo
    print_color "$YELLOW" "3. Salve e saia (ESC + :wq no vi/vim)"
    echo
    print_color "$YELLOW" "4. Verifique:"
    echo "   sudo crontab -l"
    echo
    ;;
    
  *)
    print_color "$RED" "❌ Opção inválida"
    exit 1
    ;;
esac

# Verificar se o serviço cron está ativo
if systemctl is-active --quiet cron; then
  print_color "$GREEN" "✅ Serviço cron está ativo"
else
  print_color "$YELLOW" "⚠️  Serviço cron não está ativo"
  read -p "Deseja iniciar o serviço cron? (S/n): " start_cron
  if [[ ! $start_cron =~ ^[Nn]$ ]]; then
    systemctl start cron
    systemctl enable cron
    print_color "$GREEN" "✅ Serviço cron iniciado e habilitado"
  fi
fi

echo
print_color "$BLUE" "═══════════════════════════════════════════════════════════"
print_color "$GREEN" "  ✅ Instalação concluída com sucesso!"
print_color "$BLUE" "═══════════════════════════════════════════════════════════"
echo

# Mostrar próximos passos
print_color "$YELLOW" "📝 Próximos passos:"
echo
print_color "$BLUE" "1. Testar manualmente (dry run):"
echo "   node scripts/cleanup-old-exports.js --dry-run"
echo
print_color "$BLUE" "2. Ver logs do cron:"
echo "   tail -f /var/log/emarsys-cleanup.log"
echo
print_color "$BLUE" "3. Verificar crontab:"
echo "   sudo crontab -l"
echo
print_color "$BLUE" "4. Documentação completa:"
echo "   cat docs/cleanup-cron-setup.md"
echo

exit 0

