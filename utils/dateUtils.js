/**
 * Utilitários para gerenciamento de datas no fuso horário do Brasil (Brasília)
 */

/**
 * Gera timestamp ISO no fuso horário do Brasil
 * @returns {string} Timestamp ISO no fuso horário de Brasília
 */
function getBrazilianTimestamp() {
  const now = new Date();
  const brazilianTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
  return brazilianTime.toISOString();
}

/**
 * Gera timestamp formatado para nomes de arquivo no fuso horário do Brasil
 * @returns {string} Timestamp formatado (YYYY-MM-DDTHH-MM-SS)
 */
function getBrazilianTimestampForFilename() {
  const now = new Date();
  
  // Formata a data no fuso horário de Brasília
  const brazilianTime = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(now);
  
  // Extrai os valores das partes
  const parts = {};
  brazilianTime.forEach(part => {
    parts[part.type] = part.value;
  });
  
  // Formata como YYYY-MM-DDTHH-MM-SS
  const formatted = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}-${parts.minute}-${parts.second}`;
  
  return formatted;
}

/**
 * Gera data formatada no fuso horário do Brasil
 * @param {Date} date - Data opcional (padrão: agora)
 * @returns {string} Data formatada (YYYY-MM-DD)
 */
function getBrazilianDate(date = new Date()) {
  const brazilianTime = new Date(date.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
  return brazilianTime.toISOString().split('T')[0];
}

/**
 * Converte uma data para o fuso horário do Brasil
 * @param {string|Date} date - Data a ser convertida
 * @returns {string} Data convertida para fuso horário brasileiro
 */
function convertToBrazilianTime(date) {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const brazilianTime = new Date(dateObj.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
  return brazilianTime.toISOString();
}

/**
 * Converte uma data do fuso horário brasileiro para UTC
 * Útil quando você quer buscar pedidos de um dia específico no Brasil
 * @param {string} brazilianDateStr - Data no formato brasileiro (ex: "2025-09-03" ou "2025-09-03T10:30:00")
 * @returns {string} Data convertida para UTC
 */
function convertBrazilianDateToUTC(brazilianDateStr) {
  // Se só tem a data (sem hora), assume 00:00:00
  let dateStr = brazilianDateStr;
  if (!dateStr.includes('T')) {
    dateStr += 'T00:00:00';
  }
  
  // Cria a data assumindo que está no fuso brasileiro
  const brazilianDate = new Date(dateStr + '-03:00'); // UTC-3 (Brasília)
  return brazilianDate.toISOString();
}

/**
 * Gera período completo de um dia no fuso brasileiro convertido para UTC
 * @param {string} brazilianDate - Data no formato YYYY-MM-DD
 * @returns {Object} {startUTC, endUTC} - Início e fim do dia em UTC
 */
function getBrazilianDayRangeInUTC(brazilianDate) {
  const startUTC = convertBrazilianDateToUTC(`${brazilianDate}T00:00:00`);
  const endUTC = convertBrazilianDateToUTC(`${brazilianDate}T23:59:59`);
  
  return {
    startUTC,
    endUTC
  };
}

/**
 * Converte data e horário brasileiro para UTC com range personalizado
 * @param {string} brazilianDate - Data no formato YYYY-MM-DD
 * @param {string} startTime - Horário inicial (HH:MM ou HH:MM:SS, padrão: "00:00:00")
 * @param {string} endTime - Horário final (HH:MM ou HH:MM:SS, padrão: "23:59:59")
 * @returns {Object} {startUTC, endUTC} - Período em UTC
 */
function getBrazilianTimeRangeInUTC(brazilianDate, startTime = "00:00:00", endTime = "23:59:59") {
  // Normaliza os horários para HH:MM:SS
  const normalizeTime = (time) => {
    if (time.split(':').length === 2) {
      return time + ':00'; // Adiciona segundos se não tiver
    }
    return time;
  };
  
  const normalizedStartTime = normalizeTime(startTime);
  const normalizedEndTime = normalizeTime(endTime);
  
  const startUTC = convertBrazilianDateToUTC(`${brazilianDate}T${normalizedStartTime}`);
  const endUTC = convertBrazilianDateToUTC(`${brazilianDate}T${normalizedEndTime}`);
  
  return {
    startUTC,
    endUTC,
    brazilianDate,
    startTime: normalizedStartTime,
    endTime: normalizedEndTime
  };
}

/**
 * Verifica se uma data está no fuso horário correto
 * @param {string} dateString - String da data
 * @returns {boolean} True se estiver no fuso horário correto
 */
function isBrazilianTimezone(dateString) {
  const date = new Date(dateString);
  const brazilianOffset = -3 * 60; // UTC-3 (horário de Brasília)
  return date.getTimezoneOffset() === brazilianOffset;
}

module.exports = {
  getBrazilianTimestamp,
  getBrazilianTimestampForFilename,
  getBrazilianDate,
  convertToBrazilianTime,
  convertBrazilianDateToUTC,
  getBrazilianDayRangeInUTC,
  getBrazilianTimeRangeInUTC,
  isBrazilianTimezone
}; 