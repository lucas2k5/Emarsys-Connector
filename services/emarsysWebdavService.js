const endOfStream = require('end-of-stream');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class EmarsysWebdavService {
  constructor() {
    this.client = null;
    this.clientPromise = null;
  }

  async _getOrCreateClient() {
    if (this.client) {
      return this.client;
    }
    
    if (this.clientPromise) {
      return this.clientPromise;
    }

    this.clientPromise = (async () => {
      const { createClient } = await import('webdav');
      this.client = createClient(
        process.env.WEBDAV_SERVER,
        {
          username: process.env.WEBDAV_USER,
          password: process.env.WEBDAV_PASS
        }
      );
      return this.client;
    })();

    return this.clientPromise;
  }

  /**
   * Envia arquivo de catálogo para Emarsys via WebDAV
   * @param {string} filePath - Caminho do arquivo local
   * @param {string} remotePath - Caminho remoto (opcional)
   * @returns {Promise<Object>} Resultado do envio
   */
  async uploadCatalogFile(filePath, remotePath = null) {
    try {
      const fsPromises = require('fs/promises');
      
      // Check if file exists
      await fsPromises.access(filePath);
      
      // Get file stats
      const stats = await fsPromises.stat(filePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      
      const path = require('path');
      const absolutePath = path.resolve(filePath);
      console.log(`📁 File: ${absolutePath}`);
      console.log(`📊 Size: ${fileSizeInMB.toFixed(2)} MB`);
      
      // Use provided remote path or default
      const finalRemotePath = remotePath || `/catalog/${path.basename(filePath)}`;
      
      const client = await this._getOrCreateClient();
      const stream = fs.createReadStream(filePath);
      
      return new Promise((resolve, reject) => {
        const uploadStream = client.createWriteStream(finalRemotePath);
        stream.pipe(uploadStream);
        
        endOfStream(uploadStream, (err) => {
          if (err) {
            console.error('🚨 ERRO EMARSYS WEBDAV:');
            console.error('   📝 Mensagem: ' + err.message);
            console.error('   📁 Arquivo: ' + absolutePath);
            reject({ 
              success: false, 
              error: err.message,
              filePath: absolutePath
            });
          } else {
            console.log('🎯 RESPOSTA EMARSYS WEBDAV RECEBIDA:');
            console.log('   📊 Status: Sucesso');
            console.log('   📂 Caminho remoto: ' + finalRemotePath);
            console.log('   📏 Bytes enviados: ' + bytesSent);
            
            resolve({ 
              success: true, 
              message: 'Catalog upload completed successfully',
              filePath: absolutePath,
              remotePath: finalRemotePath,
              fileSize: fileSizeInMB.toFixed(2)
            });
          }
        });
      });
    } catch (error) {
      console.error('🚨 ERRO EMARSYS WEBDAV:');
      console.error('   📝 Mensagem: ' + error.message);
      console.error('   📁 Arquivo: ' + absolutePath);
      return {
        success: false,
        error: error.message,
        filePath: absolutePath
      };
    }
  }

  async listFiles(remotePath = '/') {
    try {
      const client = await this._getOrCreateClient();
      const contents = await client.getDirectoryContents(remotePath);
      return { success: true, data: contents };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteFile(remotePath) {
    try {
      const client = await this._getOrCreateClient();
      await client.deleteFile(remotePath);
      return { success: true, message: 'File deleted successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testConnection() {
    try {
      const client = await this._getOrCreateClient();
      await client.getDirectoryContents('/');
      return { success: true, message: 'WebDAV connection established successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = EmarsysWebdavService; 