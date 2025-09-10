const client = require('prom-client');
const { logHelpers } = require('./logger');

// Criar um Registry personalizado para as métricas
const register = new client.Registry();

// Adicionar métricas padrão do Node.js
client.collectDefaultMetrics({ register });

// Métricas personalizadas para a aplicação
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  registers: [register],
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total de requisições HTTP',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestErrors = new client.Counter({
  name: 'http_request_errors_total',
  help: 'Total de erros em requisições HTTP',
  labelNames: ['method', 'route', 'error_type', 'status_code'],
  registers: [register],
});

const activeConnections = new client.Gauge({
  name: 'active_connections',
  help: 'Número de conexões ativas',
  registers: [register],
});

const businessMetrics = {
  // Métricas de contatos
  contactsProcessed: new client.Counter({
    name: 'contacts_processed_total',
    help: 'Total de contatos processados',
    labelNames: ['status', 'source'],
    registers: [register],
  }),

  contactsImported: new client.Counter({
    name: 'contacts_imported_total',
    help: 'Total de contatos importados',
    labelNames: ['status', 'file_name'],
    registers: [register],
  }),

  // Métricas de produtos
  productsSynced: new client.Counter({
    name: 'products_synced_total',
    help: 'Total de produtos sincronizados',
    labelNames: ['status', 'source'],
    registers: [register],
  }),

  // Métricas de vendas
  salesProcessed: new client.Counter({
    name: 'sales_processed_total',
    help: 'Total de vendas processadas',
    labelNames: ['status', 'source'],
    registers: [register],
  }),

  // Métricas de integração
  integrationCalls: new client.Counter({
    name: 'integration_calls_total',
    help: 'Total de chamadas para APIs externas',
    labelNames: ['service', 'endpoint', 'status'],
    registers: [register],
  }),

  integrationDuration: new client.Histogram({
    name: 'integration_duration_seconds',
    help: 'Duração das chamadas para APIs externas',
    labelNames: ['service', 'endpoint'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [register],
  }),

  // Métricas de jobs em background
  backgroundJobsExecuted: new client.Counter({
    name: 'background_jobs_executed_total',
    help: 'Total de jobs em background executados',
    labelNames: ['job_type', 'status'],
    registers: [register],
  }),

  backgroundJobDuration: new client.Histogram({
    name: 'background_job_duration_seconds',
    help: 'Duração dos jobs em background',
    labelNames: ['job_type'],
    buckets: [1, 5, 10, 30, 60, 300, 600],
    registers: [register],
  }),

  // Métricas de cron jobs
  cronJobsExecuted: new client.Counter({
    name: 'cron_jobs_executed_total',
    help: 'Total de cron jobs executados',
    labelNames: ['job_name', 'status'],
    registers: [register],
  }),

  // Métricas de memória e performance
  memoryUsage: new client.Gauge({
    name: 'memory_usage_bytes',
    help: 'Uso de memória em bytes',
    labelNames: ['type'],
    registers: [register],
  }),

  // Métricas de arquivos
  filesProcessed: new client.Counter({
    name: 'files_processed_total',
    help: 'Total de arquivos processados',
    labelNames: ['file_type', 'status'],
    registers: [register],
  }),

  fileSize: new client.Histogram({
    name: 'file_size_bytes',
    help: 'Tamanho dos arquivos processados',
    labelNames: ['file_type'],
    buckets: [1024, 10240, 102400, 1048576, 10485760, 104857600],
    registers: [register],
  }),
};

// Função para atualizar métricas de memória
const updateMemoryMetrics = () => {
  const memUsage = process.memoryUsage();
  businessMetrics.memoryUsage.set({ type: 'rss' }, memUsage.rss);
  businessMetrics.memoryUsage.set({ type: 'heapTotal' }, memUsage.heapTotal);
  businessMetrics.memoryUsage.set({ type: 'heapUsed' }, memUsage.heapUsed);
  businessMetrics.memoryUsage.set({ type: 'external' }, memUsage.external);
};

// Atualizar métricas de memória a cada 30 segundos
setInterval(updateMemoryMetrics, 30000);

// Funções auxiliares para registrar métricas
const metricsHelpers = {
  // Registrar requisição HTTP
  recordHttpRequest: (method, route, statusCode, duration) => {
    const labels = {
      method: method.toUpperCase(),
      route: route || 'unknown',
      status_code: statusCode.toString(),
    };

    httpRequestTotal.inc(labels);
    httpRequestDuration.observe(labels, duration / 1000);

    // Registrar erro se status >= 400
    if (statusCode >= 400) {
      const errorType = statusCode >= 500 ? 'server_error' : 'client_error';
      httpRequestErrors.inc({
        ...labels,
        error_type: errorType,
      });
    }
  },

  // Registrar contatos processados
  recordContactsProcessed: (count, status, source) => {
    businessMetrics.contactsProcessed.inc(
      { status, source },
      count
    );
  },

  // Registrar contatos importados
  recordContactsImported: (count, status, fileName) => {
    businessMetrics.contactsImported.inc(
      { status, source: fileName },
      count
    );
  },

  // Registrar produtos sincronizados
  recordProductsSynced: (count, status, source) => {
    businessMetrics.productsSynced.inc(
      { status, source },
      count
    );
  },

  // Registrar vendas processadas
  recordSalesProcessed: (count, status, source) => {
    businessMetrics.salesProcessed.inc(
      { status, source },
      count
    );
  },

  // Registrar chamada de integração
  recordIntegrationCall: (service, endpoint, status, duration) => {
    const labels = { service, endpoint, status };
    businessMetrics.integrationCalls.inc(labels);
    
    if (duration !== undefined) {
      businessMetrics.integrationDuration.observe(
        { service, endpoint },
        duration / 1000
      );
    }
  },

  // Registrar job em background
  recordBackgroundJob: (jobType, status, duration) => {
    businessMetrics.backgroundJobsExecuted.inc({ job_type: jobType, status });
    
    if (duration !== undefined) {
      businessMetrics.backgroundJobDuration.observe(
        { job_type: jobType },
        duration / 1000
      );
    }
  },

  // Registrar cron job
  recordCronJob: (jobName, status) => {
    businessMetrics.cronJobsExecuted.inc({ job_name: jobName, status });
  },

  // Registrar arquivo processado
  recordFileProcessed: (fileType, status, size) => {
    businessMetrics.filesProcessed.inc({ file_type: fileType, status });
    
    if (size !== undefined) {
      businessMetrics.fileSize.observe({ file_type: fileType }, size);
    }
  },

  // Registrar conexão ativa
  setActiveConnections: (count) => {
    activeConnections.set(count);
  },
};

// Middleware para capturar métricas de requisições HTTP
const metricsMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;

  res.send = function (body) {
    const duration = Date.now() - startTime;
    const route = req.route ? req.route.path : req.path;
    
    metricsHelpers.recordHttpRequest(req.method, route, res.statusCode, duration);
    
    // Log da requisição
    logHelpers.logRequest(req, res, duration);
    
    originalSend.call(this, body);
  };

  next();
};

// Função para obter métricas em formato Prometheus
const getMetrics = async () => {
  return register.metrics();
};

// Função para obter métricas em formato JSON
const getMetricsAsJSON = async () => {
  return register.getMetricsAsJSON();
};

module.exports = {
  register,
  businessMetrics,
  metricsHelpers,
  metricsMiddleware,
  getMetrics,
  getMetricsAsJSON,
  updateMemoryMetrics,
};
