#!/usr/bin/env node

/**
 * Script de teste para verificar as correções na planilha de contatos para Emarsys
 * 
 * Este script testa:
 * 1. A nova função generateEmarsysContactsCsv
 * 2. O mapeamento correto das colunas
 * 3. A geração de arquivo CSV válido
 */

require('dotenv').config();
const ContactService = require('./services/contactService');
const fs = require('fs').promises;
const path = require('path');

// Dados de teste simulando registros da CL
const testRecords = [
  {
    id: 'test-user-1',
    email: 'joao.silva@email.com',
    firstName: 'João',
    lastName: 'Silva',
    document: '123.456.789-00',
    birthDate: '1985-03-15T00:00:00Z',
    phone: '11987654321',
    homePhone: '1133334444'
  },
  {
    id: 'test-user-2',
    email: 'maria.santos@email.com',
    firstName: 'Maria',
    lastName: 'Santos',
    document: '987.654.321-00',
    birthDate: '1990-07-22T00:00:00Z',
    phone: '21987654321',
    homePhone: '2133334444'
  },
  {
    id: 'test-user-3',
    email: 'pedro.oliveira@email.com',
    firstName: 'Pedro',
    lastName: 'Oliveira',
    document: '456.789.123-00',
    birthDate: '1988-11-08T00:00:00Z',
    phone: '31987654321',
    homePhone: '3133334444'
  }
];

// Mock do AddressService para simular endereços
class MockAddressService {
  async fetchAddressesByUserId(userId) {
    const addresses = {
      'test-user-1': [{
        id: 'addr-1',
        postalCode: '01234-567',
        state: 'SP',
        country: 'BRA',
        city: 'São Paulo',
        street: 'Rua das Flores',
        neighborhood: 'Centro',
        number: '123',
        complement: 'Apto 45'
      }],
      'test-user-2': [{
        id: 'addr-2',
        postalCode: '20000-000',
        state: 'RJ',
        country: 'BRA',
        city: 'Rio de Janeiro',
        street: 'Avenida Atlântica',
        neighborhood: 'Copacabana',
        number: '456',
        complement: 'Casa'
      }],
      'test-user-3': [{
        id: 'addr-3',
        postalCode: '30000-000',
        state: 'MG',
        country: 'BRA',
        city: 'Belo Horizonte',
        street: 'Rua da Liberdade',
        neighborhood: 'Savassi',
        number: '789',
        complement: 'Sala 101'
      }]
    };
    
    return addresses[userId] || [];
  }
}

async function testEmarsysContactsCsv() {
  try {
    console.log('🧪 Iniciando teste da planilha de contatos para Emarsys...\n');
    
    // Cria instância do ContactService com mock do AddressService
    const contactService = new ContactService();
    contactService.addressService = new MockAddressService();
    
    console.log('📊 Registros de teste:');
    testRecords.forEach((record, index) => {
      console.log(`   ${index + 1}. ${record.firstName} ${record.lastName} (${record.email})`);
    });
    console.log('');
    
    // Testa a geração do CSV
    console.log('🔄 Gerando CSV para Emarsys...');
    const result = await contactService.generateEmarsysContactsCsv(testRecords, {
      filename: 'test-emarsys-contacts'
    });
    
    if (!result.success) {
      throw new Error(`Falha na geração: ${result.error}`);
    }
    
    console.log('✅ CSV gerado com sucesso!');
    console.log(`📁 Arquivo: ${result.filename}`);
    console.log(`📊 Registros processados: ${result.totalRecords}`);
    console.log(`🔗 Caminho: ${result.filePath}`);
    console.log(`📋 Formato: ${result.format}`);
    console.log('');
    
    // Verifica o conteúdo do arquivo gerado
    console.log('📖 Verificando conteúdo do arquivo...');
    const fileContent = await fs.readFile(result.filePath, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    console.log(`📊 Total de linhas: ${lines.length}`);
    console.log('');
    
    // Verifica o header
    const header = lines[0];
    console.log('📋 Header (primeira linha):');
    console.log(`   ${header}`);
    console.log('');
    
    // Verifica se o header está correto
    const expectedHeaders = [
      'email', 'firstName', 'lastName', 'document', 'birthDate', 'phone',
      'postalCode', 'state', 'country', 'city', 'street', 'neighborhood', 'number', 'complement'
    ];
    
    const actualHeaders = header.split(',');
    console.log('🔍 Verificando mapeamento das colunas:');
    
    let allHeadersCorrect = true;
    expectedHeaders.forEach((expected, index) => {
      const actual = actualHeaders[index];
      const isCorrect = actual === expected;
      const status = isCorrect ? '✅' : '❌';
      console.log(`   ${status} Coluna ${index + 1}: ${actual} ${isCorrect ? '' : `(esperado: ${expected})`}`);
      
      if (!isCorrect) {
        allHeadersCorrect = false;
      }
    });
    console.log('');
    
    if (!allHeadersCorrect) {
      throw new Error('Mapeamento das colunas incorreto!');
    }
    
    // Verifica as linhas de dados
    console.log('📊 Verificando linhas de dados:');
    for (let i = 1; i < Math.min(lines.length, 4); i++) {
      const line = lines[i];
      const fields = line.split(',');
      console.log(`   Linha ${i}: ${fields[0]} (${fields[1]} ${fields[2]})`);
    }
    console.log('');
    
    // Verifica se o arquivo pode ser lido como CSV válido
    console.log('🔍 Validando formato CSV...');
    if (lines.length < 2) {
      throw new Error('Arquivo deve ter pelo menos header e uma linha de dados');
    }
    
    if (!header.includes('email')) {
      throw new Error('Header deve conter coluna email');
    }
    
    console.log('✅ Formato CSV válido!');
    console.log('');
    
    // Resumo do teste
    console.log('🎉 TESTE CONCLUÍDO COM SUCESSO!');
    console.log('📋 Resumo:');
    console.log(`   ✅ CSV gerado: ${result.filename}`);
    console.log(`   ✅ Colunas mapeadas corretamente: ${expectedHeaders.length}`);
    console.log(`   ✅ Registros processados: ${result.totalRecords}`);
    console.log(`   ✅ Formato válido para Emarsys`);
    console.log('');
    console.log('🚀 A planilha está pronta para importação no Emarsys!');
    
    return result;
    
  } catch (error) {
    console.error('❌ ERRO NO TESTE:', error.message);
    console.error('🔍 Stack trace:', error.stack);
    process.exit(1);
  }
}

// Executa o teste se o script for chamado diretamente
if (require.main === module) {
  testEmarsysContactsCsv()
    .then(() => {
      console.log('✨ Teste finalizado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Teste falhou:', error.message);
      process.exit(1);
    });
}

module.exports = { testEmarsysContactsCsv };
