'use strict';

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function generatePng() {
  const htmlPath = path.resolve('/Users/luhem/Downloads/arquitetura_emarsys_connector_1.html');
  const outPath  = path.resolve(__dirname, '../docs/arquitetura.png');

  if (!fs.existsSync(htmlPath)) {
    console.error(`Arquivo não encontrado: ${htmlPath}`);
    process.exit(1);
  }

  console.log('Iniciando Puppeteer...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page    = await browser.newPage();

  // Viewport largo para capturar o diagrama completo
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });

  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  // Aguarda animações estabilizarem
  await new Promise(r => setTimeout(r, 1500));

  // Captura altura total do documento
  const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewport({ width: 1600, height: bodyHeight, deviceScaleFactor: 2 });
  await new Promise(r => setTimeout(r, 500));

  await page.screenshot({
    path: outPath,
    fullPage: true,
    type: 'png',
  });

  await browser.close();

  const sizeKb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`✅ PNG gerado: ${outPath} (${sizeKb} KB)`);
}

generatePng().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
