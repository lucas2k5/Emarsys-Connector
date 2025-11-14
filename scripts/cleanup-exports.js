const fs = require('fs');
const path = require('path');
const { logHelpers } = require('../utils/logger');

/**
 * Script de limpeza de arquivos da pasta exports/
 * Remove arquivos da semana anterior (7-14 dias atrás)
 * Executado automaticamente todo domingo às 00:00
 */

class ExportsCleanup {
  constructor() {
    this.exportsDir = path.join(__dirname, '../exports');
    this.dryRun = process.argv.includes('--dry-run');
  }

  /**
   * Calcula as datas de início e fim da semana anterior
   * @returns {Object} { startDate, endDate }
   */
  getLastWeekDates() {
    const now = new Date();
    
    // Pega o domingo atual (00:00)
    const currentSunday = new Date(now);
    currentSunday.setHours(0, 0, 0, 0);
    currentSunday.setDate(now.getDate() - now.getDay());
    
    // Semana anterior: de 7 a 14 dias atrás
    const lastWeekEnd = new Date(currentSunday);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1); // Sábado da semana anterior
    
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekStart.getDate() - 6); // Domingo da semana anterior
    
    return {
      startDate: lastWeekStart,
      endDate: lastWeekEnd
    };
  }

  /**
   * Extrai a data de um nome de arquivo
   * @param {string} filename 
   * @returns {Date|null}
   */
  extractDateFromFilename(filename) {
    // Padrões de data nos arquivos:
    // emarsys-products-import-2025-11-11T00-02-02.csv
    // ems-sl-pcdly-2025-11-11T00-00-00-00-00-01-59.csv
    
    // Regex para capturar YYYY-MM-DD
    const dateMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
    
    if (!dateMatch) {
      return null;
    }
    
    const [, year, month, day] = dateMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  /**
   * Verifica se um arquivo está no range de data da semana anterior
   * @param {Date} fileDate 
   * @param {Date} startDate 
   * @param {Date} endDate 
   * @returns {boolean}
   */
  isFileInLastWeek(fileDate, startDate, endDate) {
    // Remove as horas para comparar apenas as datas
    fileDate.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    return fileDate >= startDate && fileDate <= endDate;
  }

  /**
   * Formata data no padrão ISO
   * @param {Date} date 
   * @returns {string}
   */
  formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  /**
   * Formata tamanho de arquivo
   * @param {number} bytes 
   * @returns {string}
   */
  formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Executa a limpeza de arquivos
   * @returns {Promise<Object>}
   */
  async cleanup() {
    const startTime = Date.now();
    const result = {
      success: false,
      filesScanned: 0,
      filesDeleted: 0,
      filesKept: 0,
      filesWithoutDate: 0,
      spaceFreed: 0,
      deletedFiles: [],
      errors: [],
      period: null,
      dryRun: this.dryRun
    };

    try {
      // Verificar se a pasta exports existe
      if (!fs.existsSync(this.exportsDir)) {
        logHelpers.logOrders('warn', '⚠️ Pasta exports/ não encontrada', {
          path: this.exportsDir
        });
        result.success = true;
        result.message = 'Pasta exports/ não encontrada';
        return result;
      }

      // Calcular datas da semana anterior
      const { startDate, endDate } = this.getLastWeekDates();
      result.period = {
        start: this.formatDate(startDate),
        end: this.formatDate(endDate)
      };

      logHelpers.logOrders('info', '🧹 Iniciando limpeza de exports', {
        startDate: result.period.start,
        endDate: result.period.end,
        dryRun: this.dryRun
      });

      // Listar todos os arquivos
      const files = fs.readdirSync(this.exportsDir);
      result.filesScanned = files.length;

      logHelpers.logOrders('info', '📂 Arquivos encontrados', {
        total: files.length
      });

      // Processar cada arquivo
      for (const filename of files) {
        const filePath = path.join(this.exportsDir, filename);
        
        // Ignorar diretórios
        if (!fs.statSync(filePath).isFile()) {
          continue;
        }

        // Ignorar catalog.csv.gz (arquivo principal)
        if (filename === 'catalog.csv.gz') {
          result.filesKept++;
          continue;
        }

        // Extrair data do nome do arquivo
        const fileDate = this.extractDateFromFilename(filename);

        if (!fileDate) {
          result.filesWithoutDate++;
          logHelpers.logOrders('warn', '⚠️ Arquivo sem data válida', {
            filename
          });
          continue;
        }

        // Verificar se está na semana anterior
        if (this.isFileInLastWeek(fileDate, startDate, endDate)) {
          const stats = fs.statSync(filePath);
          const fileSize = stats.size;

          if (this.dryRun) {
            logHelpers.logOrders('info', '🔍 [DRY RUN] Arquivo seria deletado', {
              filename,
              date: this.formatDate(fileDate),
              size: this.formatFileSize(fileSize)
            });
          } else {
            try {
              fs.unlinkSync(filePath);
              logHelpers.logOrders('info', '🗑️ Arquivo deletado', {
                filename,
                date: this.formatDate(fileDate),
                size: this.formatFileSize(fileSize)
              });
            } catch (deleteError) {
              logHelpers.logOrders('error', '❌ Erro ao deletar arquivo', {
                filename,
                error: deleteError.message
              });
              result.errors.push({
                filename,
                error: deleteError.message
              });
              continue;
            }
          }

          result.filesDeleted++;
          result.spaceFreed += fileSize;
          result.deletedFiles.push({
            filename,
            date: this.formatDate(fileDate),
            size: fileSize,
            sizeFormatted: this.formatFileSize(fileSize)
          });
        } else {
          result.filesKept++;
        }
      }

      result.success = true;
      result.duration = Date.now() - startTime;
      result.spaceFreedFormatted = this.formatFileSize(result.spaceFreed);

      logHelpers.logOrders('info', '✅ Limpeza concluída', {
        filesScanned: result.filesScanned,
        filesDeleted: result.filesDeleted,
        filesKept: result.filesKept,
        filesWithoutDate: result.filesWithoutDate,
        spaceFreed: result.spaceFreedFormatted,
        duration: `${result.duration}ms`,
        dryRun: this.dryRun
      });

      return result;

    } catch (error) {
      logHelpers.logOrders('error', '❌ Erro na limpeza de exports', {
        error: error.message,
        stack: error.stack
      });

      result.success = false;
      result.error = error.message;
      return result;
    }
  }

  /**
   * Executa limpeza de arquivos de um período específico
   * @param {string} yearMonth - Formato: YYYY-MM
   * @returns {Promise<Object>}
   */
  async cleanupByMonth(yearMonth) {
    const result = {
      success: false,
      filesDeleted: 0,
      spaceFreed: 0,
      deletedFiles: [],
      errors: []
    };

    try {
      if (!fs.existsSync(this.exportsDir)) {
        result.success = true;
        result.message = 'Pasta exports/ não encontrada';
        return result;
      }

      const pattern = yearMonth; // Ex: "2025-10"
      const files = fs.readdirSync(this.exportsDir);

      logHelpers.logOrders('info', '🧹 Limpando arquivos do mês', {
        pattern,
        dryRun: this.dryRun
      });

      for (const filename of files) {
        if (filename.includes(pattern) && filename !== 'catalog.csv.gz') {
          const filePath = path.join(this.exportsDir, filename);
          
          if (!fs.statSync(filePath).isFile()) {
            continue;
          }

          const stats = fs.statSync(filePath);
          const fileSize = stats.size;

          if (this.dryRun) {
            logHelpers.logOrders('info', '🔍 [DRY RUN] Arquivo seria deletado', {
              filename,
              size: this.formatFileSize(fileSize)
            });
          } else {
            try {
              fs.unlinkSync(filePath);
              logHelpers.logOrders('info', '🗑️ Arquivo deletado', {
                filename,
                size: this.formatFileSize(fileSize)
              });
            } catch (deleteError) {
              result.errors.push({
                filename,
                error: deleteError.message
              });
              continue;
            }
          }

          result.filesDeleted++;
          result.spaceFreed += fileSize;
          result.deletedFiles.push({
            filename,
            size: fileSize
          });
        }
      }

      result.success = true;
      result.spaceFreedFormatted = this.formatFileSize(result.spaceFreed);

      logHelpers.logOrders('info', '✅ Limpeza por mês concluída', {
        pattern,
        filesDeleted: result.filesDeleted,
        spaceFreed: result.spaceFreedFormatted
      });

      return result;

    } catch (error) {
      logHelpers.logOrders('error', '❌ Erro na limpeza por mês', {
        error: error.message
      });

      result.success = false;
      result.error = error.message;
      return result;
    }
  }
}

// Permitir execução via linha de comando
if (require.main === module) {
  const cleanup = new ExportsCleanup();
  
  // Verificar se foi passado um mês específico
  const monthArg = process.argv.find(arg => arg.match(/^\d{4}-\d{2}$/));
  
  if (monthArg) {
    cleanup.cleanupByMonth(monthArg).then(result => {
      console.log('\n📊 Resultado da limpeza:');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    });
  } else {
    cleanup.cleanup().then(result => {
      console.log('\n📊 Resultado da limpeza:');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    });
  }
}

module.exports = ExportsCleanup;

