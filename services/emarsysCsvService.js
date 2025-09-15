const fs = require('fs').promises;
const path = require('path');
const { getBrazilianTimestampForFilename, getBrazilianTimestamp } = require('../utils/dateUtils');

class EmarsysCsvService {
  constructor() {}
  /**
   * Gera arquivo CSV de catálogo (produtos) para Emarsys
   * @param {Array} products - Array de produtos
   * @param {string} filename - Nome do arquivo (opcional)
   * @param {Object} options - Opções adicionais
   * @returns {Object} Resultado da geração
   */
  async generateCatalogCsv(products, filename = null, options = {}) {
    try {
      console.log(`📊 Gerando arquivo CSV de catálogo com ${products.length} produtos...`);
  
      if (!products || products.length === 0) {
        throw new Error('Nenhum produto fornecido para gerar CSV');
      }
  
      // Gera nome do arquivo se não fornecido
      if (!filename) {
        const timestamp = getBrazilianTimestampForFilename();
        const prefix = options.prefix || 'emarsys-products-import';
        filename = `${prefix}-${timestamp}.csv`;
      }
  
      // Adiciona extensão .csv se não tiver
      if (!filename.endsWith('.csv')) {
        filename += '.csv';
      }
  
      // Cria o diretório de saída se não existir
      const defaultExports = process.env.VERCEL ? '/tmp/exports' : path.join(__dirname, '..', 'exports');
      let outputDir = process.env.EXPORTS_DIR || defaultExports;
      
      // Garante que o diretório existe
      try {
        await fs.mkdir(outputDir, { recursive: true });
        console.log(`📁 Diretório de exports criado/verificado: ${outputDir}`);
        
        // Verificar se o diretório realmente existe
        try {
          await fs.access(outputDir);
          console.log(`✅ Diretório ${outputDir} existe e está acessível`);
        } catch (accessError) {
          console.log(`❌ Diretório ${outputDir} não está acessível:`, accessError.message);
        }
      } catch (error) {
        console.error(`❌ Erro ao criar diretório ${outputDir}:`, error.message);
        // Fallback para /tmp se houver erro
        if (process.env.VERCEL) {
          const fallbackDir = '/tmp';
          console.log(`🔄 Usando diretório fallback: ${fallbackDir}`);
          try {
            await fs.mkdir(fallbackDir, { recursive: true });
            await fs.access(fallbackDir);
            console.log(`✅ Diretório fallback ${fallbackDir} criado e acessível`);
            outputDir = fallbackDir;
          } catch (fallbackError) {
            console.error(`❌ Erro ao criar diretório fallback ${fallbackDir}:`, fallbackError.message);
            throw fallbackError;
          }
        } else {
          throw error;
        }
      }
  
      const filePath = path.join(outputDir, filename);
  
      // Gera o conteúdo CSV
      const csvContent = this.generateProductCsvContent(products);
  
      // Salva o arquivo com BOM para UTF-8
      const csvWithBom = '\ufeff' + csvContent;
      await fs.writeFile(filePath, csvWithBom, 'utf8');
  
      console.log(`✅ Arquivo CSV de catálogo gerado: ${filePath}`);
  
      // Gera arquivo .gz se solicitado
      let gzFilename = null;
      let gzFilepath = null;
      let gzStats = null;
      
      if (options.generateGz !== false) {
        try {
          const zlib = require('zlib');
          const { promisify } = require('util');
          const gzip = promisify(zlib.gzip);
          
          const gzContent = await gzip(csvWithBom);
          
          // Nome fixo para o arquivo .gz (sem data)
          gzFilename = 'catalog.csv.gz';
          gzFilepath = path.join(outputDir, gzFilename);
          
          await fs.writeFile(gzFilepath, gzContent);
          gzStats = await fs.stat(gzFilepath);
          
          console.log(`✅ Arquivo .gz gerado: ${gzFilename}`);
          console.log(`   📁 Caminho: ${gzFilepath}`);
          console.log(`   📏 Tamanho: ${gzStats.size} bytes (${(gzStats.size / 1024).toFixed(2)} KB)`);
          console.log(`   📊 Taxa de compressão: ${((1 - gzStats.size / Buffer.byteLength(csvWithBom, 'utf8')) * 100).toFixed(1)}%`);
        } catch (gzError) {
          console.error('❌ Erro ao gerar arquivo .gz:', gzError.message);
        }
      } else {
        console.log('⚠️ Geração de arquivo .gz desabilitada');
      }
  
      const result = {
        success: true,
        filename: filename,
        filePath: filePath,
        fileSize: Buffer.byteLength(csvWithBom, 'utf8'),
        timestamp: getBrazilianTimestamp(),
        totalProducts: products.length,
        gzFilename,
        gzFilepath,
        gzSize: gzStats?.size || null
      };
  
      return result;

    } catch (error) {
      console.error('❌ Erro ao gerar CSV de catálogo:', error);
      return {
        success: false,
        error: error.message,
        timestamp: getBrazilianTimestamp()
      };
    }
  }



  /**
   * Converte um produto para o formato CSV
   * @param {Object} product - Produto da VTEX
   * @returns {Array} Array com os valores na ordem correta do CSV
   */
  mapProductToCsvRow(product) {
    return [
      product.name || '',                                    // title
      product.productId || '',                               // item
      product.category || '',                                // category
      'true',                                                // available
      product.description || '',                             // description
      product.price || 0,                                    // price
      product.listPrice || product.price || 0,               // msrp
      product.link || '',                                    // link
      product.image || '',                                   // image
      product.image || '',                                   // zoom_image
      product.productId || '',                               // group_id
      0,                                                     // c_stock
      product.ean || '',                                     // c_ean
      '',                                                    // c_dataLancamento
      '',                                                    // c_altura_do_salto
      '',                                                    // c_beneficios
      '',                                                    // c_collab_barbie
      '',                                                    // c_cor
      '',                                                    // c_fechamento
      '',                                                    // c_forro
      '',                                                    // c_genero
      '',                                                    // c_material
      '',                                                    // c_medida_do_salto_cm
      '',                                                    // c_medidas
      '',                                                    // c_modelo
      '',                                                    // c_peso_do_produto
      '',                                                    // c_referencia_curta
      '',                                                    // c_tecnologia
      ''                                                     // c_tamanho
    ];
  }

  // Métodos auxiliares
  
  /**
   * Helper robusto para escape de células CSV
   * Escape aspas dobrando-as e envolve o campo em aspas SEMPRE
   * @param {unknown} value - Valor a ser escapado
   * @returns {string} Célula CSV com escape correto
   */
  csvCell(value) {
    const s = (value ?? '').toString();
    // Escape aspas dobrando-as e envolva o campo em aspas SEMPRE
    return `"${s.replace(/"/g, '""')}"`;
  }

  /**
   * Normaliza categoria para formato Emarsys (A>B>C)
   * @param {string|undefined|null} raw - Categoria bruta
   * @returns {string} Categoria normalizada
   */
  normalizeCategory(raw) {
    if (!raw) return '';
    // VTEX costuma vir "/A/B/C/"; remove barras e junta com ">"
    const parts = String(raw).split('/').filter(Boolean);
    return parts.join('>');
  }

  /**
   * Gera ID canônico do item (mesmo usado no pixel)
   * @param {any} item - Item do produto
   * @returns {string} ID canônico
   */
  canonicalItemId(item) {
    // em VTEX: item.referenceId é [{ Key, Value }]
    const ref = item?.referenceId?.[0]?.Value ?? item?.ean ?? item?.itemId ?? '';
    return String(ref).trim(); // sem substring, sem prefixo, sem limite!
  }

  sanitizeField(value, maxLength = 25) {
    if (!value) return '';
    
    // Converte para string e remove aspas duplas e vírgulas problemáticas
    let cleanValue = String(value)
      .replace(/"/g, '')           // Remove aspas duplas
      .replace(/,/g, '')           // Remove vírgulas (que quebrariam o CSV)
      .replace(/\r?\n/g, ' ')      // Remove quebras de linha
      .trim();                     // Remove espaços extras
    
    // Trunca se necessário
    if (cleanValue.length > maxLength) {
      cleanValue = cleanValue.substring(0, maxLength);
    }
    
    return cleanValue;
  }

  /**
   * Sanitiza categoria removendo barras e extraindo a palavra correta
   * @param {string} category - Categoria no formato /palavra1/palavra2/
   * @param {number} maxLength - Comprimento máximo do campo
   * @returns {string} Categoria sanitizada
   */
  sanitizeCategory(category, maxLength = 50) {
    if (!category) return '';
    
    let cleanCategory = String(category).trim();
    
    // Remove barras do início e fim
    cleanCategory = cleanCategory.replace(/^\/+|\/+$/g, '');
    
    // Remove caracteres especiais (>)
    cleanCategory = cleanCategory.replace(/>/g, '');
    
    // Se há barras no meio (mais de uma palavra)
    if (cleanCategory.includes('/')) {
      const parts = cleanCategory.split('/').filter(part => part.trim() !== '');
      // Pega a segunda palavra (índice 1) se existir, senão a primeira
      cleanCategory = parts.length > 1 ? parts[1] : parts[0] || '';
    }
    
    // Remove espaços extras
    cleanCategory = cleanCategory.trim();
    
    // Trunca se necessário
    if (cleanCategory.length > maxLength) {
      cleanCategory = cleanCategory.substring(0, maxLength);
    }
    
    return cleanCategory;
  }

  /**
   * Sanitiza URL de imagem removendo parâmetros de query e espaços
   * @param {string} url - URL da imagem
   * @returns {string} URL limpa
   */
  sanitizeImageUrl(url) {
    if (!url) return '';
    
    try {
      // Remove espaços e quebras de linha
      let cleanUrl = String(url).trim();
      
      // Remove parâmetros de query (tudo após ?)
      cleanUrl = cleanUrl.split('?')[0];
      
      // Remove espaços extras
      cleanUrl = cleanUrl.replace(/\s+/g, '');
      
      return cleanUrl;
    } catch (error) {
      return '';
    }
  }
  
  formatEmarsysTimestamp(dateString) {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      
      // Formato: YYYY-MM-DD (apenas 10 caracteres para evitar erro "Unexpected date length")
      // A Emarsys pode estar esperando apenas a data, não data+hora
      return date.toISOString().substring(0, 10);
      
    } catch (error) {
      return '';
    }
  }
  
  formatPrice(price) {
    if (!price || isNaN(price)) return '0.00';
    return (parseFloat(price) / 100).toFixed(2);
  }

  /**
   * Gera conteúdo CSV para produtos no formato Emarsys Catalog
   * @param {Array} products - Array de produtos
   * @returns {string} Conteúdo CSV
   */
  generateProductCsvContent(products) {
    // Cabeçalho conforme especificação da Emarsys Catalog
    const headers = [
      'item',
      'title',
      'category',
      'available',
      'description',
      'price',
      'msrp',
      'link',
      'image',
      'zoom_image',
      'group_id',
      'c_stock',
      'c_ean',
      'c_dataLancamento',
      'c_altura_do_salto',
      'c_beneficios',
      'c_collab_barbie',
      'c_cor',
      'c_fechamento',
      'c_forro',
      'c_genero',
      'c_material',
      'c_medida_do_salto_cm',
      'c_medidas',
      'c_modelo',
      'c_peso_do_produto',
      'c_referencia_curta',
      'c_tecnologia',
      'c_tamanho'
    ];

    // Gera header com escape correto
    const csvRows = [headers.map(header => this.csvCell(header)).join(',')];

    products.forEach(product => {
      // Para cada produto, gerar uma linha para cada item (SKU)
      if (product.items && Array.isArray(product.items)) {
        product.items.forEach(item => {
          // Função auxiliar para extrair valores de arrays
          const extractArrayValue = (array, index = 0) => {
            if (Array.isArray(array) && array.length > index) {
              return array[index];
            }
            return '';
          };

          const row = [
            this.canonicalItemId(item),                                                // item (ID canônico)
            product.productName ?? '',                                                 // title
            this.normalizeCategory(product.categories?.[0] || product.category), // category (A>B>C)
            item.sellers?.[0]?.commertialOffer?.IsAvailable ? 'true' : 'false',       // available
            product.description ?? '',                                                 // description
            this.formatPrice(item.sellers?.[0]?.commertialOffer?.Price || 0),         // price (consistente)
            this.formatPrice(item.sellers?.[0]?.commertialOffer?.ListPrice || 0),     // msrp
            product.link ?? '',                                                        // link
            this.sanitizeImageUrl(item.images?.[0]?.imageUrl),                         // image
            this.sanitizeImageUrl(item.images?.[0]?.imageUrl),                         // zoom_image
            product.productId ?? '',                                                   // group_id
            item.sellers?.[0]?.commertialOffer?.AvailableQuantity || 0,               // c_stock
            item.ean ?? '',                                                           // c_ean
            this.formatEmarsysTimestamp(item.releaseDate || product.releaseDate || ''), // c_dataLancamento
            extractArrayValue(product['Altura do Salto']),                            // c_altura_do_salto
            '',                                                                       // c_beneficios
            '',                                                                       // c_collab_barbie
            extractArrayValue(product['Cor']),                                        // c_cor
            '',                                                                       // c_fechamento
            extractArrayValue(product['Forro']),                                      // c_forro
            extractArrayValue(product['Gênero']),                                     // c_genero
            extractArrayValue(product['Material']),                                   // c_material
            extractArrayValue(product['Medida do Salto (cm)']),                       // c_medida_do_salto_cm
            '',                                                                       // c_medidas
            extractArrayValue(product['Modelo']),                                     // c_modelo
            extractArrayValue(product['Peso do Produto']),                            // c_peso_do_produto
            extractArrayValue(product['Referência Curta']),                           // c_referencia_curta
            '',                                                                       // c_tecnologia
            extractArrayValue(item.Tamanho)                                           // c_tamanho
          ];

          csvRows.push(row.map(cell => this.csvCell(cell)).join(','));
        });
      } else {
        // Fallback: se não há items, usar dados do produto principal
        const extractArrayValue = (array, index = 0) => {
          if (Array.isArray(array) && array.length > index) {
            return array[index];
          }
          return '';
        };

        const row = [
          this.canonicalItemId(product),                                               // item (ID canônico)
          product.productName ?? '',                                                   // title
          this.normalizeCategory(product.categories?.[0] || product.category),  // category (A>B>C)
          'true',                                                                     // available
          product.description ?? '',                                                  // description
          this.formatPrice(product.price || 0),                                       // price
          this.formatPrice(product.listPrice || 0),                                   // msrp
          product.link ?? '',                                                         // link
          this.sanitizeImageUrl(product.images?.[0]?.imageUrl),                       // image
          this.sanitizeImageUrl(product.images?.[0]?.imageUrl),                       // zoom_image
          product.productId ?? '',                                                    // group_id
          product.sellers?.[0]?.commertialOffer?.AvailableQuantity || 0,              // c_stock
          '',                                                                         // c_ean
          this.formatEmarsysTimestamp(product.releaseDate || ''),                     // c_dataLancamento
          extractArrayValue(product['Altura do Salto']),                              // c_altura_do_salto
          '',                                                                         // c_beneficios
          '',                                                                         // c_collab_barbie
          extractArrayValue(product['Cor']),                                          // c_cor
          '',                                                                         // c_fechamento
          extractArrayValue(product['Forro']),                                        // c_forro
          extractArrayValue(product['Gênero']),                                       // c_genero
          extractArrayValue(product['Material']),                                     // c_material
          extractArrayValue(product['Medida do Salto (cm)']),                         // c_medida_do_salto_cm
          '',                                                                         // c_medidas
          extractArrayValue(product['Modelo']),                                       // c_modelo
          extractArrayValue(product['Peso do Produto']),                              // c_peso_do_produto
          extractArrayValue(product['Referência Curta']),                             // c_referencia_curta
          '',                                                                         // c_tecnologia
          ''                                                                          // c_tamanho
        ];

        csvRows.push(row.map(cell => this.csvCell(cell)).join(','));
      }
    });

    return csvRows.join('\n');
  }

  /**
   * Valida todos os pedidos antes de gerar CSV
   * @param {Array} orders - Array de pedidos
   * @returns {Object} Resultado da validação
   */
  validateOrdersForCsv(orders) {
    const validationResults = orders.map(order => this.validateOrderForCsv(order));
    
    const validOrders = validationResults.filter(result => result.isValid);
    const invalidOrders = validationResults.filter(result => !result.isValid);

    return {
      total: orders.length,
      valid: validOrders.length,
      invalid: invalidOrders.length,
      invalidDetails: invalidOrders,
      success: invalidOrders.length === 0
    };
  }

  /**
   * Lista todos os arquivos CSV gerados
   * @returns {Object} Lista de arquivos
   */
  async listCsvFiles() {
    try {
      const defaultExports = process.env.VERCEL ? '/tmp/exports' : path.join(__dirname, '..', 'exports');
      const exportsDir = process.env.EXPORTS_DIR || defaultExports;
      
      const files = await fs.readdir(exportsDir);
      const csvFiles = files.filter(file => file.endsWith('.csv'));
      
      const fileDetails = await Promise.all(
        csvFiles.map(async (filename) => {
          const filePath = path.join(exportsDir, filename);
          const stats = await fs.stat(filePath);
          return {
            filename,
            filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
      );
      
      return {
        success: true,
        files: fileDetails,
        total: fileDetails.length,
        directory: exportsDir
      };
      
    } catch (error) {
      console.error('❌ Erro ao listar arquivos CSV:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new EmarsysCsvService(); 