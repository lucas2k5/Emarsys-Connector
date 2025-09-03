const crypto = require('crypto');

/**
 * Gera header X-WSSE para autenticação na API Emarsys
 * Baseado no padrão WSSE (Web Services Security)
 */
class WSSeAuth {
  /**
   * Gera um nonce aleatório
   * @returns {string} Nonce em base64
   */
  static generateNonce() {
    return crypto.randomBytes(16).toString('base64');
  }

  /**
   * Gera timestamp no formato ISO
   * @returns {string} Timestamp ISO
   */
  static generateTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Gera digest da senha usando SHA1
   * @param {string} nonce - Nonce em base64
   * @param {string} timestamp - Timestamp ISO
   * @param {string} password - Senha
   * @returns {string} Digest em base64
   */
  static generatePasswordDigest(nonce, timestamp, password) {
    const nonceBytes = Buffer.from(nonce, 'base64');
    const timestampBytes = Buffer.from(timestamp, 'utf8');
    const passwordBytes = Buffer.from(password, 'utf8');
    
    // Concatena nonce + timestamp + password
    const combined = Buffer.concat([nonceBytes, timestampBytes, passwordBytes]);
    
    // Gera hash SHA1
    const hash = crypto.createHash('sha1').update(combined).digest();
    
    // Retorna em base64
    return hash.toString('base64');
  }

  /**
   * Gera header X-WSSE completo
   * @param {string} username - Nome de usuário
   * @param {string} password - Senha
   * @returns {string} Header X-WSSE
   */
  static generateHeader(username, password) {
    const nonce = this.generateNonce();
    const timestamp = this.generateTimestamp();
    const passwordDigest = this.generatePasswordDigest(nonce, timestamp, password);

    return `UsernameToken Username="${username}", PasswordDigest="${passwordDigest}", Nonce="${nonce}", Created="${timestamp}"`;
  }

  /**
   * Cria um token WSSE (compatível com o formato anterior)
   * @param {Object} options - Opções do token
   * @param {string} options.username - Nome de usuário
   * @param {string} options.password - Senha
   * @returns {Object} Objeto com método toString()
   */
  static createToken(options) {
    const { username, password } = options;
    
    return {
      toString() {
        return WSSeAuth.generateHeader(username, password);
      }
    };
  }
}

module.exports = WSSeAuth;
