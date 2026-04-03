'use strict';

const fs = require('fs');
const path = require('path');

const CSV_HEADERS = [
  'item', 'title', 'link', 'image', 'category',
  'available', 'description', 'price', 'msrp',
  'group_id', 'c_stock', 'c_sku_id', 'c_product_id',
];

const TMP_DIR = path.join(__dirname, '..', 'tmp');

function escapeField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function generateCsv(rows) {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }

  const fileName = 'products.csv';
  const filePath = path.join(TMP_DIR, fileName);

  const headerLine = CSV_HEADERS.join(',');
  const lines = [headerLine];

  for (const row of rows) {
    const cells = CSV_HEADERS.map((col) => escapeField(row[col]));
    lines.push(cells.join(','));
  }

  const bom = '\uFEFF';
  const content = bom + lines.join('\n') + '\n';

  fs.writeFileSync(filePath, content, { encoding: 'utf8' });
  console.log(`[csv] products.csv gerado: ${rows.length} linhas`);

  return { filePath, fileName };
}

module.exports = { generateCsv };
