'use strict';

const SftpClient = require('ssh2-sftp-client');
const path = require('path');

/**
 * Faz upload de um arquivo local para o servidor SFTP configurado via variáveis de ambiente.
 *
 * Variáveis de ambiente utilizadas:
 *   SFTP_HOST         — obrigatório
 *   SFTP_PORT         — padrão: 22
 *   SFTP_USER         — obrigatório
 *   SFTP_PASSWORD     — obrigatório
 *   SFTP_REMOTE_DIR   — padrão: '/uploads'
 *
 * @param {string} localFilePath - Caminho absoluto do arquivo local
 * @param {string} fileName      - Nome do arquivo de destino no servidor remoto
 * @returns {Promise<void>}
 */
async function uploadToSftp(localFilePath, fileName) {
  const host = process.env.SFTP_PRODUCTS_HOST || process.env.SFTP_HOST;
  const port = parseInt(process.env.SFTP_PRODUCTS_PORT || process.env.SFTP_PORT || '22', 10);
  const username = process.env.SFTP_PRODUCTS_USERNAME || process.env.SFTP_USER || process.env.SFTP_USERNAME;
  const password = process.env.SFTP_PRODUCTS_PASSWORD || process.env.SFTP_PASSWORD;
  const remoteDir = process.env.SFTP_PRODUCTS_REMOTE_PATH || process.env.SFTP_REMOTE_DIR || '/';

  if (!host) {
    throw new Error('uploadToSftp: variável SFTP_HOST não definida');
  }
  if (!username) {
    throw new Error('uploadToSftp: variável SFTP_USER não definida');
  }
  if (!password) {
    throw new Error('uploadToSftp: variável SFTP_PASSWORD não definida');
  }

  const remotePath = remoteDir.endsWith('/')
    ? remoteDir + fileName
    : remoteDir + '/' + fileName;

  const sftp = new SftpClient();

  try {
    await sftp.connect({
      host,
      port,
      username,
      password,
      readyTimeout: 30000,
      keepaliveInterval: 5000,
      keepaliveCountMax: 10,
    });
    await sftp.fastPut(localFilePath, remotePath, { chunkSize: 65536, concurrency: 4 });
    console.log(`✅ [sftpHelper] Upload concluído: ${remotePath}`);
  } finally {
    await sftp.end();
  }
}

// Upload para Hope Resort — usa RESORT_SFTP_* se definido, cai no mesmo SFTP da Hope caso contrário
async function uploadToSftpResort(localFilePath, fileName) {
  const host     = process.env.RESORT_SFTP_HOST     || process.env.SFTP_PRODUCTS_HOST || process.env.SFTP_HOST;
  const port     = parseInt(process.env.RESORT_SFTP_PORT || process.env.SFTP_PRODUCTS_PORT || process.env.SFTP_PORT || '22', 10);
  const username = process.env.RESORT_SFTP_USER     || process.env.SFTP_PRODUCTS_USERNAME || process.env.SFTP_USER || process.env.SFTP_USERNAME;
  const password = process.env.RESORT_SFTP_PASSWORD || process.env.SFTP_PRODUCTS_PASSWORD || process.env.SFTP_PASSWORD;
  const remoteDir = process.env.RESORT_SFTP_REMOTE_DIR || process.env.SFTP_PRODUCTS_REMOTE_PATH || process.env.SFTP_REMOTE_DIR || '/';

  if (!host)     throw new Error('uploadToSftpResort: SFTP host não definido');
  if (!username) throw new Error('uploadToSftpResort: SFTP user não definido');
  if (!password) throw new Error('uploadToSftpResort: SFTP password não definido');

  const remotePath = remoteDir.endsWith('/') ? remoteDir + fileName : remoteDir + '/' + fileName;

  const sftp = new SftpClient();
  try {
    await sftp.connect({
      host,
      port,
      username,
      password,
      readyTimeout: 30000,
      keepaliveInterval: 5000,
      keepaliveCountMax: 10,
    });
    await sftp.fastPut(localFilePath, remotePath, { chunkSize: 65536, concurrency: 4 });
    console.log(`✅ [sftpHelper] Upload Resort concluído: ${remotePath}`);
  } finally {
    await sftp.end();
  }
}

module.exports = { uploadToSftp, uploadToSftpResort };
