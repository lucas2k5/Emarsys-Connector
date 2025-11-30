# Helper script PowerShell para executar comandos PM2 no Docker
# Uso: .\scripts\pm2-docker.ps1 <comando>
# Exemplos:
#   .\scripts\pm2-docker.ps1 logs --time
#   .\scripts\pm2-docker.ps1 status
#   .\scripts\pm2-docker.ps1 monit

param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Pm2Args
)

$command = "docker-compose exec app ./node_modules/.bin/pm2 $($Pm2Args -join ' ')"
Invoke-Expression $command

