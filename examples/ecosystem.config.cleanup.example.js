/**
 * Exemplo de configuração do PM2 com Cron de Limpeza
 * 
 * Para usar este exemplo:
 * 1. Copie este conteúdo para o seu ecosystem.config.js
 * 2. Adicione a configuração do cleanup-cron
 * 3. Reinicie o PM2: pm2 restart ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      name: 'emarsys-server',
      script: './server.js',
      instances: 1,
      exec_mode: 'cluster',
      max_memory_restart: '2G',
      node_args: '--expose-gc --max-old-space-size=3072',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 10000,
      kill_timeout: 5000
    },
    
    // ========================================================
    // CRON DE LIMPEZA AUTOMÁTICA
    // ========================================================
    {
      name: 'cleanup-exports-cron',
      script: './scripts/cleanup-old-exports.js',
      instances: 1,
      exec_mode: 'fork',
      cron_restart: '0 0 * * 0', // Todo domingo às 00:00
      autorestart: false, // Não reiniciar automaticamente (só pelo cron)
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/cleanup-error.log',
      out_file: './logs/cleanup-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    }
  ],

  /**
   * Deployment section
   * http://pm2.keymetrics.io/docs/usage/deployment/
   */
  deploy: {
    production: {
      user: 'node',
      host: '212.83.163.1',
      ref: 'origin/master',
      repo: 'git@github.com:repo.git',
      path: '/var/www/production',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
};

/**
 * INSTRUÇÕES DE USO:
 * 
 * 1. Iniciar todos os apps (incluindo o cron):
 *    pm2 start ecosystem.config.js --env production
 * 
 * 2. Ver status:
 *    pm2 status
 * 
 * 3. Ver logs do cron:
 *    pm2 logs cleanup-exports-cron
 * 
 * 4. Parar o cron:
 *    pm2 stop cleanup-exports-cron
 * 
 * 5. Iniciar o cron:
 *    pm2 start cleanup-exports-cron
 * 
 * 6. Deletar o cron:
 *    pm2 delete cleanup-exports-cron
 * 
 * 7. Executar manualmente:
 *    pm2 restart cleanup-exports-cron
 * 
 * 8. Salvar configuração:
 *    pm2 save
 * 
 * IMPORTANTE:
 * - O cron_restart do PM2 requer a versão 5.0 ou superior
 * - Se sua versão do PM2 não suporta cron_restart, use o crontab do sistema
 * - O cron executará apenas quando o processo estiver "stopped" e será
 *   reiniciado no horário especificado
 */

