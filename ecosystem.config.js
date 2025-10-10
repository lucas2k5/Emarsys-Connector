module.exports = {
  apps: [{
    name: 'emarsys-server',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '3G',
    node_args: '--expose-gc --max-old-space-size=3072',
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      HOST: '0.0.0.0',
      LOG_LEVEL: 'info',
      ALERT_ERROR_RATE: 0.1,
      ALERT_RESPONSE_TIME: 5000,
      ALERT_MEMORY_USAGE: 0.9,
      ALERT_CONSECUTIVE_ERRORS: 5,
      NODE_OPTIONS: '--expose-gc --max-old-space-size=3072'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '0.0.0.0',
      LOG_LEVEL: 'error',
      ALERT_ERROR_RATE: 0.05,
      ALERT_RESPONSE_TIME: 3000,
      ALERT_MEMORY_USAGE: 0.85,
      ALERT_CONSECUTIVE_ERRORS: 3,
      NODE_OPTIONS: '--expose-gc --max-old-space-size=3072'
    },
    error_file: './logs/ems-pcy-pm2-err.log',
    out_file: './logs/ems-pcy-pm2-out.log',
    log_file: './logs/ems-pcy-pm2-combined.log',
    time: true,
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 3000,
    listen_timeout: 3000,
    shutdown_with_message: true
  }]
};