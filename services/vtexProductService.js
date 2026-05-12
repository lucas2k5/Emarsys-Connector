'use strict';

require('dotenv').config();
const axios = require('axios');

// Credenciais Hope Lingerie
const BASE_URL      = process.env.VTEX_BASE_URL_HOPE  || process.env.VTEX_BASE_URL  || '';
const APP_KEY       = process.env.VTEX_APP_KEY_HOPE   || process.env.VTEX_APP_KEY   || '';
const APP_TOKEN     = process.env.VTEX_APP_TOKEN_HOPE || process.env.VTEX_APP_TOKEN || '';
const STORE_BASE_URL = process.env.STORE_BASE_URL || 'https://www.hopelingerie.com.br';

// Credenciais Hope Resort
const RESORT_BASE_URL       = process.env.RESORT_VTEX_BASE_URL   || '';
const RESORT_APP_KEY        = process.env.RESORT_VTEX_APP_KEY    || '';
const RESORT_APP_TOKEN      = process.env.RESORT_VTEX_APP_TOKEN  || '';
const RESORT_STORE_BASE_URL = process.env.RESORT_STORE_BASE_URL  || 'https://www.lojahr.com.br';

const CATEGORIAS_INVALIDAS = ['INATIVO', 'OUT'];

const CONFIG = {
  PAGE_SIZE:                       50,
  SEARCH_BATCH_SIZE:               50,
  INACTIVE_BATCH_SIZE:             50,
  DELAY_BETWEEN_PAGES:            200,
  DELAY_BETWEEN_SEARCH_BATCHES:   200,
  DELAY_BETWEEN_INACTIVE_BATCHES: 100,
  MAX_RETRIES:                      3,
  RETRY_DELAY:                   2000,
  RATE_LIMIT_DELAY:              5000,
};

function makeHeaders(key, token) {
  return {
    'X-VTEX-API-AppKey':   key,
    'X-VTEX-API-AppToken': token,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, options = {}, retries = 0, tag = 'vtex') {
  try {
    const response = await axios.get(url, { ...options, timeout: 30000 });
    return response.data;
  } catch (err) {
    const status = err.response?.status;

    if (status === 429) {
      console.log(`[${tag}] 429 rate limit — aguardando ${CONFIG.RATE_LIMIT_DELAY}ms`);
      await sleep(CONFIG.RATE_LIMIT_DELAY);
      return fetchWithRetry(url, options, retries, tag);
    }

    if (status === 404) return null;

    if (retries < CONFIG.MAX_RETRIES) {
      console.log(`[${tag}] Erro ${status || err.code} — retry ${retries + 1}/${CONFIG.MAX_RETRIES}`);
      await sleep(CONFIG.RETRY_DELAY);
      return fetchWithRetry(url, options, retries + 1, tag);
    }

    console.warn(`[${tag}] Falha após ${CONFIG.MAX_RETRIES} tentativas: ${url}`);
    return null;
  }
}

function isInvalidCategory(parts) {
  return parts.some((p) =>
    CATEGORIAS_INVALIDAS.includes(p.trim().replace(/[\[\]]/g, '').toUpperCase())
  );
}

function formatCategoryPath(categoryPath) {
  if (!categoryPath) return '';
  const parts = categoryPath.split('/').filter(Boolean);
  if (isInvalidCategory(parts)) return '';
  return parts.join(' > ');
}

function formatCategoryFromObject(categories) {
  if (!categories) return '';
  const parts = Object.values(categories);
  if (isInvalidCategory(parts)) return '';
  return parts.join(' > ');
}

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\x00/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[•·▪▸►▶–—]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function encodeImageUrl(url) {
  if (!url) return '';
  return url.replace(/ /g, '%20');
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// PASSO 1 — GetProductAndSkuIds
async function fetchAllSkuIds(baseUrl, headers, tag) {
  const allSkuIds = [];
  let from = 1;
  let pageNum = 0;
  let total = null;

  while (true) {
    const to  = from + CONFIG.PAGE_SIZE - 1;
    pageNum++;
    const url = `${baseUrl}/api/catalog_system/pvt/products/GetProductAndSkuIds?_from=${from}&_to=${to}`;
    const data = await fetchWithRetry(url, { headers }, 0, tag);

    if (!data || typeof data !== 'object') break;

    const range = data.range || {};
    if (total === null) {
      total = range.total || 0;
      console.log(`[${tag}] Coletando IDs... total: ${total.toLocaleString('pt-BR')} produtos`);
    }

    const productData = data.data || data;
    const entries = Object.entries(productData).filter(([k]) => k !== 'range');
    if (entries.length === 0) break;

    for (const [, skuIds] of entries) {
      if (Array.isArray(skuIds) && skuIds.length > 0) allSkuIds.push(...skuIds);
    }

    const totalPages = Math.ceil(total / CONFIG.PAGE_SIZE);
    console.log(`[${tag}] Página ${pageNum}/${totalPages} → ${allSkuIds.length.toLocaleString('pt-BR')} skuIds`);

    if (total !== null && from + CONFIG.PAGE_SIZE - 1 >= total) break;
    from += CONFIG.PAGE_SIZE;
    await sleep(CONFIG.DELAY_BETWEEN_PAGES);
  }

  const unique = [...new Set(allSkuIds)];
  console.log(`[${tag}] IDs coletados: ${unique.length.toLocaleString('pt-BR')} SKUs únicos`);
  return unique;
}

// PASSO 2 — products/search em lotes de 50
function mapSearchProductToRows(product) {
  if (!product.items || !Array.isArray(product.items)) return [];
  return product.items
    .map((sku) => {
      const offer = sku.sellers?.[0]?.commertialOffer;
      if (!offer) return null;
      const refId = sku.referenceId?.[0]?.Value || String(sku.itemId);
      return {
        item:         refId,
        title:        product.productName || '',
        link:         product.link || '',
        image:        encodeImageUrl(sku.images?.[0]?.imageUrl || ''),
        category:     formatCategoryPath(product.categories?.[0]),
        available:    String(offer.IsAvailable ?? false),
        description:  cleanText(product.description),
        price:        offer.Price ?? '',
        msrp:         offer.ListPrice ?? '',
        group_id:     String(product.productId),
        c_stock:      offer.AvailableQuantity ?? 0,
        c_sku_id:     String(sku.itemId),
        c_product_id: String(product.productId),
      };
    })
    .filter(Boolean);
}

async function fetchActiveProductRows(allSkuIds, baseUrl, headers, tag) {
  const batches = chunkArray(allSkuIds, CONFIG.SEARCH_BATCH_SIZE);
  const rows = [];
  const totalBatches = batches.length;

  console.log(`[${tag}] Buscando ativos via products/search...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const queryString = batch.map((id) => `fq=skuId:${id}`).join('&');
    const url = `${baseUrl}/api/catalog_system/pub/products/search?${queryString}`;

    try {
      const products = await fetchWithRetry(url, { headers }, 0, tag);
      if (Array.isArray(products)) {
        for (const product of products) rows.push(...mapSearchProductToRows(product));
      }
    } catch (err) {
      console.warn(`[${tag}] Lote search ${i + 1}/${totalBatches} falhou: ${err.message}`);
    }

    if ((i + 1) % 100 === 0 || i + 1 === totalBatches) {
      console.log(`[${tag}] ${rows.length.toLocaleString('pt-BR')} SKUs ativos encontrados (lote ${i + 1}/${totalBatches})`);
    }

    if (i + 1 < batches.length) await sleep(CONFIG.DELAY_BETWEEN_SEARCH_BATCHES);
  }

  return rows;
}

// PASSO 3 — stockkeepingunitbyid para inativos/invisíveis
function mapSkuDetailsToRow(sku, storeBaseUrl) {
  const refId = sku.AlternateIds?.RefId || (sku.ProductRefId + sku.SkuName) || String(sku.Id);
  return {
    item:         refId,
    title:        sku.ProductName || '',
    link:         storeBaseUrl + (sku.DetailUrl || ''),
    image:        encodeImageUrl(sku.Images?.[0]?.ImageUrl || ''),
    category:     formatCategoryFromObject(sku.ProductCategories),
    available:    String(sku.IsActive ?? false),
    description:  cleanText(sku.ProductDescription),
    price:        '',
    msrp:         '',
    group_id:     String(sku.ProductId),
    c_stock:      0,
    c_sku_id:     String(sku.Id),
    c_product_id: String(sku.ProductId),
  };
}

async function fetchInactiveProductRows(inactiveSkuIds, baseUrl, headers, storeBaseUrl, tag) {
  const rows = [];
  let errors = 0;
  const total = inactiveSkuIds.length;

  console.log(`[${tag}] ${total.toLocaleString('pt-BR')} SKUs inativos para buscar via stockkeepingunitbyid`);

  for (let i = 0; i < inactiveSkuIds.length; i += CONFIG.INACTIVE_BATCH_SIZE) {
    const batch = inactiveSkuIds.slice(i, i + CONFIG.INACTIVE_BATCH_SIZE);

    const results = await Promise.all(
      batch.map((id) =>
        fetchWithRetry(`${baseUrl}/api/catalog_system/pvt/sku/stockkeepingunitbyid/${id}`, { headers }, 0, tag)
      )
    );

    for (const sku of results) {
      if (sku && sku.Id) {
        rows.push(mapSkuDetailsToRow(sku, storeBaseUrl));
      } else {
        errors++;
      }
    }

    const processed = Math.min(i + CONFIG.INACTIVE_BATCH_SIZE, total);
    if (processed % 5000 < CONFIG.INACTIVE_BATCH_SIZE || processed === total) {
      const suffix = processed === total && errors > 0 ? ` (${errors} erros ignorados)` : '';
      console.log(`[${tag}] Inativos: ${processed.toLocaleString('pt-BR')}/${total.toLocaleString('pt-BR')} processados${suffix}`);
    }

    if (i + CONFIG.INACTIVE_BATCH_SIZE < inactiveSkuIds.length) await sleep(CONFIG.DELAY_BETWEEN_INACTIVE_BATCHES);
  }

  return rows;
}

// Lógica compartilhada — recebe credenciais como parâmetro
async function _fetchAllProductRows({ baseUrl, headers, storeBaseUrl, tag }) {
  const allSkuIds  = await fetchAllSkuIds(baseUrl, headers, tag);
  const activeRows = await fetchActiveProductRows(allSkuIds, baseUrl, headers, tag);

  const returnedSkuIds = new Set(activeRows.map((r) => String(r.item)));
  const inactiveSkuIds = allSkuIds.filter((id) => !returnedSkuIds.has(String(id)));
  const inactiveRows   = await fetchInactiveProductRows(inactiveSkuIds, baseUrl, headers, storeBaseUrl, tag);

  const map = new Map();
  for (const row of activeRows)   map.set(String(row.item), row);
  for (const row of inactiveRows) { if (!map.has(String(row.item))) map.set(String(row.item), row); }
  const allRows = Array.from(map.values());

  const duplicates = activeRows.length + inactiveRows.length - allRows.length;
  if (duplicates > 0) console.log(`[${tag}] ${duplicates} duplicatas removidas (mantida versão ativa)`);

  console.log(`[${tag}] Concluído: ${activeRows.length.toLocaleString('pt-BR')} ativos + ${inactiveRows.length.toLocaleString('pt-BR')} inativos = ${allRows.length.toLocaleString('pt-BR')} SKUs total`);
  return allRows;
}

async function fetchAllProductRows() {
  return _fetchAllProductRows({
    baseUrl:      BASE_URL,
    headers:      makeHeaders(APP_KEY, APP_TOKEN),
    storeBaseUrl: STORE_BASE_URL,
    tag:          'vtex',
  });
}

async function fetchAllProductRowsResort() {
  return _fetchAllProductRows({
    baseUrl:      RESORT_BASE_URL,
    headers:      makeHeaders(RESORT_APP_KEY, RESORT_APP_TOKEN),
    storeBaseUrl: RESORT_STORE_BASE_URL,
    tag:          'vtex-resort',
  });
}

module.exports = { fetchAllProductRows, fetchAllProductRowsResort };
