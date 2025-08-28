module.exports = {
  apps: [{
    name: 'emarsys-server',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    cron_restart: '0 2 * * *', // Reinicia todos os dias às 2h da manhã
    max_restarts: 10,
    min_uptime: '10s'
  }]
}; 