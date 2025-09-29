const moment = require('moment-timezone');

/**
 * Calcula o período de sincronização baseado na expressão do cron ORDERS_SYNC_CRON
 * @returns {Object|null} Objeto com startDate, toDate e type, ou null se não conseguir calcular
 */
function calculatePeriodFromCron() {
  const cronExpression = process.env.ORDERS_SYNC_CRON;
  const timezone = process.env.CRON_TIMEZONE || 'America/Sao_Paulo';
  
  if (!cronExpression) {
    console.warn('⚠️ ORDERS_SYNC_CRON não configurado');
    return null;
  }
  
  console.log(`🕐 Analisando cron expression: ${cronExpression} (timezone: ${timezone})`);
  
  try {
    const now = moment().tz(timezone);
    const period = analyzeCronExpression(cronExpression, now);
    
    if (period) {
      console.log(`✅ Período calculado: ${period.type} - ${period.startDate} até ${period.toDate}`);
      return period;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erro ao calcular período do cron:', error);
    return null;
  }
}

/**
 * Analisa a expressão do cron e determina o período apropriado
 * @param {string} cronExpression - Expressão do cron
 * @param {moment} now - Momento atual no timezone correto
 * @returns {Object|null} Período calculado
 */
function analyzeCronExpression(cronExpression, now) {
  const parts = cronExpression.trim().split(/\s+/);
  
  if (parts.length !== 5) {
    console.warn('⚠️ Expressão de cron inválida:', cronExpression);
    return null;
  }
  
  const [minute, hour, day, month, dayOfWeek] = parts;
  
  // Caso 1: Execução a cada X minutos (ex: */30 * * * *)
  if (minute.startsWith('*/') && hour === '*' && day === '*' && month === '*' && dayOfWeek === '*') {
    const intervalMinutes = parseInt(minute.substring(2));
    return calculateMinutesInterval(now, intervalMinutes);
  }
  
  // Caso 2: Execução a cada X horas (ex: 0 */2 * * *)
  if (minute === '0' && hour.startsWith('*/') && day === '*' && month === '*' && dayOfWeek === '*') {
    const intervalHours = parseInt(hour.substring(2));
    return calculateHoursInterval(now, intervalHours);
  }
  
  // Caso 3: Execução diária (ex: 0 0 * * *)
  if (minute === '0' && hour === '0' && day === '*' && month === '*' && dayOfWeek === '*') {
    return calculateDailyInterval(now);
  }
  
  // Caso 4: Execução em horário específico (ex: 0 8 * * *)
  if (minute === '0' && !hour.startsWith('*/') && hour !== '*' && day === '*' && month === '*' && dayOfWeek === '*') {
    return calculateSpecificTimeInterval(now, parseInt(hour));
  }
  
  // Caso 5: Execução semanal (ex: 0 0 * * 1)
  if (minute === '0' && hour === '0' && day === '*' && month === '*' && dayOfWeek !== '*') {
    return calculateWeeklyInterval(now, parseInt(dayOfWeek));
  }
  
  // Caso padrão: usar período de 1 dia anterior
  console.log('⚠️ Expressão de cron não reconhecida, usando período padrão (dia anterior)');
  return calculateDefaultPeriod(now);
}

/**
 * Calcula período para execução a cada X minutos
 */
function calculateMinutesInterval(now, intervalMinutes) {
  const startOfCurrentHour = now.clone().startOf('hour');
  const currentMinute = now.minute();
  
  // Encontra o último intervalo executado
  const lastExecutionMinute = Math.floor(currentMinute / intervalMinutes) * intervalMinutes;
  const lastExecution = startOfCurrentHour.clone().minute(lastExecutionMinute);
  
  // Período: desde a última execução até agora
  const startDate = lastExecution.toISOString();
  const toDate = now.toISOString();
  
  return {
    startDate,
    toDate,
    type: `minutes_interval_${intervalMinutes}`
  };
}

/**
 * Calcula período para execução a cada X horas
 */
function calculateHoursInterval(now, intervalHours) {
  const startOfDay = now.clone().startOf('day');
  const currentHour = now.hour();
  
  // Encontra a última execução
  const lastExecutionHour = Math.floor(currentHour / intervalHours) * intervalHours;
  const lastExecution = startOfDay.clone().hour(lastExecutionHour);
  
  // Se for a primeira execução do dia, pega o dia anterior
  if (lastExecutionHour === 0 && currentHour < intervalHours) {
    const yesterday = now.clone().subtract(1, 'day');
    const startDate = yesterday.startOf('day').toISOString();
    const toDate = yesterday.endOf('day').toISOString();
    
    return {
      startDate,
      toDate,
      type: `hours_interval_${intervalHours}_previous_day`
    };
  }
  
  const startDate = lastExecution.toISOString();
  const toDate = now.toISOString();
  
  return {
    startDate,
    toDate,
    type: `hours_interval_${intervalHours}`
  };
}

/**
 * Calcula período para execução diária
 */
function calculateDailyInterval(now) {
  // Se for muito cedo no dia (antes das 6h), processa o dia anterior
  if (now.hour() < 6) {
    const yesterday = now.clone().subtract(1, 'day');
    const startDate = yesterday.startOf('day').toISOString();
    const toDate = yesterday.endOf('day').toISOString();
    
    return {
      startDate,
      toDate,
      type: 'daily_previous_day'
    };
  }
  
  // Senão, processa desde o início do dia atual
  const startDate = now.clone().startOf('day').toISOString();
  const toDate = now.toISOString();
  
  return {
    startDate,
    toDate,
    type: 'daily_current_day'
  };
}

/**
 * Calcula período para execução em horário específico
 */
function calculateSpecificTimeInterval(now, targetHour) {
  const today = now.clone().startOf('day').hour(targetHour);
  
  // Se ainda não chegou no horário, processa o dia anterior
  if (now.isBefore(today)) {
    const yesterday = now.clone().subtract(1, 'day');
    const startDate = yesterday.startOf('day').toISOString();
    const toDate = yesterday.endOf('day').toISOString();
    
    return {
      startDate,
      toDate,
      type: `specific_time_${targetHour}_previous_day`
    };
  }
  
  // Senão, processa desde o início do dia atual
  const startDate = now.clone().startOf('day').toISOString();
  const toDate = now.toISOString();
  
  return {
    startDate,
    toDate,
    type: `specific_time_${targetHour}_current_day`
  };
}

/**
 * Calcula período para execução semanal
 */
function calculateWeeklyInterval(now, targetDayOfWeek) {
  const currentDayOfWeek = now.day(); // 0 = domingo, 1 = segunda, etc.
  
  // Se ainda não chegou no dia da semana, processa a semana anterior
  if (currentDayOfWeek < targetDayOfWeek || (currentDayOfWeek === targetDayOfWeek && now.hour() < 6)) {
    const lastWeek = now.clone().subtract(1, 'week');
    const startDate = lastWeek.startOf('day').toISOString();
    const toDate = lastWeek.endOf('day').toISOString();
    
    return {
      startDate,
      toDate,
      type: `weekly_${targetDayOfWeek}_previous_week`
    };
  }
  
  // Senão, processa desde o início da semana atual
  const startDate = now.clone().startOf('day').toISOString();
  const toDate = now.toISOString();
  
  return {
    startDate,
    toDate,
    type: `weekly_${targetDayOfWeek}_current_week`
  };
}

/**
 * Período padrão: dia anterior completo
 */
function calculateDefaultPeriod(now) {
  const yesterday = now.clone().subtract(1, 'day');
  const startDate = yesterday.startOf('day').toISOString();
  const toDate = yesterday.endOf('day').toISOString();
  
  return {
    startDate,
    toDate,
    type: 'default_previous_day'
  };
}

module.exports = {
  calculatePeriodFromCron,
  analyzeCronExpression
};
