'use strict';

require('dotenv').config();

const cron = require('node-cron');
const { fetchAllProductRows } = require('../services/vtexProductService');
const { generateCsv } = require('../helpers/csvHelper');
const { uploadToSftp } = require('../helpers/sftpHelper');

async function runSync() {
  const startedAt = new Date();
  console.log(`\n${'='.repeat(50)}`);
  console.log(`[sync] Iniciando: ${startedAt.toISOString()}`);
  console.log(`${'='.repeat(50)}`);

  try {
    const rows = await fetchAllProductRows();
    const { filePath, fileName } = generateCsv(rows);
    await uploadToSftp(filePath, fileName);

    const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[sync] ✓ Concluído em ${duration}s — ${rows.length.toLocaleString('pt-BR')} SKUs exportados`);
  } catch (err) {
    console.error('[sync] ✗ ERRO:', err.message);
    console.error(err.stack);
  }

  console.log(`${'='.repeat(50)}\n`);
}

// Cron: 1x por dia às 02h
cron.schedule('0 2 * * *', runSync, { timezone: 'America/Sao_Paulo' });

// Executa imediatamente ao iniciar
runSync();
