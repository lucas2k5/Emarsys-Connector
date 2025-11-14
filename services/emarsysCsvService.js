const fs = require('fs').promises;
const path = require('path');
const { getBrazilianTimestampForFilename, getBrazilianTimestamp } = require('../utils/dateUtils');

class EmarsysCsvService {
  constructor() {}

  /**
   * Gera conteúdo CSV para produtos (com processamento em lotes otimizado)
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

    let csvContent = headers.join(',') + '\n';
    const batchSize = 100; // Aumentado de 50 para 100 para acelerar processamento

    console.log(`📊 Processando ${products.length} produtos em lotes de ${batchSize} (otimizado)...`);

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      const currentBatch = Math.floor(i/batchSize) + 1;
      const totalBatches = Math.ceil(products.length/batchSize);
      
      // Log apenas a cada 10 lotes para reduzir verbosidade
      if (currentBatch % 10 === 0 || currentBatch === 1 || currentBatch === totalBatches) {
        console.log(`🔄 Processando lote ${currentBatch}/${totalBatches}`);
      }

      batch.forEach(product => {
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
               this.sanitizeField(item.referenceId?.[0]?.Value, 50), // item (SKU Reference ID)
               this.sanitizeField(product.productName, 100), // title
               this.sanitizeCategory(product.categories?.[0] || product.category, 50), // category
               item.sellers?.[0]?.commertialOffer?.IsAvailable ? 'true' : 'false',     // available
               this.sanitizeField(product.description || '', 200),                      // description
               this.formatPrice(item.sellers?.[0]?.commertialOffer?.Price || 0),       // price
               this.formatPrice(item.sellers?.[0]?.commertialOffer?.ListPrice || 0),   // msrp
               this.sanitizeField(product.link || '', 200),                             // link
               this.sanitizeImageUrl(item.images?.[0]?.imageUrl),                 // image (sanitizada)
               this.sanitizeImageUrl(item.images?.[0]?.imageUrl),                 // zoom_image (sanitizada)
               this.sanitizeField(product.productId, 50),                         // group_id
               item.sellers?.[0]?.commertialOffer?.AvailableQuantity || 0,             // c_stock
               this.sanitizeField(item.ean || '', 50),                                  // c_ean
               this.formatEmarsysTimestamp(item.releaseDate || product.releaseDate || ''), // c_dataLancamento
               this.sanitizeField(extractArrayValue(product['Altura do Salto']), 50),  // c_altura_do_salto
               '',                                                                      // c_beneficios
               '',                                                                      // c_collab_barbie
               this.sanitizeField(extractArrayValue(product['Cor']), 50),              // c_cor
               '',                                                                      // c_fechamento
               this.sanitizeField(extractArrayValue(product['Forro']), 50),            // c_forro
               this.sanitizeField(extractArrayValue(product['Gênero']), 50),           // c_genero
               this.sanitizeField(extractArrayValue(product['Material']), 50),         // c_material
               this.sanitizeField(extractArrayValue(product['Medida do Salto (cm)']), 50), // c_medida_do_salto_cm
               '',                                                                      // c_medidas
               this.sanitizeField(extractArrayValue(product['Modelo']), 50),           // c_modelo
               this.sanitizeField(extractArrayValue(product['Peso do Produto']), 50),  // c_peso_do_produto
               this.sanitizeField(extractArrayValue(product['Referência Curta']), 50), // c_referencia_curta
               '',                                                                      // c_tecnologia
               this.sanitizeField(extractArrayValue(item.Tamanho), 50)                 // c_tamanho
            ];

            csvContent += row.join(',') + '\n';
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
             this.sanitizeField(product.referenceId?.[0]?.Value, 50), // item (SKU Reference ID)
             this.sanitizeField(product.productName || '', 100),                       // title
             this.sanitizeCategory(product.categories?.[0] || product.category || '', 50), // category
             'true',                                                                   // available
             this.sanitizeField(product.description || '', 200),                       // description
             this.formatPrice(product.price || 0),                                     // price
             this.formatPrice(product.listPrice || 0),                                 // msrp
             this.sanitizeField(product.link || '', 200),                              // link
             this.sanitizeImageUrl(product.imageUrl),                            // image (sanitizada)
             this.sanitizeImageUrl(product.imageUrl),                            // zoom_image (sanitizada)
             this.sanitizeField(product.productId, 50),                                // group_id
             product.availableQuantity || 0,                                           // c_stock
             this.sanitizeField(product.ean || '', 50),                                // c_ean
             this.formatEmarsysTimestamp(product.releaseDate || ''),                   // c_dataLancamento
             this.sanitizeField(extractArrayValue(product['Altura do Salto']), 50),   // c_altura_do_salto
             '',                                                                       // c_beneficios
             '',                                                                       // c_collab_barbie
             this.sanitizeField(extractArrayValue(product['Cor']), 50),               // c_cor
             '',                                                                       // c_fechamento
             this.sanitizeField(extractArrayValue(product['Forro']), 50),             // c_forro
             this.sanitizeField(extractArrayValue(product['Gênero']), 50),            // c_genero
             this.sanitizeField(extractArrayValue(product['Material']), 50),          // c_material
             this.sanitizeField(extractArrayValue(product['Medida do Salto (cm)']), 50), // c_medida_do_salto_cm
             '',                                                                       // c_medidas
             this.sanitizeField(extractArrayValue(product['Modelo']), 50),            // c_modelo
             this.sanitizeField(extractArrayValue(product['Peso do Produto']), 50),   // c_peso_do_produto
             this.sanitizeField(extractArrayValue(product['Referência Curta']), 50),  // c_referencia_curta
             '',                                                                       // c_tecnologia
             this.sanitizeField(extractArrayValue(product['Tamanho']), 50)            // c_tamanho
           ];

           csvContent += row.join(',') + '\n';
        }
      });

      // Força garbage collection a cada 20 lotes para liberar memória (ajustado para lotes maiores)
      if (i > 0 && i % (batchSize * 10) === 0) {
        if (global.gc) {
          console.log('🧹 Executando garbage collection durante geração CSV...');
          global.gc();
        }
      }
    }

    return csvContent;
  }

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
      const defaultExports = path.join(__dirname, '..', 'exports');
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
        
      }
  
      const filePath = path.join(outputDir, filename);
  
      // Gera o conteúdo CSV (método otimizado para produtos)
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
          
          // Aguardar um momento para garantir que o arquivo foi escrito no disco
          await new Promise(r => setTimeout(r, 500));
          
          gzStats = await fs.stat(gzFilepath);
          
          console.log(`✅ Arquivo .gz gerado: ${gzFilename}`);
          console.log(`   📁 Caminho: ${gzFilepath}`);
          console.log(`   📏 Tamanho: ${gzStats.size} bytes (${(gzStats.size / 1024).toFixed(2)} KB)`);
          console.log(`   📊 Taxa de compressão: ${((1 - gzStats.size / Buffer.byteLength(csvWithBom, 'utf8')) * 100).toFixed(1)}%`);
          
          // Validar integridade do arquivo .gz
          try {
            console.log('🔍 Validando integridade do arquivo .gz...');
            const gunzip = promisify(zlib.gunzip);
            const gzFileContent = await fs.readFile(gzFilepath);
            const decompressed = await gunzip(gzFileContent);
            
            const originalSize = Buffer.byteLength(csvWithBom, 'utf8');
            const decompressedSize = decompressed.length;
            
            if (decompressedSize !== originalSize) {
              console.error(`❌ Tamanho descomprimido divergente: ${decompressedSize} vs ${originalSize}`);
              throw new Error(`Arquivo .gz corrompido: tamanho divergente`);
            }
            
            // Calcular hash para validação adicional
            const crypto = require('crypto');
            const originalHash = crypto.createHash('sha256').update(csvWithBom).digest('hex');
            const decompressedHash = crypto.createHash('sha256').update(decompressed).digest('hex');
            
            if (originalHash !== decompressedHash) {
              console.error(`❌ Hash divergente! Original: ${originalHash.substring(0, 16)}... vs Descomprimido: ${decompressedHash.substring(0, 16)}...`);
              throw new Error(`Arquivo .gz corrompido: hash divergente`);
            }
            
            console.log('✅ Arquivo .gz validado com sucesso (integridade OK)');
            console.log(`   🔐 SHA256: ${originalHash.substring(0, 16)}...`);
          } catch (validationError) {
            console.error('❌ ERRO: Arquivo .gz está corrompido!', validationError.message);
            throw new Error(`Arquivo .gz corrompido: ${validationError.message}`);
          }
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
   * Retorna apenas a última categoria (folha), ex: "/Sandálias/Anabela/" -> "Anabela"
   * Suporta separadores '/' e '>'.
   */
  sanitizeCategory(category) {
    if (!category) return '';
    const normalized = String(category).trim().replace(/^\/+|\/+$/g, '');
    if (!normalized) return '';
    const parts = normalized.split(/[\/>]/).filter(Boolean).map(s => s.trim());
    return parts.length ? parts[parts.length - 1] : '';
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
    return parseFloat(price).toFixed(2);
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
      const defaultExports = path.join(__dirname, '..', 'exports');
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