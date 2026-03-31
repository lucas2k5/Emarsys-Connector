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
  const host = process.env.SFTP_HOST;
  const port = parseInt(process.env.SFTP_PORT || '22', 10);
  const username = process.env.SFTP_USER;
  const password = process.env.SFTP_PASSWORD;
  const remoteDir = process.env.SFTP_REMOTE_DIR || '/uploads';

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
    await sftp.connect({ host, port, username, password });
    await sftp.put(localFilePath, remotePath);
    console.log(`✅ [sftpHelper] Upload concluído: ${remotePath}`);
  } finally {
    await sftp.end();
  }
}

module.exports = { uploadToSftp };
