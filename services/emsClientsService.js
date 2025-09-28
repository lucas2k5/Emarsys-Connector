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
      // Marca como sincronizado usando OrderSyncHelper
      const OrderSyncHelper = require('../helpers/orderSyncHelper');
      const orderSyncHelper = new OrderSyncHelper(this.vtexBaseUrl, this.entity, () => this.getVtexHeaders());
      await orderSyncHelper.markAsSynced(pending, this.getVtexHeaders());
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

