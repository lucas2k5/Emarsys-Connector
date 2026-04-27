'use strict';

require('dotenv').config();

const cron = require('node-cron');
const { fetchAllProductRows, fetchAllProductRowsResort } = require('../services/vtexProductService');
const { generateCsv } = require('../helpers/csvHelper');
const { uploadToSftp, uploadToSftpResort } = require('../helpers/sftpHelper');

// Hope Lingerie
async function runSync() {
  const startedAt = new Date();
  console.log(`\n${'='.repeat(50)}`);
  console.log(`[sync] Iniciando Hope Lingerie: ${startedAt.toISOString()}`);
  console.log(`${'='.repeat(50)}`);

  try {
    const rows = await fetchAllProductRows();
    const { filePath, fileName } = generateCsv(rows);
    await uploadToSftp(filePath, fileName);

    const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[sync] ✓ Hope Lingerie concluído em ${duration}s — ${rows.length.toLocaleString('pt-BR')} SKUs exportados`);
  } catch (err) {
    console.error('[sync] ✗ ERRO Hope Lingerie:', err.message);
    console.error(err.stack);
  }

  console.log(`${'='.repeat(50)}\n`);
}

// Hope Resort
async function runSyncResort() {
  const startedAt = new Date();
  console.log(`\n${'='.repeat(50)}`);
  console.log(`[sync-resort] Iniciando Hope Resort: ${startedAt.toISOString()}`);
  console.log(`${'='.repeat(50)}`);

  try {
    const rows = await fetchAllProductRowsResort();
    const { filePath, fileName } = generateCsv(rows, 'product_resort.csv');
    await uploadToSftpResort(filePath, fileName);

    const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[sync-resort] ✓ Hope Resort concluído em ${duration}s — ${rows.length.toLocaleString('pt-BR')} SKUs exportados`);
  } catch (err) {
    console.error('[sync-resort] ✗ ERRO Hope Resort:', err.message);
    console.error(err.stack);
  }

  console.log(`${'='.repeat(50)}\n`);
}

// Hope Lingerie às 02h
cron.schedule('0 2 * * *', runSync, { timezone: 'America/Sao_Paulo' });

// Hope Resort às 03h (1h depois para não sobrecarregar)
cron.schedule('0 3 * * *', runSyncResort, { timezone: 'America/Sao_Paulo' });

// Executa imediatamente ao iniciar
runSync();
