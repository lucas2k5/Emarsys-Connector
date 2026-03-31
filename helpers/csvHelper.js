'use strict';

const fs = require('fs');
const path = require('path');

const COLUMNS = [
  'item',
  'title',
  'link',
  'image',
  'category',
  'available',
  'description',
  'price',
  'msrp',
  'group_id',
  'c_stock',
  'c_sku_id',
  'c_product_id',
];

const TMP_DIR = path.join(__dirname, '..', 'tmp');

/**
 * Escapa um valor para ser inserido em uma célula CSV:
 * - null/undefined → string vazia
 * - Campos com vírgula, aspas ou quebra de linha ficam entre aspas duplas
 * - Aspas internas são duplicadas ("")
 * @param {*} value
 * @returns {string}
 */
function escapeField(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Retorna o nome padrão do arquivo CSV de produtos.
 * @returns {string}
 */
function buildFileName() {
  return 'products.csv';
}

/**
 * Gera um arquivo CSV no padrão Emarsys a partir de um array de rows.
 * Cada row deve ser um objeto com as chaves correspondentes às colunas.
 * @param {Array<Object>} rows
 * @returns {{ filePath: string, fileName: string }}
 */
function generateCsv(rows) {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }

  const fileName = buildFileName();
  const filePath = path.join(TMP_DIR, fileName);

  const headerLine = COLUMNS.join(',');
  const lines = [headerLine];

  for (const row of rows) {
    const cells = COLUMNS.map((col) => escapeField(row[col]));
    lines.push(cells.join(','));
  }

  // UTF-8 com BOM
  const bom = '\ufeff';
  const content = bom + lines.join('\n') + '\n';

  fs.writeFileSync(filePath, content, { encoding: 'utf8' });

  return { filePath, fileName };
}

module.exports = { generateCsv };
