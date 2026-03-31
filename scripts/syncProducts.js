'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');

const { generateCsv } = require('../helpers/csvHelper');
const { uploadToSftp } = require('../helpers/sftpHelper');
const VtexProductService = require('../services/vtexProductService');

const TMP_DIR = path.join(__dirname, '..', 'tmp');
const LAST_SYNC_FILE = path.join(TMP_DIR, 'lastSync.json');

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Extrai a última categoria folha de um caminho de categoria VTEX.
 * Ex: "/Sandálias/Anabela/" -> "Anabela"
 * @param {string} category
 * @returns {string}
 */
function extractLeafCategory(category) {
  if (!category) return '';
  const normalized = String(category).trim().replace(/^\/+|\/+$/g, '');
  if (!normalized) return '';
  const parts = normalized.split(/[\/>]/).filter(Boolean).map((s) => s.trim());
  return parts.length ? parts[parts.length - 1] : '';
}

/**
 * Converte um produto bruto da API pública da VTEX (com `items[]`) em um array
 * de rows flat no formato Emarsys (uma row por SKU).
 * @param {Object} product - Produto no formato retornado por getAllProductsFromApi
 * @returns {Array<Object>}
 */
function productToRows(product) {
  const rows = [];

  const category = extractLeafCategory(
    product.categories?.[0] || product.category || ''
  );

  if (product.items && Array.isArray(product.items) && product.items.length > 0) {
    for (const item of product.items) {
      const offer = item.sellers?.[0]?.commertialOffer || {};
      rows.push({
        item: String(item.referenceId?.[0]?.Value || item.itemId || ''),
        title: String(product.productName || ''),
        link: String(product.link || ''),
        image: String(item.images?.[0]?.imageUrl || ''),
        category,
        available: offer.IsAvailable ? 'true' : 'false',
        description: String(product.description || ''),
        price: String(offer.Price || 0),
        msrp: String(offer.ListPrice || 0),
        group_id: String(product.productId || ''),
        c_stock: String(offer.AvailableQuantity || 0),
        c_sku_id: String(item.itemId || ''),
        c_product_id: String(product.productId || ''),
      });
    }
  } else {
    // Fallback: produto sem items estruturados
    rows.push({
      item: String(product.referenceId?.[0]?.Value || product.productId || ''),
      title: String(product.productName || ''),
      link: String(product.link || ''),
      image: String(product.imageUrl || ''),
      category,
      available: 'true',
      description: String(product.description || ''),
      price: String(product.price || 0),
      msrp: String(product.listPrice || product.price || 0),
      group_id: String(product.productId || ''),
      c_stock: String(product.availableQuantity || 0),
      c_sku_id: String(product.skuId || product.productId || ''),
      c_product_id: String(product.productId || ''),
    });
  }

  return rows;
}

/**
 * Carga completa: busca todos os produtos via VtexProductService e retorna
 * rows flat no formato Emarsys.
 * @returns {Promise<Array<Object>>}
 */
async function fetchAllProductRows() {
  const service = new VtexProductService('hope');
  const products = await service.getAllProductsFromApi();
  const rows = [];
  for (const product of products) {
    rows.push(...productToRows(product));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Controle de lastSync
// ---------------------------------------------------------------------------

function readLastSync() {
  if (!fs.existsSync(LAST_SYNC_FILE)) return null;
  try {
    const raw = fs.readFileSync(LAST_SYNC_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.lastSync || null;
  } catch {
    return null;
  }
}

function writeLastSync(isoTimestamp) {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
  fs.writeFileSync(LAST_SYNC_FILE, JSON.stringify({ lastSync: isoTimestamp }), 'utf8');
}

// ---------------------------------------------------------------------------
// Sync incremental via API VTEX
// ---------------------------------------------------------------------------

/**
 * Cria um cliente Axios autenticado para a API VTEX.
 * @returns {import('axios').AxiosInstance}
 */
function buildVtexClient() {
  return axios.create({
    baseURL: process.env.VTEX_BASE_URL,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
      'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
    },
    timeout: 60000,
  });
}

/**
 * Busca todos os SKU IDs modificados desde `since` paginando de 50 em 50.
 * Endpoint: GET /api/catalog_system/pvt/products/GetProductAndSkuIds
 *           ?_from=1&_to=50&dateModified={since}
 * @param {string} since - ISO timestamp
 * @returns {Promise<number[]>}
 */
async function fetchModifiedSkuIds(since) {
  const client = buildVtexClient();
  const pageSize = 50;
  let from = 1;
  const allSkuIds = [];

  while (true) {
    const to = from + pageSize - 1;
    const url = `/api/catalog_system/pvt/products/GetProductAndSkuIds?_from=${from}&_to=${to}&dateModified=${encodeURIComponent(since)}`;
    const response = await client.get(url);
    const data = response.data;

    if (!data || typeof data !== 'object') break;

    // A resposta é { "productId": [skuId, ...], ... }
    const entries = Object.entries(data);
    if (entries.length === 0) break;

    for (const [, skuIds] of entries) {
      if (Array.isArray(skuIds)) {
        allSkuIds.push(...skuIds);
      }
    }

    // Se retornou menos de pageSize produtos, não há mais páginas
    if (entries.length < pageSize) break;

    from += pageSize;
  }

  return allSkuIds;
}

/**
 * Busca os detalhes de um SKU específico.
 * Endpoint: GET /api/catalog_system/pvt/sku/stockkeepingunitbyid/{skuId}
 * @param {import('axios').AxiosInstance} client
 * @param {number} skuId
 * @returns {Promise<Object|null>}
 */
async function fetchSkuById(client, skuId) {
  try {
    const response = await client.get(
      `/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`
    );
    return response.data || null;
  } catch (err) {
    console.warn(`⚠️ [syncProducts] Falha ao buscar SKU ${skuId}: ${err.message}`);
    return null;
  }
}

/**
 * Converte um objeto retornado por stockkeepingunitbyid em uma row flat Emarsys.
 * @param {Object} sku
 * @returns {Object}
 */
function skuDetailToRow(sku) {
  return {
    item: String(sku.RefId || sku.Id || ''),
    title: String(sku.NameComplete || sku.ProductName || ''),
    link: String(sku.DetailUrl || ''),
    image: String(sku.ImageUrl || ''),
    category: '',
    available: sku.IsActive ? 'true' : 'false',
    description: String(sku.ProductDescription || ''),
    price: String(sku.Price || 0),
    msrp: String(sku.ListPrice || sku.Price || 0),
    group_id: String(sku.ProductId || ''),
    c_stock: String(sku.AvailableQuantity || 0),
    c_sku_id: String(sku.Id || ''),
    c_product_id: String(sku.ProductId || ''),
  };
}

/**
 * Fluxo incremental: busca SKUs modificados desde `lastSync` e retorna rows.
 * @param {string} lastSync - ISO timestamp
 * @returns {Promise<Array<Object>>}
 */
async function fetchIncrementalRows(lastSync) {
  console.log(`🔄 [syncProducts] Buscando SKUs modificados desde ${lastSync}...`);

  const skuIds = await fetchModifiedSkuIds(lastSync);
  console.log(`📊 [syncProducts] SKUs modificados encontrados: ${skuIds.length}`);

  if (skuIds.length === 0) return [];

  const client = buildVtexClient();
  const rows = [];
  const batchSize = 10;

  for (let i = 0; i < skuIds.length; i += batchSize) {
    const batch = skuIds.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((id) => fetchSkuById(client, id)));

    for (const sku of results) {
      if (sku) {
        rows.push(skuDetailToRow(sku));
      }
    }

    if (i + batchSize < skuIds.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Fluxo principal de sincronização
// ---------------------------------------------------------------------------

async function runSync() {
  const syncStart = new Date().toISOString();
  console.log(`🚀 [syncProducts] Iniciando sync em ${syncStart}`);

  let rows = [];

  try {
    const lastSync = readLastSync();

    if (!lastSync) {
      console.log('🔄 [syncProducts] Primeira execução — carga completa');
      rows = await fetchAllProductRows();
    } else {
      console.log(`🔄 [syncProducts] Sync incremental desde ${lastSync}`);
      rows = await fetchIncrementalRows(lastSync);
    }

    if (rows.length === 0) {
      console.log('✅ [syncProducts] Nenhuma linha para exportar. Atualizando lastSync.');
      writeLastSync(syncStart);
      return;
    }

    console.log(`📊 [syncProducts] ${rows.length} rows para exportar`);

    const { filePath, fileName } = generateCsv(rows);
    console.log(`✅ [syncProducts] CSV gerado: ${fileName}`);

    await uploadToSftp(filePath, fileName);
    console.log(`✅ [syncProducts] Upload SFTP concluído: ${fileName}`);

    writeLastSync(syncStart);
    console.log(`✅ [syncProducts] lastSync atualizado: ${syncStart}`);
  } catch (err) {
    console.error(`❌ [syncProducts] Erro durante sync: ${err.message}`);
    console.error(err.stack);
    // Não atualiza lastSync para garantir reprocessamento na próxima execução
  }
}

// ---------------------------------------------------------------------------
// Agendamento com node-cron
// ---------------------------------------------------------------------------

// Executar imediatamente ao iniciar o processo
runSync();

// Cron a cada 8h: 00h, 08h e 16h
cron.schedule('0 0,8,16 * * *', () => {
  console.log('🕐 [syncProducts] Cron disparado');
  runSync();
});

console.log('🕐 [syncProducts] Agendamento configurado — cron: 0 0,8,16 * * *');
