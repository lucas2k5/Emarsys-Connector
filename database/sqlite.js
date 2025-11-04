const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');

class SQLiteDatabase {
  constructor(dbPath = null) {
    const defaultPath = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'data', 'orders.db');
    this.dbPath = dbPath || defaultPath;
    this.db = null;
  }

  /**
   * Inicializa o banco de dados e executa migrations
   */
  async init() {
    try {
      // Garantir que o diretório existe
      const dbDir = path.dirname(this.dbPath);
      await fs.ensureDir(dbDir);

      // Criar conexão com o banco
      this.db = new Database(this.dbPath);

      // Habilitar WAL mode para melhor concorrência
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      // Executar migrations
      await this.runMigrations();

      console.log(`✅ SQLite database initialized: ${this.dbPath}`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao inicializar SQLite:', error);
      throw error;
    }
  }

  /**
   * Executa migrations do banco de dados
   */
  async runMigrations() {
    try {
      const migrationsDir = path.join(__dirname, 'migrations');
      await fs.ensureDir(migrationsDir);

      // Criar tabela de controle de migrations
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          executed_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // Listar arquivos de migration
      const migrationFiles = await fs.readdir(migrationsDir);
      const sqlFiles = migrationFiles
        .filter(file => file.endsWith('.sql'))
        .sort();

      for (const file of sqlFiles) {
        const migrationName = file.replace('.sql', '');
        
        // Verificar se já foi executada
        const executed = this.db.prepare('SELECT * FROM migrations WHERE name = ?').get(migrationName);
        
        if (!executed) {
          console.log(`🔄 Executando migration: ${file}`);
          const migrationPath = path.join(migrationsDir, file);
          const migrationSQL = await fs.readFile(migrationPath, 'utf8');
          
          // Executar migration dentro de uma transação
          const transaction = this.db.transaction(() => {
            this.db.exec(migrationSQL);
            this.db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migrationName);
          });
          
          transaction();
          console.log(`✅ Migration executada: ${file}`);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao executar migrations:', error);
      throw error;
    }
  }

  /**
   * Insere ou atualiza um pedido (UPSERT)
   * @param {Object} orderData - Dados do pedido
   * @returns {Object} Resultado da operação
   */
  upsertOrder(orderData) {
    try {
      const {
        order,
        item,
        email,
        quantity,
        price,
        timestamp,
        isSync = false,
        order_status,
        s_channel_source,
        s_store_id,
        s_sales_channel,
        s_discount
      } = orderData;

      if (!order || !item) {
        throw new Error('order e item são obrigatórios');
      }

      // Verificar se já existe usando order, item e order_status (mesma constraint UNIQUE do banco)
      // Normaliza NULL para string vazia para comparação consistente
      const normalizedStatus = order_status || null;
      const existing = this.db.prepare(`
        SELECT id FROM orders 
        WHERE "order" = ? AND item = ? AND (order_status = ? OR (order_status IS NULL AND ? IS NULL))
      `).get(order, item, normalizedStatus, normalizedStatus);

      if (existing) {
        // Atualizar registro existente (já existe registro com order, item e order_status)
        const stmt = this.db.prepare(`
          UPDATE orders SET
            email = ?,
            quantity = ?,
            price = ?,
            timestamp = ?,
            isSync = ?,
            order_status = ?,
            s_channel_source = ?,
            s_store_id = ?,
            s_sales_channel = ?,
            s_discount = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `);

        stmt.run(
          email || null,
          quantity || null,
          price || null,
          timestamp || null,
          isSync ? 1 : 0,
          order_status || null,
          s_channel_source || null,
          s_store_id || null,
          s_sales_channel || null,
          s_discount || null,
          existing.id
        );

        return { success: true, id: existing.id, action: 'updated' };
      } else {
        // Inserir novo registro (não existe registro com esta combinação de order, item e order_status)
        const stmt = this.db.prepare(`
          INSERT INTO orders (
            "order", item, email, quantity, price, timestamp,
            isSync, order_status, s_channel_source, s_store_id,
            s_sales_channel, s_discount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        try {
          const result = stmt.run(
            order,
            item,
            email || null,
            quantity || null,
            price || null,
            timestamp || null,
            isSync ? 1 : 0,
            order_status || null,
            s_channel_source || null,
            s_store_id || null,
            s_sales_channel || null,
            s_discount || null
          );

          return { success: true, id: result.lastInsertRowid, action: 'inserted' };
        } catch (insertError) {
          // Se houver erro de constraint UNIQUE (mesmo que raro), tenta atualizar
          if (insertError.message && insertError.message.includes('UNIQUE constraint')) {
            console.warn(`⚠️ Constraint UNIQUE violada para order=${order}, item=${item}, order_status=${normalizedStatus || 'NULL'}. Tentando atualizar...`);
            // Tenta buscar novamente e atualizar
            const retryExisting = this.db.prepare(`
              SELECT id FROM orders 
              WHERE "order" = ? AND item = ? AND (order_status = ? OR (order_status IS NULL AND ? IS NULL))
            `).get(order, item, normalizedStatus, normalizedStatus);
            
            if (retryExisting) {
              const updateStmt = this.db.prepare(`
                UPDATE orders SET
                  email = ?,
                  quantity = ?,
                  price = ?,
                  timestamp = ?,
                  isSync = ?,
                  order_status = ?,
                  s_channel_source = ?,
                  s_store_id = ?,
                  s_sales_channel = ?,
                  s_discount = ?,
                  updated_at = datetime('now')
                WHERE id = ?
              `);
              
              updateStmt.run(
                email || null,
                quantity || null,
                price || null,
                timestamp || null,
                isSync ? 1 : 0,
                order_status || null,
                s_channel_source || null,
                s_store_id || null,
                s_sales_channel || null,
                s_discount || null,
                retryExisting.id
              );
              
              return { success: true, id: retryExisting.id, action: 'updated' };
            }
          }
          throw insertError;
        }
      }
    } catch (error) {
      console.error('❌ Erro ao fazer upsert de pedido:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca um pedido específico
   * @param {string} order - ID do pedido
   * @param {string} item - ID do item
   * @param {string} order_status - Status do pedido (opcional)
   * @returns {Object|null} Registro encontrado ou null
   */
  findOrder(order, item, order_status = null) {
    try {
      let stmt;
      let params;

      if (order_status) {
        stmt = this.db.prepare(`
          SELECT * FROM orders 
          WHERE "order" = ? AND item = ? AND order_status = ?
        `);
        params = [order, item, order_status];
      } else {
        stmt = this.db.prepare(`
          SELECT * FROM orders 
          WHERE "order" = ? AND item = ?
          ORDER BY created_at DESC
          LIMIT 1
        `);
        params = [order, item];
      }

      const result = stmt.get(...params);
      
      if (result) {
        // Converter isSync de número para boolean
        return {
          ...result,
          isSync: result.isSync === 1
        };
      }
      
      return null;
    } catch (error) {
      console.error('❌ Erro ao buscar pedido:', error);
      return null;
    }
  }

  /**
   * Lista pedidos pendentes de sincronização (isSync = false)
   * @param {Object} options - Opções de filtro (limit, offset, startDate, endDate)
   * @returns {Array} Array de pedidos pendentes
   */
  listPendingSync(options = {}) {
    try {
      const { limit = 1000, offset = 0, startDate = null, endDate = null } = options;
      
      let query = 'SELECT * FROM orders WHERE isSync = 0';
      const params = [];

      if (startDate) {
        query += ' AND timestamp >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND timestamp <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY timestamp ASC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const stmt = this.db.prepare(query);
      const results = stmt.all(...params);

      // Converter isSync de número para boolean
      return results.map(row => ({
        ...row,
        isSync: row.isSync === 1
      }));
    } catch (error) {
      console.error('❌ Erro ao listar pedidos pendentes:', error);
      return [];
    }
  }

  /**
   * Lista todos os pedidos
   * @param {Object} options - Opções de filtro
   * @returns {Array} Array de pedidos
   */
  listAllOrders(options = {}) {
    try {
      const { limit = 1000, offset = 0, startDate = null, endDate = null } = options;
      
      let query = 'SELECT * FROM orders WHERE 1=1';
      const params = [];

      if (startDate) {
        query += ' AND timestamp >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND timestamp <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const stmt = this.db.prepare(query);
      const results = stmt.all(...params);

      // Converter isSync de número para boolean
      return results.map(row => ({
        ...row,
        isSync: row.isSync === 1
      }));
    } catch (error) {
      console.error('❌ Erro ao listar pedidos:', error);
      return [];
    }
  }

  /**
   * Marca pedidos como sincronizados
   * @param {Array} orderIds - Array de objetos {order, item} ou IDs
   * @returns {Object} Resultado da operação
   */
  markAsSynced(orderIds) {
    try {
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return { success: true, updated: 0 };
      }

      const transaction = this.db.transaction((ids) => {
        let updated = 0;
        const stmt = this.db.prepare('UPDATE orders SET isSync = 1, updated_at = datetime(\'now\') WHERE id = ?');

        for (const id of ids) {
          if (typeof id === 'object' && id.order && id.item) {
            // Se for objeto {order, item}, buscar ID primeiro
            const found = this.findOrder(id.order, id.item);
            if (found) {
              stmt.run(found.id);
              updated++;
            }
          } else if (typeof id === 'number') {
            // Se for ID direto
            stmt.run(id);
            updated++;
          }
        }

        return updated;
      });

      const updated = transaction(orderIds.map(id => {
        if (typeof id === 'object' && id.order && id.item) {
          const found = this.findOrder(id.order, id.item);
          return found ? found.id : null;
        }
        return id;
      }).filter(Boolean));

      return { success: true, updated };
    } catch (error) {
      console.error('❌ Erro ao marcar pedidos como sincronizados:', error);
      return { success: false, error: error.message, updated: 0 };
    }
  }

  /**
   * Marca pedido específico como sincronizado por order e item
   * @param {string} order - ID do pedido
   * @param {string} item - ID do item
   * @returns {Object} Resultado da operação
   */
  markOrderAsSynced(order, item) {
    try {
      const stmt = this.db.prepare(`
        UPDATE orders 
        SET isSync = 1, updated_at = datetime('now')
        WHERE "order" = ? AND item = ?
      `);

      const result = stmt.run(order, item);
      return { success: true, updated: result.changes > 0 };
    } catch (error) {
      console.error('❌ Erro ao marcar pedido como sincronizado:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Busca pedidos por período
   * @param {string} startDate - Data inicial
   * @param {string} endDate - Data final
   * @returns {Array} Array de pedidos
   */
  findByPeriod(startDate, endDate) {
    return this.listAllOrders({ startDate, endDate, limit: 10000 });
  }

  /**
   * Insere múltiplos pedidos em lote
   * @param {Array} orders - Array de pedidos
   * @returns {Object} Resultado da operação
   */
  insertBatch(orders) {
    try {
      if (!Array.isArray(orders) || orders.length === 0) {
        return { success: true, inserted: 0, updated: 0 };
      }

      const transaction = this.db.transaction((ordersList) => {
        let inserted = 0;
        let updated = 0;

        for (const orderData of ordersList) {
          const result = this.upsertOrder(orderData);
          if (result.success) {
            if (result.action === 'inserted') {
              inserted++;
            } else {
              updated++;
            }
          }
        }

        return { inserted, updated };
      });

      const result = transaction(orders);
      return { success: true, ...result };
    } catch (error) {
      console.error('❌ Erro ao inserir pedidos em lote:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fecha a conexão com o banco
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('✅ SQLite database connection closed');
    }
  }

  /**
   * Retorna estatísticas do banco
   * @returns {Object} Estatísticas
   */
  getStats() {
    try {
      const total = this.db.prepare('SELECT COUNT(*) as count FROM orders').get();
      const pending = this.db.prepare('SELECT COUNT(*) as count FROM orders WHERE isSync = 0').get();
      const synced = this.db.prepare('SELECT COUNT(*) as count FROM orders WHERE isSync = 1').get();

      return {
        total: total.count,
        pending: pending.count,
        synced: synced.count
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error);
      return { total: 0, pending: 0, synced: 0 };
    }
  }

  /**
   * Limpa todos os registros da tabela orders
   * @param {boolean} onlyPending - Se true, limpa apenas pedidos pendentes (isSync = 0)
   * @returns {Object} Resultado da operação
   */
  clearOrders(onlyPending = false) {
    try {
      if (!this.db) {
        throw new Error('Banco de dados não inicializado');
      }
      
      if (onlyPending) {
        const result = this.db.prepare('DELETE FROM orders WHERE isSync = 0').run();
        console.log(`✅ ${result.changes} pedidos pendentes removidos`);
        return {
          success: true,
          deleted: result.changes,
          message: 'Pedidos pendentes removidos'
        };
      } else {
        const result = this.db.prepare('DELETE FROM orders').run();
        console.log(`✅ ${result.changes} registros removidos`);
        return {
          success: true,
          deleted: result.changes,
          message: 'Todos os registros removidos'
        };
      }
    } catch (error) {
      console.error('❌ Erro ao limpar orders:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove o arquivo do banco de dados (limpeza completa)
   * @returns {Promise<Object>} Resultado da operação
   */
  async dropDatabase() {
    try {
      if (this.db) {
        this.db.close();
        this.db = null;
      }
      
      if (await fs.pathExists(this.dbPath)) {
        await fs.remove(this.dbPath);
        console.log(`✅ Banco de dados removido: ${this.dbPath}`);
        return {
          success: true,
          message: 'Banco de dados removido com sucesso'
        };
      } else {
        return {
          success: false,
          message: 'Arquivo do banco não encontrado'
        };
      }
    } catch (error) {
      console.error('❌ Erro ao remover banco:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Singleton instance
let dbInstance = null;

/**
 * Obtém instância singleton do banco de dados
 * @returns {SQLiteDatabase} Instância do banco
 */
function getDatabase() {
  if (!dbInstance) {
    dbInstance = new SQLiteDatabase();
  }
  return dbInstance;
}

module.exports = {
  SQLiteDatabase,
  getDatabase
};

