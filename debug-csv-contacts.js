#!/usr/bin/env node

/**
 * Script para debugar o processamento de contatos CSV
 * Uso: node debug-csv-contacts.js [nome_do_arquivo]
 */

require('dotenv').config();
const csv = require('csv-parser');
const { createReadStream } = require('fs');
const path = require('path');

async function debugCsvContacts() {
  console.log('🔍 Debugando processamento de contatos CSV...\n');
  
  const filename = process.argv[2] || 'contatos_vtex_emarsys-04-09-2025-2025-09-04T11-00-17-range-1-50-part-1.csv';
  
  const defaultExports = process.env.VERCEL ? '/tmp/exports' : path.join(__dirname, 'exports');
  const exportsDir = process.env.EXPORTS_DIR || defaultExports;
  const filePath = path.join(exportsDir, filename);
  
  console.log(`📄 Arquivo: ${filename}`);
  console.log(`📁 Caminho: ${filePath}`);
  
  try {
    const contacts = [];
    let totalRows = 0;
    let validContacts = 0;
    let invalidContacts = 0;
    
    const stream = createReadStream(filePath);
    
    stream
      .pipe(csv())
      .on('data', (row) => {
        totalRows++;
        
        console.log(`\n📋 Linha ${totalRows}:`);
        console.log(`   Campos disponíveis: ${Object.keys(row).join(', ')}`);
        
        // Verifica email
        const email = row.email || row.Email || row.EMAIL;
        console.log(`   Email encontrado: ${email || 'NÃO ENCONTRADO'}`);
        
        if (email && isValidEmail(email)) {
          validContacts++;
          console.log(`   ✅ Email válido`);
          
          // Mostra mapeamento
          const contact = mapCsvRowToEmarsysContact(row);
          console.log(`   📝 Contato mapeado:`, contact);
        } else {
          invalidContacts++;
          console.log(`   ❌ Email inválido ou ausente`);
        }
        
        // Mostra apenas as primeiras 5 linhas para debug
        if (totalRows >= 5) {
          console.log('\n⏹️ Mostrando apenas as primeiras 5 linhas para debug...');
          stream.destroy();
        }
      })
      .on('end', () => {
        console.log('\n📊 Resumo do debug:');
        console.log(`   Total de linhas: ${totalRows}`);
        console.log(`   Contatos válidos: ${validContacts}`);
        console.log(`   Contatos inválidos: ${invalidContacts}`);
        console.log(`   Taxa de sucesso: ${totalRows > 0 ? ((validContacts / totalRows) * 100).toFixed(2) : 0}%`);
      })
      .on('error', (error) => {
        console.error('❌ Erro ao ler CSV:', error.message);
      });
      
  } catch (error) {
    console.error('❌ Erro inesperado:', error.message);
  }
}

/**
 * Mapeia uma linha do CSV para formato de contato da Emarsys
 */
function mapCsvRowToEmarsysContact(row) {
  // Verifica se tem email (obrigatório)
  const email = row.email || row.Email || row.EMAIL;
  if (!email || !isValidEmail(email)) {
    return null;
  }

  // Mapeia campos padrão da Emarsys
  const contact = {
    '3': email, // Campo 3 = Email
  };

  // Adiciona outros campos se disponíveis
  if (row.firstName || row.firstname || row.FIRSTNAME) {
    contact['1'] = row.firstName || row.firstname || row.FIRSTNAME; // Campo 1 = First Name
  }

  if (row.lastName || row.lastname || row.LASTNAME) {
    contact['2'] = row.lastName || row.lastname || row.LASTNAME; // Campo 2 = Last Name
  }

  // Campos customizados comuns
  if (row.phone || row.Phone || row.PHONE) {
    contact['57'] = row.phone || row.Phone || row.PHONE; // Campo 57 = Phone (exemplo)
  }

  if (row.date_of_birth || row.birthDate || row.birth_date || row.BIRTH_DATE) {
    contact['58'] = row.date_of_birth || row.birthDate || row.birth_date || row.BIRTH_DATE; // Campo 58 = Birth Date (exemplo)
  }

  if (row.external_id || row.document || row.Document || row.DOCUMENT) {
    contact['59'] = row.external_id || row.document || row.Document || row.DOCUMENT; // Campo customizado para documento
  }

  // Campos de endereço se disponíveis
  if (row.city || row.City || row.CITY) {
    contact['60'] = row.city || row.City || row.CITY;
  }

  if (row.state || row.State || row.STATE) {
    contact['61'] = row.state || row.State || row.STATE;
  }

  if (row.zip_code || row.postalCode || row.postal_code || row.POSTAL_CODE) {
    contact['62'] = row.zip_code || row.postalCode || row.postal_code || row.POSTAL_CODE;
  }

  return contact;
}

/**
 * Valida se o email tem formato válido
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Executa o debug
debugCsvContacts().catch(console.error);
