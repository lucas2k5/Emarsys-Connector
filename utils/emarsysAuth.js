const axios = require('axios');
const crypto = require('crypto');
const { getBrazilianTimestamp } = require('./dateUtils');

/**
 * Implementação manual do WSSE para autenticação com a API da Emarsys
 * @param {string} username - Usuário da Emarsys
 * @param {string} password - Senha da Emarsys
 * @returns {string} Header X-WSSE formatado
 */
function generateWSSEHeader(username, password) {
  try {
    const nonce = crypto.randomBytes(16).toString('base64');
    const created = getBrazilianTimestamp();
    const digest = crypto.createHash('sha1')
      .update(nonce + created + password)
      .digest('base64');
    
    const header = `UsernameToken Username="${username}", PasswordDigest="${digest}", Nonce="${nonce}", Created="${created}"`;
    
    return header;
  } catch (error) {
    throw new Error(`Erro ao gerar WSSE header: ${error.message}`);
  }
}

/**
 * Gera o header X-WSSE usando as credenciais das variáveis de ambiente
 * @returns {string} Header X-WSSE formatado
 */
function generateWSSEHeaderFromEnv() {
  // Tenta diferentes nomes de variáveis de ambiente para compatibilidade
  const username = process.env.EMARSYS_USER;
  const password = process.env.EMARSYS_SECRET;

  if (!username || !password) {
    console.error('❌ Variáveis de ambiente do Emarsys não encontradas:');
    console.error('EMARSYS_USER/EMARSYS_USERNAME:', username ? 'configurado' : 'não configurado');
    console.error('EMARSYS_SECRET/EMARSYS_PASSWORD:', password ? 'configurado' : 'não configurado');
    throw new Error('EMARSYS_USER/EMARSYS_USERNAME e EMARSYS_SECRET/EMARSYS_PASSWORD devem estar definidos nas variáveis de ambiente');
  }

  console.log('🔐 Usando credenciais Emarsys:', {
    username: username.substring(0, 3) + '***',
    password: password.substring(0, 3) + '***'
  });

  return generateWSSEHeader(username, password);
}

/**
 * Gera token OAuth2 para autenticação com a API da Emarsys
 * @param {string} clientId - Client ID da aplicação
 * @param {string} clientSecret - Client Secret da aplicação
 * @returns {Object} Token de acesso
 */
async function generateOAuth2Token(clientId, clientSecret) {
  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const response = await axios.post(
      'https://auth.emarsys.net/oauth2/token',
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'Authorization': `Basic ${credentials}`
        }
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(`Erro ao gerar token OAuth2: ${error.response?.data?.error || error.message}`);
  }
}

/**
 * Gera token OAuth2 usando as credenciais das variáveis de ambiente
 * @returns {Object} Token de acesso
 */
async function generateOAuth2TokenFromEnv() {
  const clientId = process.env.EMARSYS_USER;
  const clientSecret = process.env.EMARSYS_SECRET;
  console.log('clientId', clientId);
  console.log('clientSecret', clientSecret);
  if (!clientId || !clientSecret) {
    throw new Error('EMARSYS_USER e EMARSYS_SECRET devem estar definidos nas variáveis de ambiente');
  }

  return generateOAuth2Token(clientId, clientSecret);
}

/**
 * Busca configurações da Emarsys usando OAuth2
 * @param {string} accessToken - Token de acesso
 * @returns {Object} Configurações da Emarsys
 */
async function getEmarsysSettings(accessToken) {
  try {
    const response = await axios.get(
      'https://api.emarsys.net/api/v3/settings',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    throw new Error(`Erro ao buscar configurações: ${error.response?.data?.error || error.message}`);
  }
}

module.exports = {
  generateWSSEHeader,
  generateWSSEHeaderFromEnv,
  generateOAuth2Token,
  generateOAuth2TokenFromEnv,
  getEmarsysSettings
}; 