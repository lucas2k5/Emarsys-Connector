'use strict';

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.VTEX_BASE_URL_HOPE || process.env.VTEX_BASE_URL || '';
const APP_KEY = process.env.VTEX_APP_KEY_HOPE || process.env.VTEX_APP_KEY || '';
const APP_TOKEN = process.env.VTEX_APP_TOKEN_HOPE || process.env.VTEX_APP_TOKEN || '';
const STORE_BASE_URL = process.env.STORE_BASE_URL || 'https://www.hopelingerie.com.br';

const CATEGORIAS_INVALIDAS = ['INATIVO', 'OUT'];

const CONFIG = {
  PAGE_SIZE:                      50,
  SEARCH_BATCH_SIZE:              50,
  INACTIVE_BATCH_SIZE:            25,
  DELAY_BETWEEN_PAGES:           200,
  DELAY_BETWEEN_SEARCH_BATCHES:  200,
  DELAY_BETWEEN_INACTIVE_BATCHES:150,
  MAX_RETRIES:                     3,
  RETRY_DELAY:                  2000,
  RATE_LIMIT_DELAY:             5000,
};

const VTEX_HEADERS = {
  'X-VTEX-API-AppKey':   APP_KEY,
  'X-VTEX-API-AppToken': APP_TOKEN,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, options = {}, retries = 0) {
  try {
    const response = await axios.get(url, { ...options, timeout: 30000 });
    return response.data;
  } catch (err) {
    const status = err.response?.status;

    if (status === 429) {
      console.log(`[vtex] 429 rate limit — aguardando ${CONFIG.RATE_LIMIT_DELAY}ms`);
      await sleep(CONFIG.RATE_LIMIT_DELAY);
      return fetchWithRetry(url, options, retries);
    }

    if (status === 404) return null;

    if (retries < CONFIG.MAX_RETRIES) {
      console.log(`[vtex] Erro ${status || err.code} — retry ${retries + 1}/${CONFIG.MAX_RETRIES}`);
      await sleep(CONFIG.RETRY_DELAY);
      return fetchWithRetry(url, options, retries + 1);
    }

    console.warn(`[vtex] Falha após ${CONFIG.MAX_RETRIES} tentativas: ${url}`);
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
  // Object.values() ordena chaves numéricas em ordem crescente (pai → filho)
  const parts = Object.values(categories);
  if (isInvalidCategory(parts)) return '';
  return parts.join(' > ');
}

function cleanText(text) {
  if (!text) return '';
  return text.replace(/[\r\n]+/g, ' ').trim();
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// PASSO 1 — GetProductAndSkuIds
async function fetchAllSkuIds() {
  const allSkuIds = [];
  let from = 1;
  let pageNum = 0;
  let total = null;

  while (true) {
    const to = from + CONFIG.PAGE_SIZE - 1;
    pageNum++;
    const url = `${BASE_URL}/api/catalog_system/pvt/products/GetProductAndSkuIds?_from=${from}&_to=${to}`;
    const data = await fetchWithRetry(url, { headers: VTEX_HEADERS });

    if (!data || typeof data !== 'object') break;

    const range = data.range || {};
    if (total === null) {
      total = range.total || 0;
      console.log(`[vtex] Coletando IDs... total: ${total.toLocaleString('pt-BR')} produtos`);
    }

    const productData = data.data || data;
    const entries = Object.entries(productData).filter(([k]) => k !== 'range');
    if (entries.length === 0) break;

    for (const [, skuIds] of entries) {
      if (Array.isArray(skuIds) && skuIds.length > 0) {
        allSkuIds.push(...skuIds);
      }
    }

    const totalPages = Math.ceil(total / CONFIG.PAGE_SIZE);
    console.log(`[vtex] Página ${pageNum}/${totalPages} → ${allSkuIds.length.toLocaleString('pt-BR')} skuIds`);

    if (total !== null && from + CONFIG.PAGE_SIZE - 1 >= total) break;
    from += CONFIG.PAGE_SIZE;
    await sleep(CONFIG.DELAY_BETWEEN_PAGES);
  }

  const unique = [...new Set(allSkuIds)];
  console.log(`[vtex] IDs coletados: ${unique.length.toLocaleString('pt-BR')} SKUs únicos`);
  return unique;
}

// PASSO 2 — products/search em lotes de 50
function mapSearchProductToRows(product) {
  if (!product.items || !Array.isArray(product.items)) return [];
  return product.items
    .map((sku) => {
      const offer = sku.sellers?.[0]?.commertialOffer;
      if (!offer) return null;
      return {
        item:         String(sku.itemId),
        title:        product.productName || '',
        link:         product.link || '',
        image:        sku.images?.[0]?.imageUrl || '',
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

async function fetchActiveProductRows(allSkuIds) {
  const batches = chunkArray(allSkuIds, CONFIG.SEARCH_BATCH_SIZE);
  const rows = [];
  const totalBatches = batches.length;

  console.log(`[vtex] Buscando ativos via products/search...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const queryString = batch.map((id) => `fq=skuId:${id}`).join('&');
    const url = `${BASE_URL}/api/catalog_system/pub/products/search?${queryString}`;

    try {
      const products = await fetchWithRetry(url, { headers: VTEX_HEADERS });
      if (Array.isArray(products)) {
        for (const product of products) {
          rows.push(...mapSearchProductToRows(product));
        }
      }
    } catch (err) {
      console.warn(`[vtex] Lote search ${i + 1}/${totalBatches} falhou: ${err.message}`);
    }

    if ((i + 1) % 100 === 0 || i + 1 === totalBatches) {
      console.log(`[vtex] ${rows.length.toLocaleString('pt-BR')} SKUs ativos encontrados (lote ${i + 1}/${totalBatches})`);
    }

    if (i + 1 < batches.length) {
      await sleep(CONFIG.DELAY_BETWEEN_SEARCH_BATCHES);
    }
  }

  return rows;
}

// PASSO 3 — stockkeepingunitbyid para inativos/invisíveis
function mapSkuDetailsToRow(sku) {
  const category = formatCategoryFromObject(sku.ProductCategories);

  return {
    item:         String(sku.Id),
    title:        sku.ProductName || '',
    link:         STORE_BASE_URL + (sku.DetailUrl || ''),
    image:        sku.Images?.[0]?.ImageUrl || '',
    category:     category,
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

async function fetchInactiveProductRows(inactiveSkuIds) {
  const rows = [];
  let errors = 0;
  const total = inactiveSkuIds.length;

  console.log(`[vtex] ${total.toLocaleString('pt-BR')} SKUs inativos para buscar via stockkeepingunitbyid`);

  for (let i = 0; i < inactiveSkuIds.length; i += CONFIG.INACTIVE_BATCH_SIZE) {
    const batch = inactiveSkuIds.slice(i, i + CONFIG.INACTIVE_BATCH_SIZE);

    const results = await Promise.all(
      batch.map((id) => {
        const url = `${BASE_URL}/api/catalog_system/pvt/sku/stockkeepingunitbyid/${id}`;
        return fetchWithRetry(url, { headers: VTEX_HEADERS });
      })
    );

    for (const sku of results) {
      if (sku && sku.Id) {
        rows.push(mapSkuDetailsToRow(sku));
      } else {
        errors++;
      }
    }

    const processed = Math.min(i + CONFIG.INACTIVE_BATCH_SIZE, total);
    if (processed % 5000 < CONFIG.INACTIVE_BATCH_SIZE || processed === total) {
      const suffix = processed === total && errors > 0 ? ` (${errors} erros ignorados)` : '';
      console.log(`[vtex] Inativos: ${processed.toLocaleString('pt-BR')}/${total.toLocaleString('pt-BR')} processados${suffix}`);
    }

    if (i + CONFIG.INACTIVE_BATCH_SIZE < inactiveSkuIds.length) {
      await sleep(CONFIG.DELAY_BETWEEN_INACTIVE_BATCHES);
    }
  }

  return rows;
}

async function fetchAllProductRows() {
  // PASSO 1: coletar todos os skuIds (ativos + inativos + invisíveis)
  const allSkuIds = await fetchAllSkuIds();

  // PASSO 2: buscar SKUs visíveis via products/search
  const activeRows = await fetchActiveProductRows(allSkuIds);

  // PASSO 3: buscar inativos/invisíveis via stockkeepingunitbyid
  const returnedSkuIds = new Set(activeRows.map((r) => String(r.item)));
  const inactiveSkuIds = allSkuIds.filter((id) => !returnedSkuIds.has(String(id)));

  const inactiveRows = await fetchInactiveProductRows(inactiveSkuIds);

  // Deduplicar: ativos têm prioridade (price, msrp, c_stock preenchidos)
  const map = new Map();
  for (const row of activeRows)   map.set(String(row.item), row);
  for (const row of inactiveRows) { if (!map.has(String(row.item))) map.set(String(row.item), row); }
  const allRows = Array.from(map.values());

  const duplicates = activeRows.length + inactiveRows.length - allRows.length;
  if (duplicates > 0) console.log(`[vtex] ${duplicates} duplicatas removidas (mantida versão ativa)`);

  console.log(`[vtex] Concluído: ${activeRows.length.toLocaleString('pt-BR')} ativos + ${inactiveRows.length.toLocaleString('pt-BR')} inativos = ${allRows.length.toLocaleString('pt-BR')} SKUs total`);

  return allRows;
}

module.exports = { fetchAllSkuIds, fetchActiveProductRows, fetchInactiveProductRows, fetchAllProductRows };
