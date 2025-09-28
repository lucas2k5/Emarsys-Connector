const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');
const { getBrazilianTimestamp, getBrazilianTimestampForFilename } = require('../utils/dateUtils');
const emarsysService = require('./emarsysContactService');
const EmarsysWebdavService = require('./emarsysWebdavService');

require('dotenv').config();

class EmsClientsService {
  constructor() {
    this.exportsDir = process.env.EXPORTS_DIR || path.join(__dirname, '..', 'exports');
    this.vtexBaseUrl = (process.env.VTEX_BASE_URL || '').replace(/\/$/, '');
    this.entity = process.env.EMS_ENTITY_ID || 'emsClientsV2';
    this.lookbackHours = parseInt(process.env.EMS_SYNC_LOOKBACK_HOURS || '5', 10);
    this.emarsysWebdav = new EmarsysWebdavService();
  }

  getVtexHeaders() {
    return {
      'Accept': 'application/vnd.vtex.ds.v10+json',
      'Content-Type': 'application/json',
      'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
      'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
      'pragma': 'no-cache',
      'cache-control': 'max-age=0'
    };
  }

  buildPeriodRange(hours) {
    const to = new Date();
    const from = new Date(to.getTime() - (hours * 60 * 60 * 1000));
    return { fromISO: from.toISOString(), toISO: to.toISOString() };
  }

  async fetchCLChangesInPeriod(hours) {
    const { fromISO, toISO } = this.buildPeriodRange(hours);
    const url = `${this.vtexBaseUrl}/api/dataentities/CL/search`;
    // Master Data v2 supports where filters with createdIn/updatedIn using between in RFC3339
    const whereParts = [];
    whereParts.push(`createdIn between ${fromISO} AND ${toISO}`);
    whereParts.push(`updatedIn between ${fromISO} AND ${toISO}`);
    const where = `(${whereParts.join(') OR (')})`;

    const params = {
      _where: where,
      _fields: 'email,firstName,lastName,document,homePhone,city,state,optIn as optin,updatedIn,createdIn',
      _size: 1000,
      _sort: 'updatedIn DESC'
    };

    const all = [];
    let page = 1;
    let hasMore = true;
    let currentFrom = 0;
    while (hasMore) {
      const pageParams = { ...params, _from: currentFrom, _to: currentFrom + params._size - 1 };
      const resp = await axios.get(url, { params: pageParams, headers: this.getVtexHeaders(), timeout: 60000 });
      const items = Array.isArray(resp.data) ? resp.data : [];
      all.push(...items);
      if (items.length < params._size) {
        hasMore = false;
      } else {
        currentFrom += params._size;
        page += 1;
      }
    }
    return all;
  }

  async upsertEmsClientsV2(records) {
    if (!records || records.length === 0) return { success: true, upserts: 0 };
    const baseDocsUrl = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/documents`;
    let upserts = 0;
    for (const rec of records) {
      const body = {
        email: rec.email || '',
        firstName: rec.firstName || rec.firstname || '',
        lastName: rec.lastName || rec.lastname || '',
        document: rec.document || '',
        homePhone: rec.homePhone || rec.phone || '',
        city: rec.city || '',
        state: rec.state || '',
        optin: typeof rec.optin === 'boolean' ? rec.optin : (rec.optIn || false),
        isSync: false
      };
      if (!body.email) continue;
      try {
        // find existing by email
        const searchUrl = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/search`;
        const searchParams = { _where: `email=${encodeURIComponent(body.email)}`, _fields: 'id', _size: 1 };
        const searchResp = await axios.get(searchUrl, { params: searchParams, headers: this.getVtexHeaders(), timeout: 20000 });
        const existing = Array.isArray(searchResp.data) && searchResp.data.length > 0 ? searchResp.data[0] : null;
        if (existing && existing.id) {
          // patch existing
          await axios.patch(`${baseDocsUrl}/${existing.id}`, body, { headers: this.getVtexHeaders(), timeout: 30000 });
        } else {
          // create
          await axios.post(`${baseDocsUrl}`, body, { headers: this.getVtexHeaders(), timeout: 30000 });
        }
        upserts += 1;
      } catch (err) {
        // log and continue
        // console.error('Upsert failed for', body.email, err.message);
      }
    }
    return { success: true, upserts };
  }

  async listEmsClientsV2PendingSync() {
    const url = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/search`;
    const params = {
      _where: 'isSync=false OR isSync=null',
      _fields: 'id,email,firstName,lastName,document,homePhone,city,state,optin,isSync',
      _size: 1000,
      _sort: 'email ASC'
    };
    const all = [];
    let currentFrom = 0;
    let hasMore = true;
    while (hasMore) {
      const pageParams = { ...params, _from: currentFrom, _to: currentFrom + params._size - 1 };
      const resp = await axios.get(url, { params: pageParams, headers: this.getVtexHeaders(), timeout: 60000 });
      const items = Array.isArray(resp.data) ? resp.data : [];
      all.push(...items);
      if (items.length < params._size) {
        hasMore = false;
      } else {
        currentFrom += params._size;
      }
    }
    return all;
  }

  mapToEmarsysContact(contact) {
    // Map obrigatório: 1=first name, 2=last name, 3=email
    return {
      key_id: '3',
      '1': contact.firstName || '',
      '2': contact.lastName || '',
      '3': contact.email || ''
    };
  }

  async generateContactsCsv(contacts, filenameBase = 'emarsys-contacts-import') {
    if (!contacts || contacts.length === 0) {
      return { success: false, error: 'Nenhum contato para gerar CSV' };
    }
    await fs.ensureDir(this.exportsDir);
    const timestamp = getBrazilianTimestampForFilename();
    const filename = `${filenameBase}-${timestamp}.csv`;
    const filePath = path.join(this.exportsDir, filename);
    // Header com IDs dos campos padrão Emarsys
    const headers = ['3','1','2'];
    const headerRow = headers.join(',');
    let csv = '\ufeff' + headerRow + '\n';
    for (const c of contacts) {
      const row = [
        c['3'] || '',
        c['1'] || '',
        c['2'] || ''
      ];
      csv += row.join(',') + '\n';
    }
    await fs.writeFile(filePath, csv, 'utf8');
    return { success: true, filePath, filename, total: contacts.length };
  }

  async markAsSynced(pendingRecords) {
    const records = Array.isArray(pendingRecords) ? pendingRecords : [];
    if (records.length === 0) return { success: true, updated: 0 };
    
    console.log(`🔄 Marcando ${records.length} registros como sincronizados (isSync=true)...`);
    
    try {
      console.log('🔎 Buscando todos os registros via scroll...');
      
      // Busca todos os registros de uma vez
      const allRecords = await this.getAllRecordsWithDetails();
      console.log(`✅ ${allRecords.length} registros encontrados via scroll`);
      
      // Filtra apenas os que precisam ser atualizados (isSync=false)
      const recordsToUpdate = allRecords.filter(record => 
        record.isSync === false || record.isSync === null || record.isSync === undefined
      );
      
      console.log(`📋 ${recordsToUpdate.length} registros precisam ser atualizados`);
      
      if (recordsToUpdate.length === 0) {
        console.log('✅ Nenhum registro precisa ser atualizado');
        return { success: true, updated: 0, errors: 0, total: records.length };
      }
      
      // Atualiza em lote
      const updateResults = await this.batchUpdateRecords(recordsToUpdate);
      console.log(`📊 Resultado da atualização: ${updateResults.updated} atualizados, ${updateResults.errors} erros`);
      
      return { success: true, updated: updateResults.updated, errors: updateResults.errors, total: records.length };
      
    } catch (error) {
      console.error('❌ Erro ao marcar registros como sincronizados:', error.message);
      return { success: false, updated: 0, errors: records.length, total: records.length };
    }
  }

  /**
   * Busca todos os registros com detalhes via scroll
   * @returns {Array} Array de registros com detalhes
   */
  async getAllRecordsWithDetails() {
    try {
      console.log('🔎 Buscando todos os registros via scroll...');
      
      const { scrollOrders } = require('../utils/mdScroll');
      const items = await scrollOrders(this.getVtexHeaders());
      console.log(`📋 ${Array.isArray(items) ? items.length : 0} registros encontrados via scroll`);
      
      if (!Array.isArray(items) || items.length === 0) {
        return [];
      }

      // Busca detalhes de todos os registros em lotes
      const allRecords = [];
      const batchSize = 20; // Processa em lotes de 20
      
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchPromises = batch.map(async (item) => {
          if (!item.id) return null;
          
          try {
            const { data } = await axios.get(
              `${this.vtexBaseUrl}/api/dataentities/${this.entity}/documents/${item.id}`,
              {
                params: { _fields: 'id,order,item,order_status,isSync' },
                headers: this.getVtexHeaders(),
                timeout: 30000
              }
            );
            return data;
          } catch (e) {
            console.warn(`⚠️ Falha ao buscar documento ${item.id}:`, e.message);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        allRecords.push(...batchResults.filter(Boolean));
        
        // Pequena pausa entre lotes
        if (i + batchSize < items.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`✅ ${allRecords.length} registros com detalhes obtidos`);
      return allRecords;
      
    } catch (error) {
      console.error('❌ Erro ao buscar registros via scroll:', error.message);
      return [];
    }
  }

  /**
   * Atualiza registros em lote
   * @param {Array} records - Array de registros para atualizar
   * @returns {Object} Resultado da atualização
   */
  async batchUpdateRecords(records) {
    let updated = 0;
    let errors = 0;
    
    console.log(`🔄 Atualizando ${records.length} registros em lote...`);
    
    const updateBody = { isSync: true };
    const documentsUrl = `${this.vtexBaseUrl}/api/dataentities/${this.entity}/documents`;
    
    // Processa em lotes menores para evitar sobrecarga
    const batchSize = 10;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (record) => {
        try {
          const response = await axios.patch(`${documentsUrl}/${record.id}`, updateBody, {
            headers: {
              ...this.getVtexHeaders(),
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            timeout: 30000
          });
          
          if (response.status >= 200 && response.status < 300) {
            console.log(`✅ Registro ${record.id} (order=${record.order}) marcado como sincronizado`);
            return { success: true, id: record.id };
          } else {
            console.warn(`⚠️ Status inesperado para registro ${record.id}: ${response.status}`);
            return { success: false, id: record.id, error: `Status ${response.status}` };
          }
        } catch (error) {
          console.error(`❌ Erro ao atualizar registro ${record.id}:`, error.message);
          return { success: false, id: record.id, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Conta resultados
      batchResults.forEach(result => {
        if (result.success) {
          updated++;
        } else {
          errors++;
        }
      });
      
      // Pausa entre lotes
      if (i + batchSize < records.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`📊 Lote concluído: ${updated} atualizados, ${errors} erros`);
    return { updated, errors };
  }

  async syncAndSendBatch({ hours = this.lookbackHours } = {}) {
    // 1) Fetch changes in CL
    const cl = await this.fetchCLChangesInPeriod(hours);
    // 2) Upsert to emsClientsV2
    await this.upsertEmsClientsV2(cl);
    // 3) List pending isSync=false
    const pending = await this.listEmsClientsV2PendingSync();
    if (!pending.length) {
      return { success: true, message: 'Sem pendências para enviar', sent: 0 };
    }
    // 4) Map to emarsys contact payloads
    const contacts = pending.map(p => this.mapToEmarsysContact(p));
    // 5) Generate CSV e 6) Enviar via WebDAV (import de contatos em lote)
    const csvResult = await this.generateContactsCsv(contacts, 'emarsys-contacts-import');
    const remotePath = `/contact/${csvResult.filename}`;
    const upload = await this.emarsysWebdav.uploadCatalogFile(csvResult.filePath, remotePath);
    if (upload && upload.success) {
      // 7) Marcar como sincronizado
      await this.markAsSynced(pending);
      return { success: true, sent: contacts.length, failed: 0, csv: csvResult, upload };
    }
    return { success: false, error: upload?.error || 'Falha no upload para Emarsys', csv: csvResult };
  }

  async sendSingleContact(body) {
    // validate schema minimally
    if (!body || !body.email) {
      throw new Error('Email é obrigatório');
    }
    const record = {
      email: body.email,
      firstName: body.firstName || '',
      lastName: body.lastName || '',
      document: body.document || '',
      homePhone: body.homePhone || '',
      city: body.city || '',
      state: body.state || '',
      optin: typeof body.optin === 'boolean' ? body.optin : false
    };
    // map and send
    const payload = this.mapToEmarsysContact(record);
    return await emarsysService.createContact(payload);
  }
}

module.exports = EmsClientsService;

