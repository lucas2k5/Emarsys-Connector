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
  isBrazilianTimezone
}; 