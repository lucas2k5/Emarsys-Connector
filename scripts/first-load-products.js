'use strict';

require('dotenv').config();

const { fetchAllProductRows, fetchAllProductRowsResort } = require('../services/vtexProductService');
const { generateCsv } = require('../helpers/csvHelper');
const { uploadToSftp, uploadToSftpResort } = require('../helpers/sftpHelper');

async function run() {
  console.log('\n' + '='.repeat(60));
  console.log('CARGA INICIAL DE PRODUTOS — Hope Lingerie + Hope Resort');
  console.log('='.repeat(60) + '\n');

  // ── Hope Lingerie ──────────────────────────────────────────
  console.log('[1/2] Iniciando Hope Lingerie...');
  const t1 = Date.now();
  try {
    const rows = await fetchAllProductRows();
    const { filePath, fileName } = generateCsv(rows);
    await uploadToSftp(filePath, fileName);
    console.log(`[1/2] ✓ Hope Lingerie — ${rows.length.toLocaleString('pt-BR')} SKUs em ${((Date.now() - t1) / 1000).toFixed(1)}s\n`);
  } catch (err) {
    console.error('[1/2] ✗ ERRO Hope Lingerie:', err.message);
  }

  // ── Hope Resort ────────────────────────────────────────────
  console.log('[2/2] Iniciando Hope Resort...');
  const t2 = Date.now();
  try {
    const rows = await fetchAllProductRowsResort();
    const { filePath, fileName } = generateCsv(rows, 'product.csv');
    await uploadToSftpResort(filePath, fileName);
    console.log(`[2/2] ✓ Hope Resort — ${rows.length.toLocaleString('pt-BR')} SKUs em ${((Date.now() - t2) / 1000).toFixed(1)}s\n`);
  } catch (err) {
    console.error('[2/2] ✗ ERRO Hope Resort:', err.message);
  }

  console.log('='.repeat(60));
  console.log('Carga inicial concluída.');
  console.log('='.repeat(60) + '\n');
}

run().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
