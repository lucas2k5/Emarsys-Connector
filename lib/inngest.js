const { Inngest } = require('inngest');
const Bottleneck = require('bottleneck');

// Cliente Inngest principal
const inngest = new Inngest({
  id: 'emarsys-vtex-integration',
  name: 'Emarsys VTEX Integration',
  env: process.env.INNGEST_ENV || process.env.NODE_ENV || 'development'
});

// Rate limiter para APIs externas
const apiLimiter = new Bottleneck({
  maxConcurrent: 5, // Máximo 5 requisições simultâneas
  minTime: 200, // Mínimo 200ms entre requisições
  reservoir: 100, // 100 requisições por reservatório
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 60 * 1000, // Recarrega a cada 1 minuto
});

// Rate limiter para processamento de produtos
const productLimiter = new Bottleneck({
  maxConcurrent: parseInt(process.env.PRODUCTS_CONCURRENCY),
  minTime: parseInt(process.env.PRODUCTS_MIN_TIME_MS),
});

// Função para sincronizar produtos VTEX em background
const syncVTEXProducts = inngest.createFunction(
  { 
    id: "sync-vtex-products",
    name: "Sync VTEX Products Background",
    retries: 3,
    concurrency: {
      limit: 1, // Apenas 1 job de sync por vez
      key: "vtex-sync"
    }
  },
  { event: "vtex.sync.start" },
  async ({ event, step }) => {
    const { 
      maxProducts = 0,
      forceRefresh = false, 
      batchSize = parseInt(process.env.PRODUCTS_BATCH_SIZE),
      skipCsvGeneration = process.env.SKIP_INLINE_CSV_GENERATION === 'true'
    } = event.data || {};
    
    console.log(`🚀 [Inngest] Iniciando sync de produtos VTEX`);
    console.log(`📊 Configuração: batchSize=${batchSize} (sem limite de produtos)`);
    console.log(`🌍 Ambiente: ${process.env.VERCEL ? 'Vercel' : 'Local'}`);
    console.log(`📁 Diretório de export: ${process.env.VERCEL ? '/tmp/exports' : 'exports'}`);
    console.log(`🔧 Configurações extras:`, {
      LOG_VERBOSE: process.env.LOG_VERBOSE,
      PRODUCTS_LOG_EVERY: process.env.PRODUCTS_LOG_EVERY,
      PRODUCTS_INTRA_BATCH_CONCURRENCY: process.env.PRODUCTS_INTRA_BATCH_CONCURRENCY,
      PRODUCTS_ERRORS_SAMPLE: process.env.PRODUCTS_ERRORS_SAMPLE,
      SKIP_INLINE_CSV_GENERATION: process.env.SKIP_INLINE_CSV_GENERATION
    });
    
    // Etapa 1: Buscar somente productIds (muito leve em memória)
    const { productIds, exportTimestamp } = await step.run("fetch-product-ids", async () => {
      const vtexProductService = require('../services/vtexProductService');
      try {
        const map = await apiLimiter.schedule(() => vtexProductService.getProductIdsAndSkusFromPrivateApi());
        let ids = Object.keys(map).map((id) => parseInt(id));
        // Removido limite de produtos - processa todos os produtos disponíveis
        console.log(`✅ ${ids.length} productIds obtidos`);
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        return { productIds: ids, exportTimestamp: ts };
      } catch (error) {
        console.error(`❌ Erro ao buscar productIds: ${error.message}`);
        throw error;
      }
    });

    if (!productIds || productIds.length === 0) {
      throw new Error('Nenhum productId encontrado na VTEX');
    }

    // Etapa 2: Processar produtos em lotes, cada lote em um step.run separado
    const batches = [];
    for (let i = 0; i < productIds.length; i += batchSize) {
      batches.push(productIds.slice(i, i + batchSize));
    }
    console.log(`📦 Processando ${batches.length} lotes de produtos (batchSize=${batchSize})`);

    // Processar em chunks para evitar timeout do Inngest (máximo ~100 steps por função)
    const CHUNK_SIZE = parseInt(process.env.INNGEST_CHUNK_SIZE || '50'); // Processa 50 lotes por vez
    const chunks = [];
    for (let i = 0; i < batches.length; i += CHUNK_SIZE) {
      chunks.push(batches.slice(i, i + CHUNK_SIZE));
    }
    console.log(`🔄 Dividindo em ${chunks.length} chunks de ${CHUNK_SIZE} lotes cada`);

    const processedBatches = [];
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      
      const chunkResult = await step.run(`process-chunk-${chunkIndex + 1}`, async () => {
        const chunkBatches = [];
        
        for (let i = 0; i < chunk.length; i++) {
          const batch = chunk[i];
          const batchIndex = chunkIndex * CHUNK_SIZE + i;
        const fs = require('fs');
        const path = require('path');
        const vtexProductService = require('../services/vtexProductService');

        // Caminho de saída NDJSON único por batch
        const outDir = process.env.VERCEL ? '/tmp/exports' : path.join(process.cwd(), 'exports');
        try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
        const ndjsonPath = path.join(outDir, `products-inngest-${exportTimestamp}-batch-${i + 1}.ndjson`);

        let successCount = 0;
        let errorCount = 0;
        const httpStatusCounts = {};
        let timeoutCount = 0;
        const errorsSample = [];

        const firstId = batch[0];
        const lastId = batch[batch.length - 1];
        console.log(`📦 Lote ${batchIndex + 1}/${batches.length}: ${batch.length} produtos (IDs ${firstId}..${lastId})`);
        const logEvery = parseInt(process.env.PRODUCTS_LOG_EVERY || '20');
        const windowSize = parseInt(process.env.PRODUCTS_INTRA_BATCH_CONCURRENCY || '4');
        let skippedCount = 0; // Contador de produtos sem SKUs

        for (let start = 0; start < batch.length; start += windowSize) {
          const window = batch.slice(start, start + windowSize);
          if (logEvery > 0 && (start % logEvery) === 0) {
            console.log(`🔎 Lote ${batchIndex + 1}: ${start + 1}/${batch.length} → productId=${window[0]}`);
          }
          const results = await Promise.allSettled(window.map(async (productId) => {
            try {
              const details = await vtexProductService.fetchProductDetails(productId);
              
              // Só salva se tiver detalhes E SKUs válidos
              if (details && details.skus && details.skus.length > 0) {
                // Verifica espaço em disco antes de escrever (Vercel tem limite no /tmp)
                try {
                  const stats = fs.statfsSync ? fs.statfsSync('/tmp') : null;
                  if (stats && stats.bavail * stats.bsize < 10 * 1024 * 1024) { // Menos de 10MB livre
                    console.warn('⚠️ Espaço em disco baixo, pulando gravação');
                    return { ok: false, error: 'Low disk space', code: 'ENOSPC' };
                  }
                } catch {}
                
                fs.appendFileSync(ndjsonPath, JSON.stringify(details) + '\n');
                return { ok: true };
              }
              
              // Produto sem SKUs não é erro, apenas pula
              return { ok: false, skipped: true, reason: 'No SKUs' };
            } catch (error) {
              return { ok: false, error };
            }
          }));

          results.forEach((r, idx) => {
            const productId = window[idx];
            if (r.status === 'fulfilled' && r.value.ok) {
              successCount += 1;
              return;
            }
            
            // Se foi pulado (sem SKUs), não conta como erro
            if (r.status === 'fulfilled' && r.value?.skipped) {
              skippedCount += 1;
              return;
            }
            
            errorCount += 1;
            
            // Captura erro seja de rejected ou de fulfilled com ok=false
            const err = r.status === 'rejected' ? r.reason : r.value?.error;
            const status = err?.response?.status;
            const code = err?.code || r.value?.code;
            const message = err?.message || (typeof r.value?.error === 'string' ? r.value.error : 'unknown');
            
            if (code === 'ECONNABORTED') timeoutCount += 1;
            if (code === 'ENOSPC') {
              console.error(`💾 Sem espaço em disco! Considere reduzir o batchSize ou concorrência`);
            }
            if (status) httpStatusCounts[status] = (httpStatusCounts[status] || 0) + 1;
            if (errorsSample.length < (parseInt(process.env.PRODUCTS_ERRORS_SAMPLE || '10'))) {
              errorsSample.push({ productId, status: status || null, code: code || null, message });
            }
            
            // Log apenas erros reais, não produtos sem SKUs
            if (message !== 'No SKUs' && message !== 'No details returned') {
              console.error(`❌ Detalhes falharam para ${productId}: ${status || code || ''} ${message}`);
            }
          });
        }

        console.log(`✅ Lote ${batchIndex + 1} concluído: ok=${successCount}, erro=${errorCount}, pulados=${skippedCount}`);
        try {
          const rss = Math.round(process.memoryUsage().rss / (1024 * 1024));
          console.log(`🧠 Memória RSS ~ ${rss} MB`);
        } catch {}
        
        chunkBatches.push({
          batchIndex: batchIndex,
          totalProducts: batch.length,
          successCount,
          errorCount,
          skippedCount,
          ndjsonPath,
          httpStatusCounts,
          timeoutCount,
          errorsSample
        });
      }
      
      console.log(`✅ Chunk ${chunkIndex + 1}/${chunks.length} concluído: ${chunkBatches.length} lotes processados`);
      return chunkBatches;
    });

    processedBatches.push(...chunkResult);

    // Pequena pausa opcional para aliviar pressão em APIs
    if (chunkIndex < chunks.length - 1) {
      await step.sleep(`sleep-between-chunks-${chunkIndex + 1}`, `${parseInt(process.env.PRODUCTS_INTER_CHUNK_SLEEP_MS || '1000')}ms`);
    }
  }

    // Etapa 3: Resumo de salvamento (dados já foram gravados por NDJSON por lote)
    const saveResult = { success: true, savedBatches: processedBatches.length };

    // Etapa 4: Gerar CSV para Emarsys (automaticamente após o último batch)
    const csvResult = await step.run('generate-csv-after-batches', async () => {
      if (skipCsvGeneration) {
        console.log('🚫 Geração de CSV inline desabilitada. Disparando evento separado...');
        await inngest.send({
          name: 'vtex.products.csv',
          data: {
            exportTimestamp,
            source: 'products-sync-completion'
          }
        });
        return { success: false, skipped: true, reason: 'CSV será gerado via evento separado' };
      }
      try {
        const fs = require('fs');
        const path = require('path');
        const readline = require('readline');

        // Consolida todos os NDJSONs dos batches
        const allNdjsonPaths = processedBatches.map(b => b.ndjsonPath).filter(p => p && fs.existsSync(p));
        
        // No Vercel, arquivos podem não persistir entre steps
        if (allNdjsonPaths.length === 0 && process.env.VERCEL) {
          console.warn('⚠️ Nenhum arquivo NDJSON encontrado (comum no Vercel)');
          console.log('💡 Para gerar CSV no Vercel, use o evento separado vtex.products.csv');
          return { 
            success: false, 
            skipped: true, 
            reason: 'Arquivos NDJSON não persistem entre steps no Vercel. Use evento separado para CSV.',
            tip: 'Configure SKIP_INLINE_CSV_GENERATION=true'
          };
        }
        
        if (allNdjsonPaths.length === 0) {
          console.error('❌ Nenhum arquivo NDJSON encontrado dos batches');
          return { success: false, skipped: true, reason: 'Nenhum arquivo NDJSON encontrado' };
        }
        console.log(`📄 Consolidando ${allNdjsonPaths.length} arquivos NDJSON dos batches`);

        const outDir = process.env.VERCEL ? '/tmp/exports' : path.join(process.cwd(), 'exports');
        const exportTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const csvFilename = `emarsys-products-inngest-${exportTimestamp}.csv`;
        const csvPath = path.join(outDir, csvFilename);

        console.log(`📝 Gerando CSV consolidado em: ${csvPath}`);
        const vtexProductService = require('../services/vtexProductService');

        // Cabeçalho compatível com import Emarsys
        const headers = [
          'title','item','category','available','description','price','msrp','link','image','zoom_image','group_id','c_stock','c_ean','c_dataLancamento','c_altura_do_salto','c_beneficios','c_collab_barbie','c_cor','c_fechamento','c_forro','c_genero','c_material','c_medida_do_salto_cm','c_medidas','c_modelo','c_peso_do_produto','c_referencia_curta','c_tecnologia','c_tamanho'
        ];
        const csvStream = fs.createWriteStream(csvPath, { encoding: 'utf8' });
        csvStream.write(headers.join(',') + '\n');

        let lines = 0;
        let rows = 0;
        const truncate = (val, max = 25) => { if (!val) return ''; const s = String(val); return s.length > max ? s.substring(0, max) : s; };
        const clean = (s) => (s || '').toString().replace(/"/g, '""');
        const toISODate = (d) => { if (!d) return ''; const dt = new Date(d); return isNaN(dt.getTime()) ? '' : dt.toISOString().split('T')[0]; };

        // Processa todos os arquivos NDJSON
        for (const ndjsonPath of allNdjsonPaths) {
          console.log(`📖 Lendo: ${path.basename(ndjsonPath)}`);
          const input = fs.createReadStream(ndjsonPath, { encoding: 'utf8' });
          const rl = readline.createInterface({ input, crlfDelay: Infinity });
          
          for await (const line of rl) {
          lines += 1; if (!line || !line.trim()) continue; let product; try { product = JSON.parse(line); } catch { continue; }
          const skus = Array.isArray(product.skus) && product.skus.length > 0
            ? product.skus
            : (Array.isArray(product.items) ? product.items.map(it => ({
                itemId: it.itemId,
                name: it.name || it.nameComplete,
                ean: it.ean,
                referenceId: it.referenceId?.[0]?.Value,
                price: it.sellers?.[0]?.commertialOffer?.Price || 0,
                listPrice: it.sellers?.[0]?.commertialOffer?.ListPrice || 0,
                availableQuantity: it.sellers?.[0]?.commertialOffer?.AvailableQuantity || 0,
                isAvailable: (it.sellers?.[0]?.commertialOffer?.AvailableQuantity || 0) > 0,
                images: it.images || []
              })) : []);
          const cleanCategory = ((product.categories && product.categories[0]) || product.category || '').toString().replace(/^\/+|\/+$/g, '');
          const firstItem = product.items?.[0];
          const firstImg = skus[0]?.images?.[0]?.imageUrl || firstItem?.images?.[0]?.imageUrl || product.images?.[0]?.imageUrl || '';

          for (const sku of skus) {
            const price = Number.isFinite(Number(sku.price)) ? Number(sku.price) : 0;
            const msrp = Number.isFinite(Number(sku.listPrice)) ? Number(sku.listPrice) : price;
            const stock = sku.availableQuantity || 0;
            const title = (sku.name && sku.name !== product.productName)
              ? `${product.productName || product.name || ''} - ${sku.name}`
              : (product.productName || product.name || '');
            const row = [
              `"${clean(truncate(title))}"`,
              `"${clean(truncate(sku.referenceId || sku.itemId || ''))}"`,
              `"${clean(truncate(cleanCategory))}"`,
              stock > 0 ? 'true' : 'false',
              `"${clean((product.description || '').slice(0, 200))}"`,
              price,
              msrp,
              (product.link || ''),
              (firstImg || ''),
              (firstImg || ''),
              product.productId || '',
              stock,
              (sku.ean || ''),
              toISODate(product.releaseDate),
              '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
            ].join(',') + '\n';
            if (!csvStream.write(row)) { await new Promise(res => csvStream.once('drain', res)); }
            rows += 1;
          }
        }
          
          rl.close();
        }

        await new Promise(res => csvStream.end(res));

        // Compacta e envia via SFTP
        const zlib = require('zlib');
        const gzPath = path.join(path.dirname(csvPath), 'catalog.csv.gz');
        await new Promise((resolve, reject) => {
          const source = fs.createReadStream(csvPath);
          const gzip = zlib.createGzip();
          const dest = fs.createWriteStream(gzPath);
          source.on('error', reject); gzip.on('error', reject); dest.on('error', reject); dest.on('finish', resolve);
          source.pipe(gzip).pipe(dest);
        });

        const vps = require('../services/vtexProductService');
        console.log(`✅ CSV gerado: ${rows} linhas`);
        console.log(`📤 Enviando para Emarsys via SFTP...`);
        const upload = await vps.uploadToEmarsys(gzPath);
        console.log(`📤 Upload SFTP: ${upload.success ? 'Sucesso' : 'Falha'} - ${upload.error || upload.remotePath || ''}`);
        return { success: true, csvPath, gzPath, rows, upload };
      } catch (err) {
        console.error('❌ Erro ao gerar/enviar CSV após lotes:', err);
        console.error('Stack trace:', err.stack);
        return { success: false, error: err.message, details: err.toString() };
      }
    });

    // Etapa 5: Upload para Emarsys (opcional)
    const uploadResult = await step.run("upload-to-emarsys", async () => {
      if (!csvResult.success) {
        return { skipped: true, reason: 'CSV não foi gerado com sucesso' };
      }
      
      try {
        const emarsysService = require('../services/emarsysService');
        const uploadResult = await emarsysService.uploadCsvToEmarsys(csvResult.filename);
        
        console.log(`📤 Upload para Emarsys: ${uploadResult.success ? 'Sucesso' : 'Falha'}`);
        return uploadResult;
      } catch (error) {
        console.error(`❌ Erro no upload para Emarsys: ${error.message}`);
        return { success: false, error: error.message };
      }
    });

    // Resumo final
    const aggregateStatus = processedBatches.reduce((acc, b) => {
      Object.entries(b.httpStatusCounts || {}).forEach(([k, v]) => acc[k] = (acc[k] || 0) + v);
      return acc;
    }, {});
    const errorsSample = processedBatches.flatMap(b => b.errorsSample || []);

    const summary = {
      totalProducts: productIds.length,
      totalBatches: processedBatches.length,
      totalProcessed: processedBatches.reduce((sum, b) => sum + b.successCount, 0),
      totalSkipped: processedBatches.reduce((sum, b) => sum + (b.skippedCount || 0), 0),
      totalErrors: processedBatches.reduce((sum, b) => sum + b.errorCount, 0),
      httpStatusCounts: aggregateStatus,
      timeoutCount: processedBatches.reduce((sum, b) => sum + (b.timeoutCount || 0), 0),
      errorsSample: errorsSample.slice(0, 10),
      saveSuccess: saveResult.success,
      csvSuccess: csvResult.success,
      csvSkipped: csvResult.skipped || false,
      uploadSuccess: csvResult.skipped ? false : Boolean(uploadResult.success)
    };

    console.log(`🎉 Sync concluído! Resumo:`, summary);

    return {
      success: true,
      mode: 'background-inngest',
      summary,
      exportTimestamp,
      details: {
        processedBatches,
        saveResult,
        csvResult,
        uploadResult,
        ndjsonPaths: processedBatches.map(b => b.ndjsonPath).filter(Boolean)
      },
      timestamp: new Date().toISOString()
    };
  }
);

// Função para sincronizar pedidos VTEX
const syncVTEXOrders = inngest.createFunction(
  {
    id: "sync-vtex-orders",
    name: "Sync VTEX Orders Background",
    retries: 2,
    concurrency: {
      limit: 1,
      key: "vtex-orders-sync"
    }
  },
  { event: "vtex.orders.sync" },
  async ({ event, step }) => {
    const { maxOrders = 0, dateFrom, dateTo } = event.data;
    
    console.log('🚀 [Inngest] Iniciando sync de pedidos VTEX...');
    console.log('📋 Dados do evento:', { maxOrders, dateFrom, dateTo });
    console.log('🌍 Ambiente:', process.env.NODE_ENV);
    console.log('🔧 Configurações Emarsys:', {
      EMARSYS_SALES_TOKEN: process.env.EMARSYS_SALES_TOKEN ? 'configurado' : 'não configurado',
      EMARSYS_HAPI_URL: process.env.EMARSYS_HAPI_URL || 'padrão'
    });
    
    // Buscar pedidos
    const orders = await step.run("fetch-orders", async () => {
      const VtexOrdersService = require('../services/vtexOrdersService');
      const vtexOrdersService = new VtexOrdersService();
      
      try {
        const result = await apiLimiter.schedule(() => 
          vtexOrdersService.fetchAllOrders()
        );
        
        console.log(`✅ ${result.length} pedidos extraídos da VTEX`);
        return result;
      } catch (error) {
        console.error(`❌ Erro ao buscar pedidos: ${error.message}`);
        throw error;
      }
    });

    if (!orders || orders.length === 0) {
      return {
        success: true,
        message: 'Nenhum pedido encontrado para o período especificado',
        totalOrders: 0
      };
    }

         // Salvar pedidos
     const saveResult = await step.run("save-orders", async () => {
       const VtexOrdersService = require('../services/vtexOrdersService');
       const vtexOrdersService = new VtexOrdersService();
       
       try {
         await vtexOrdersService.saveOrdersToFile(orders);
         return { success: true, savedOrders: orders.length };
       } catch (error) {
         console.error(`❌ Erro ao salvar pedidos: ${error.message}`);
         return { success: false, error: error.message };
       }
     });

         // Gerar CSV
     const csvResult = await step.run("generate-csv", async () => {
       const VtexOrdersService = require('../services/vtexOrdersService');
       const vtexOrdersService = new VtexOrdersService();
       
       try {
         const result = await vtexOrdersService.generateCsvFromOrders(orders);
         console.log(`📄 CSV de pedidos gerado: ${result.filename}`);
         return result;
       } catch (error) {
         console.error(`❌ Erro ao gerar CSV: ${error.message}`);
         return { success: false, error: error.message };
       }
     });

         // Enviar para Emarsys
     const emarsysResult = await step.run("send-to-emarsys", async () => {
       console.log('📤 [Inngest] Iniciando envio para Emarsys...');
       console.log('📊 Status do CSV:', csvResult.success ? 'Sucesso' : 'Falha');
       
       if (!csvResult.success) {
         console.log('⚠️ Pulando envio para Emarsys - CSV não foi gerado');
         return { skipped: true, reason: 'CSV não foi gerado com sucesso' };
       }
       
       const VtexOrdersService = require('../services/vtexOrdersService');
       const vtexOrdersService = new VtexOrdersService();
       
       try {
         console.log(`📤 Enviando ${orders.length} pedidos para Emarsys...`);
         const result = await vtexOrdersService.sendOrdersToEmarsys(orders);
         console.log(`📤 Resultado do envio para Emarsys:`, {
           success: result.success,
           error: result.error,
           message: result.message,
           total: result.total
         });
         return result;
       } catch (error) {
         console.error(`❌ Erro ao enviar para Emarsys: ${error.message}`);
         console.error('Stack trace:', error.stack);
         return { success: false, error: error.message };
       }
     });

    return {
      success: true,
      mode: 'background-inngest',
      totalOrders: orders.length,
      saveResult,
      csvResult,
      emarsysResult,
      timestamp: new Date().toISOString()
    };
  }
);

// Função para sincronização completa (produtos + pedidos)
const syncComplete = inngest.createFunction(
  {
    id: "sync-complete",
    name: "Complete VTEX Sync (Products + Orders)",
    retries: 2,
    concurrency: {
      limit: 1,
      key: "vtex-complete-sync"
    }
  },
  { event: "vtex.sync.complete" },
  async ({ event, step }) => {
    const { maxProducts = 0, maxOrders = 0 } = event.data; // maxProducts=0 = sem limite
    
    console.log('🚀 [Inngest] Iniciando sincronização completa VTEX...');
    
    // Sync produtos diretamente (sem disparar novo evento)
    const productsResult = await step.run("sync-products", async () => {
      const vtexProductService = require('../services/vtexProductService');
      try {
        const result = await vtexProductService.syncProducts();
        return { success: true, result, type: 'products' };
      } catch (error) {
        console.error('❌ Erro no sync de produtos:', error);
        return { success: false, error: error.message, type: 'products' };
      }
    });

    // Aguardar um pouco antes de sync pedidos
    await step.sleep("wait-between-syncs", "30s");

    // Sync pedidos diretamente (sem disparar novo evento)
    const ordersResult = await step.run("sync-orders", async () => {
      const VtexOrdersService = require('../services/vtexOrdersService');
      const vtexOrdersService = new VtexOrdersService();
      try {
        const result = await vtexOrdersService.syncOrders();
        return { success: true, result, type: 'orders' };
      } catch (error) {
        console.error('❌ Erro no sync de pedidos:', error);
        return { success: false, error: error.message, type: 'orders' };
      }
    });

    return {
      success: true,
      mode: 'background-inngest-complete',
      productsSync: productsResult,
      ordersSync: ordersResult,
      timestamp: new Date().toISOString()
    };
  }
);

module.exports = {
  inngest,
  syncVTEXProducts,
  syncVTEXOrders,
  syncComplete,
  apiLimiter,
  productLimiter
};
