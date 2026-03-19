/**
 * Serviço SFTP dedicado para upload de pedidos (orders) para Emarsys.
 *
 * Usa variáveis SFTP_ORDERS_* para conexão.
 * Substitui o envio via HAPI (emarsysHapiService) quando configurado.
 *
 * TODO: Preencher SFTP_ORDERS_HOST, SFTP_ORDERS_USERNAME, SFTP_ORDERS_PASSWORD
 *       e SFTP_ORDERS_REMOTE_PATH no .env quando as credenciais forem fornecidas.
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class OrdersSftpService {
  constructor() {
    // Configurações SFTP dedicadas para PEDIDOS
    let sftpPassword = process.env.SFTP_ORDERS_PASSWORD;
    try {
      if (sftpPassword && sftpPassword.includes('%')) {
        sftpPassword = decodeURIComponent(sftpPassword);
      }
    } catch (e) {
      console.warn('⚠️ Não foi possível decodificar SFTP_ORDERS_PASSWORD, usando valor original');
    }

    this.sftpConfig = {
      host: process.env.SFTP_ORDERS_HOST,
      port: parseInt(process.env.SFTP_ORDERS_PORT || '22'),
      username: process.env.SFTP_ORDERS_USERNAME,
      password: sftpPassword,
      readyTimeout: parseInt(process.env.SFTP_READY_TIMEOUT) || 90000,
      keepaliveInterval: parseInt(process.env.SFTP_KEEPALIVE_INTERVAL) || 10000,
      keepaliveCountMax: parseInt(process.env.SFTP_KEEPALIVE_COUNT_MAX) || 10,
      strictVendor: false,
      timeout: 180000,
      algorithms: {
        kex: [
          'diffie-hellman-group1-sha1',
          'diffie-hellman-group14-sha1',
          'diffie-hellman-group-exchange-sha1',
          'diffie-hellman-group-exchange-sha256'
        ],
        cipher: [
          'aes128-ctr', 'aes192-ctr', 'aes256-ctr',
          'aes128-gcm', 'aes256-gcm',
          'aes128-cbc', 'aes192-cbc', 'aes256-cbc',
          '3des-cbc'
        ],
        serverHostKey: [
          'ssh-rsa', 'ssh-dss',
          'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521'
        ],
        hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1']
      }
    };

    this.sftpRemotePath = process.env.SFTP_ORDERS_REMOTE_PATH || '/orders/';
    this._validateConfig();
  }

  /**
   * Verifica se o serviço SFTP de pedidos está configurado
   * @returns {boolean}
   */
  isConfigured() {
    return !!(this.sftpConfig.host && this.sftpConfig.username && this.sftpConfig.password);
  }

  _validateConfig() {
    if (!this.isConfigured()) {
      console.warn('⚠️ SFTP de PEDIDOS não configurado (SFTP_ORDERS_HOST, SFTP_ORDERS_USERNAME, SFTP_ORDERS_PASSWORD)');
      console.warn('📤 Upload SFTP de pedidos usará HAPI como fallback');
    } else {
      console.log('✅ Configurações SFTP de PEDIDOS validadas');
      console.log(`   🌐 Host: ${this.sftpConfig.host}`);
      console.log(`   🔌 Porta: ${this.sftpConfig.port}`);
      console.log(`   👤 Usuário: ${this.sftpConfig.username}`);
      console.log(`   📂 Caminho remoto: ${this.sftpRemotePath}`);
    }
  }

  /**
   * Faz upload de arquivo CSV de pedidos via SFTP
   * @param {string} localFilePath - Caminho do arquivo local
   * @returns {Promise<Object>} Resultado do upload
   */
  async uploadOrdersFile(localFilePath) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'SFTP de pedidos não configurado. Defina SFTP_ORDERS_HOST, SFTP_ORDERS_USERNAME e SFTP_ORDERS_PASSWORD'
      };
    }

    const fileName = path.basename(localFilePath);
    const remotePath = path.posix.join(this.sftpRemotePath, fileName);

    console.log(`📤 [Orders SFTP] Enviando ${fileName} para ${this.sftpConfig.host}:${remotePath}`);

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this._upload(localFilePath, remotePath);
        console.log(`✅ [Orders SFTP] Upload concluído com sucesso (tentativa ${attempt})`);
        return {
          success: true,
          localPath: localFilePath,
          remotePath,
          bytesSent: result.bytesSent,
          attempt
        };
      } catch (error) {
        lastError = error;
        const delay = 3000 * Math.pow(2, attempt - 1);
        console.error(`❌ [Orders SFTP] Tentativa ${attempt}/${maxRetries} falhou: ${error.message}`);
        if (attempt < maxRetries) {
          console.log(`⏳ [Orders SFTP] Aguardando ${delay / 1000}s antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      error: `Falha após ${maxRetries} tentativas: ${lastError.message}`,
      localPath: localFilePath,
      remotePath
    };
  }

  /**
   * Executa upload via SFTP (stream)
   * @private
   */
  _upload(localFilePath, remotePath) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const fileStats = fs.statSync(localFilePath);
      const expectedSize = fileStats.size;
      let bytesSent = 0;

      conn.on('ready', () => {
        console.log(`🔗 [Orders SFTP] Conexão estabelecida com ${this.sftpConfig.host}`);

        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(new Error(`Erro ao iniciar SFTP: ${err.message}`));
          }

          const readStream = fs.createReadStream(localFilePath);
          const writeStream = sftp.createWriteStream(remotePath);

          readStream.on('data', (chunk) => {
            bytesSent += chunk.length;
            if (bytesSent % 102400 < chunk.length) {
              const pct = ((bytesSent / expectedSize) * 100).toFixed(1);
              console.log(`   📊 [Orders SFTP] Progresso: ${pct}% (${bytesSent}/${expectedSize} bytes)`);
            }
          });

          writeStream.on('finish', () => {
            setTimeout(() => {
              conn.end();
              if (bytesSent === expectedSize) {
                resolve({ bytesSent });
              } else {
                reject(new Error(`Tamanho inconsistente: enviado ${bytesSent}, esperado ${expectedSize}`));
              }
            }, 1000);
          });

          writeStream.on('error', (writeErr) => {
            conn.end();
            reject(new Error(`Erro na escrita SFTP: ${writeErr.message}`));
          });

          readStream.on('error', (readErr) => {
            conn.end();
            reject(new Error(`Erro na leitura do arquivo: ${readErr.message}`));
          });

          readStream.pipe(writeStream);
        });
      });

      conn.on('error', (connErr) => {
        reject(new Error(`Erro de conexão SFTP: ${connErr.message}`));
      });

      conn.connect(this.sftpConfig);
    });
  }

  /**
   * Testa a conexão SFTP de pedidos
   * @returns {Promise<Object>}
   */
  async testConnection() {
    if (!this.isConfigured()) {
      return { success: false, error: 'SFTP de pedidos não configurado' };
    }

    return new Promise((resolve) => {
      const conn = new Client();

      conn.on('ready', () => {
        console.log('✅ [Orders SFTP] Teste de conexão: OK');
        conn.end();
        resolve({ success: true, host: this.sftpConfig.host, port: this.sftpConfig.port });
      });

      conn.on('error', (err) => {
        console.error('❌ [Orders SFTP] Teste de conexão falhou:', err.message);
        resolve({ success: false, error: err.message });
      });

      conn.connect(this.sftpConfig);
    });
  }
}

module.exports = OrdersSftpService;
