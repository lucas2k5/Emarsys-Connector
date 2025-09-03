const express = require('express');
const router = express.Router();
const emarsysService = require('../services/emarsysContactService');
const contactService = require('../services/contactService');
const { generateWSSEHeaderFromEnv, generateOAuth2TokenFromEnv, getEmarsysSettings } = require('../utils/emarsysAuth');

console.log('Emarsys routes loaded');
console.log('Emarsys routes loaded',);

/**
 * @route GET /api/emarsys/auth
 * @desc Gera e retorna o header X-WSSE para teste
 * @access Public
 */
router.get('/auth', async (req, res) => {
  try {
    const wsseHeader = generateWSSEHeaderFromEnv();
    res.json({
      success: true,
      wsseHeader,
      message: 'Header X-WSSE gerado com sucesso'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/emarsys/oauth2
 * @desc Gera token OAuth2 e retorna configurações da Emarsys
 * @access Public
 */
router.get('/oauth2', async (req, res) => {
  try {
    const tokenData = await generateOAuth2TokenFromEnv();
    const settings = await getEmarsysSettings(tokenData.access_token);
    
    res.json({
      success: true,
      token: {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in
      },
      settings: settings,
      message: 'Token OAuth2 gerado e configurações obtidas com sucesso'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/emarsys/contact
 * @desc Cria ou atualiza um contato na Emarsys
 * @access Public
 */
router.post('/contact', async (req, res) => {
  try {
    const { firstName, lastName, email, ...otherFields } = req.body;

    // Validação básica
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email é obrigatório'
      });
    }

    // Mapeia os campos para o formato da Emarsys
    const contactData = {
      '1': firstName || '', // Primeiro nome
      '2': lastName || '',  // Sobrenome
      '3': email,           // Email
      ...otherFields
    };

    const result = await emarsysService.createContact(contactData);

    if (result.success) {
      res.status(201).json({
        success: true,
        message: 'Contato criado/atualizado com sucesso',
        data: result.data
      });
    } else {
      res.status(result.status).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/emarsys/contact/:email
 * @desc Busca um contato por email
 * @access Public
 */
router.get('/contact/:email', async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email é obrigatório'
      });
    }

    const result = await emarsysService.getContactByEmail(email);

    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(result.status).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route PUT /api/emarsys/contact/:email
 * @desc Atualiza um contato existente
 * @access Public
 */
router.put('/contact/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { firstName, lastName, ...otherFields } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email é obrigatório'
      });
    }

    // Mapeia os campos para o formato da Emarsys
    const contactData = {
      '1': firstName || '', // Primeiro nome
      '2': lastName || '',  // Sobrenome
      ...otherFields
    };

    const result = await emarsysService.updateContact(email, contactData);

    if (result.success) {
      res.json({
        success: true,
        message: 'Contato atualizado com sucesso',
        data: result.data
      });
    } else {
      res.status(result.status).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/emarsys/extract-contacts
 * @desc Extrai contatos da CL com endereços e gera arquivos CSV divididos
 * @access Public
 * @body {number} [maxFileSizeMB=50] - Tamanho máximo por arquivo em MB
 * @body {number} [clPageSize=1000] - Tamanho da página para busca da CL
 * @body {number} [clMaxRequests=5000] - Máximo de requisições para busca da CL
 * @body {number} [adPageSize=1000] - Tamanho da página para busca da AD (apenas com useScroll=true)
 * @body {number} [adMaxRequests=10000] - Máximo de requisições para busca da AD (apenas com useScroll=true)
 * @body {number|string} [userLimit] - Limite de usuários para processar (número ou range "start:end")
 * @body {string} [filename] - Nome base do arquivo CSV
 * @body {boolean} [useScroll=false] - Usar scroll na entidade AD para otimização
 */
router.post('/extract-contacts', async (req, res) => {
  try {
    console.log('🚀 Iniciando extração de contatos com endereços...');
    
    const {
      maxFileSizeMB = 50,
      clPageSize = 1000,
      clMaxRequests = 5000,
      adPageSize = 1000,
      adMaxRequests = 10000,
      userLimit,
      filename,
      useScroll = false
    } = req.body;

    const contactServiceInstance = new contactService();
    
    const result = await contactServiceInstance.extractContactsWithAddresses({
      maxFileSizeMB,
      clPageSize,
      clMaxRequests,
      adPageSize,
      adMaxRequests,
      userLimit,
      filename,
      useScroll
    });

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Extração de contatos concluída com sucesso',
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Erro na rota de extração de contatos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/emarsys/test-contacts-extraction
 * @desc Testa a funcionalidade de extração de contatos com endereços
 * @access Public
 */
router.get('/test-contacts-extraction', async (req, res) => {
  try {
    console.log('🧪 Testando extração de contatos...');
    
    const contactServiceInstance = new contactService();
    
    const result = await contactServiceInstance.testContactsExtraction();

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Teste de extração concluído com sucesso',
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Erro no teste de extração:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/emarsys/cl-records
 * @desc Busca registros da CL (Customer List) com opções de paginação
 * @access Public
 */
router.get('/cl-records', async (req, res) => {
  try {
    console.log('🔍 Buscando registros da CL...');
    
    const {
      size = 100,
      maxRequests = 1,
      fields = 'email,id,accountId,accountName,dataEntityId,integrado,createdIn,updatedIn,optIn,document,birthDate,phone,homePhone'
    } = req.query;

    const contactServiceInstance = new contactService();
    
    const records = await contactServiceInstance.fetchAllCLRecords({
      size: parseInt(size),
      maxRequests: parseInt(maxRequests),
      fields
    });

    res.status(200).json({
      success: true,
      message: 'Registros da CL buscados com sucesso',
      data: {
        totalRecords: records.length,
        records: records
      }
    });
  } catch (error) {
    console.error('❌ Erro ao buscar registros da CL:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/emarsys/generate-csv
 * @desc Gera arquivos CSV dos registros fornecidos com endereços
 * @access Public
 */
router.post('/generate-csv', async (req, res) => {
  try {
    console.log('📊 Gerando arquivos CSV...');
    
    const {
      records,
      maxFileSizeMB = 50,
      filename
    } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Array de registros é obrigatório e não pode estar vazio'
      });
    }

    const contactServiceInstance = new contactService();
    
    const result = await contactServiceInstance.generateCLCSVWithAddressesOptimized(records, {
      maxFileSizeMB,
      filename
    });

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Arquivos CSV gerados com sucesso',
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Erro ao gerar CSV:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/emarsys/generate-contacts-csv
 * @desc Gera arquivo CSV específico para importação de contatos no Emarsys
 * @access Public
 * @body {Array} records - Array de registros da CL
 * @body {string} [filename] - Nome personalizado do arquivo
 */
router.post('/generate-contacts-csv', async (req, res) => {
  try {
    console.log('📊 Gerando arquivo CSV específico para importação de contatos no Emarsys...');
    
    const {
      records,
      filename
    } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Array de registros é obrigatório e não pode estar vazio'
      });
    }

    const contactServiceInstance = new contactService();
    
    const result = await contactServiceInstance.generateEmarsysContactsCsv(records, {
      filename
    });

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Arquivo CSV para Emarsys gerado com sucesso',
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Erro ao gerar CSV para Emarsys:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router; 