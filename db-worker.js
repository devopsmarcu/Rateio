import sqlite3InitModule from './sqlite/sqlite3.mjs';

const DB_PATH = '/faturas.sqlite3';
const RESTORE_PATH = '/faturas_restore_staging.sqlite3';
const REQUIRED_COLUMNS = {
  pessoas: ['id', 'nome', 'chave_pix'],
  bancos: ['id', 'nome'],
  faturas: ['id', 'banco_id', 'mes_referencia', 'valor_total', 'data_vencimento', 'pago'],
  lancamentos: [
    'id', 'fatura_id', 'descricao', 'valor', 'data_transacao', 'dono_id',
    'n_parcelas', 'parcela_atual', 'grupo_parcela_id', 'recorrente'
  ],
  rateio_lancamento: ['id', 'lancamento_id', 'pessoa_id', 'valor_fracao', 'porcentagem', 'pago']
};

const DDL = `
CREATE TABLE IF NOT EXISTS pessoas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, chave_pix TEXT);
CREATE TABLE IF NOT EXISTS bancos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS faturas (id INTEGER PRIMARY KEY AUTOINCREMENT, banco_id INTEGER NOT NULL, mes_referencia TEXT NOT NULL, valor_total REAL NOT NULL, data_vencimento TEXT, pago INTEGER DEFAULT 0, FOREIGN KEY (banco_id) REFERENCES bancos(id));
CREATE TABLE IF NOT EXISTS lancamentos (id INTEGER PRIMARY KEY AUTOINCREMENT, fatura_id INTEGER NOT NULL, descricao TEXT NOT NULL, valor REAL NOT NULL, data_transacao TEXT, dono_id INTEGER, n_parcelas INTEGER, parcela_atual INTEGER, grupo_parcela_id TEXT, recorrente INTEGER DEFAULT 0, FOREIGN KEY (fatura_id) REFERENCES faturas(id), FOREIGN KEY (dono_id) REFERENCES pessoas(id));
CREATE TABLE IF NOT EXISTS rateio_lancamento (id INTEGER PRIMARY KEY AUTOINCREMENT, lancamento_id INTEGER NOT NULL, pessoa_id INTEGER NOT NULL, valor_fracao REAL NOT NULL, porcentagem REAL, pago INTEGER DEFAULT 0, FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id) ON DELETE CASCADE, FOREIGN KEY (pessoa_id) REFERENCES pessoas(id));`;

// As versões 1 a 4 refletem a sequência publicada (uma coluna por migração).
// A versão 5 repara bancos que receberam user_version=1 apesar de alguma
// alteração ter sido ignorada pelas migrações antigas.
const MIGRATIONS = [
  db => ensureColumn(db, 'lancamentos', 'n_parcelas', 'INTEGER'),
  db => ensureColumn(db, 'lancamentos', 'parcela_atual', 'INTEGER'),
  db => ensureColumn(db, 'lancamentos', 'grupo_parcela_id', 'TEXT'),
  db => ensureColumn(db, 'lancamentos', 'recorrente', 'INTEGER DEFAULT 0'),
  db => {
    // Idempotente: repara instalações antigas que marcavam a primeira
    // migração como concluída após capturar erros de ALTER TABLE.
    ensureColumn(db, 'lancamentos', 'n_parcelas', 'INTEGER');
    ensureColumn(db, 'lancamentos', 'parcela_atual', 'INTEGER');
    ensureColumn(db, 'lancamentos', 'grupo_parcela_id', 'TEXT');
    ensureColumn(db, 'lancamentos', 'recorrente', 'INTEGER DEFAULT 0');
  }
];
const SCHEMA_VERSION = MIGRATIONS.length;

let s3;
let db;
let queue = Promise.resolve();

function rowsFrom(database, sql) {
  const rows = [];
  database.exec({ sql, rowMode: 'object', resultRows: rows });
  return rows;
}

function tableColumns(database, table) {
  return new Set(rowsFrom(database, `PRAGMA table_info("${table}")`).map(row => row.name));
}

function ensureColumn(database, table, column, definition) {
  if (!tableColumns(database, table).has(column)) {
    database.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  }
}

function validateSchema(database) {
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const existing = tableColumns(database, table);
    if (existing.size === 0) throw Error(`Schema SQLite inválido: tabela ausente (${table})`);
    const missing = columns.filter(column => !existing.has(column));
    if (missing.length) {
      throw Error(`Schema SQLite incompatível: ${table} sem coluna(s) ${missing.join(', ')}`);
    }
  }
}

function validateBaseSchema(database) {
  const baseColumns = {
    pessoas: ['id', 'nome', 'chave_pix'],
    bancos: ['id', 'nome'],
    faturas: ['id', 'banco_id', 'mes_referencia', 'valor_total', 'data_vencimento', 'pago'],
    lancamentos: ['id', 'fatura_id', 'descricao', 'valor', 'data_transacao', 'dono_id'],
    rateio_lancamento: ['id', 'lancamento_id', 'pessoa_id', 'valor_fracao', 'porcentagem', 'pago']
  };
  for (const [table, columns] of Object.entries(baseColumns)) {
    const existing = tableColumns(database, table);
    if (existing.size === 0) throw Error(`Backup SQLite incompatível: tabela ausente (${table})`);
    const missing = columns.filter(column => !existing.has(column));
    if (missing.length) {
      throw Error(`Backup SQLite incompatível: ${table} sem coluna(s) ${missing.join(', ')}`);
    }
  }
}

function hasUserTables(database) {
  return rowsFrom(database, `
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).length > 0;
}

function migrateDatabase(database) {
  const currentVersion = Number(database.selectValue('PRAGMA user_version') ?? 0);
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    throw Error(`Versão de schema SQLite inválida: ${currentVersion}`);
  }
  if (currentVersion > SCHEMA_VERSION) {
    throw Error(
      `Este banco foi criado por uma versão mais nova da aplicação (schema ${currentVersion}; ` +
      `esta versão suporta até ${SCHEMA_VERSION}). Atualize a aplicação para continuar.`
    );
  }

  // Um arquivo totalmente vazio é um banco novo. Se já houver qualquer
  // tabela, exija o schema base antes do DDL para não recriar silenciosamente
  // partes perdidas de um banco existente.
  if (hasUserTables(database)) validateBaseSchema(database);

  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(DDL);
    for (let version = currentVersion + 1; version <= SCHEMA_VERSION; version++) {
      MIGRATIONS[version - 1](database);
      database.exec(`PRAGMA user_version = ${version}`);
    }
    validateSchema(database);
    database.exec('COMMIT');
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch (rollbackError) {
      error.message += `; também falhou ao desfazer a transação: ${rollbackError.message}`;
    }
    throw error;
  }
}

function openDatabase(path) {
  const opened = new s3.oo1.OpfsDb(path, 'c');
  try {
    opened.exec('PRAGMA foreign_keys=ON');
    migrateDatabase(opened);
    return opened;
  } catch (error) {
    try { opened.close(); } catch {}
    throw error;
  }
}

function validateIntegrity(database) {
  const integrity = database.selectValue('PRAGMA integrity_check');
  if (integrity !== 'ok') throw Error(`Backup SQLite corrompido: ${integrity}`);
  const violations = rowsFrom(database, 'PRAGMA foreign_key_check');
  if (violations.length) {
    throw Error(`Backup SQLite contém ${violations.length} violação(ões) de chave estrangeira`);
  }
}

const ready = (async () => {
  s3 = await sqlite3InitModule();
  if (!s3.oo1.OpfsDb) throw Error('VFS OPFS indisponível (requer COOP/COEP + Safari 16.4+)');
  db = openDatabase(DB_PATH);
})();

async function prepareRestore(buffer) {
  if (!(buffer instanceof ArrayBuffer) && !ArrayBuffer.isView(buffer)) {
    throw Error('Arquivo de backup inválido');
  }
  const bytes = buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (bytes.byteLength < 16) throw Error('Arquivo de backup SQLite vazio ou inválido');

  let stagedDb;
  try {
    await s3.oo1.OpfsDb.importDb(RESTORE_PATH, bytes);
    // Abre sem migração: DDL não pode mascarar a ausência das tabelas do app.
    stagedDb = new s3.oo1.OpfsDb(RESTORE_PATH, 'c');
    stagedDb.exec('PRAGMA foreign_keys=ON');
    validateIntegrity(stagedDb);
    validateBaseSchema(stagedDb);
    migrateDatabase(stagedDb);
    validateIntegrity(stagedDb);
    const exported = s3.capi.sqlite3_js_db_export(stagedDb);
    return new Uint8Array(exported).slice();
  } finally {
    try { stagedDb?.close(); } catch {}
    try { await s3.opfs.unlink(RESTORE_PATH); } catch (error) {
      // A ausência do arquivo temporário é normal se importDb falhou antes
      // de criá-lo. Erros de limpeza não substituem o erro original.
      if (stagedDb) console.warn('Não foi possível remover o banco temporário:', error);
    }
  }
}

async function restoreDatabase(buffer) {
  const replacement = await prepareRestore(buffer);
  const previous = new Uint8Array(s3.capi.sqlite3_js_db_export(db)).slice();
  db.close();
  db = null;

  try {
    await s3.oo1.OpfsDb.importDb(DB_PATH, replacement);
    db = openDatabase(DB_PATH);
    validateIntegrity(db);
    return { ok: true };
  } catch (restoreError) {
    try { db?.close(); } catch {}
    db = null;
    try {
      await s3.oo1.OpfsDb.importDb(DB_PATH, previous);
      db = openDatabase(DB_PATH);
    } catch (rollbackError) {
      db = null;
      throw Error(
        `Falha ao restaurar backup (${restoreError.message}) e ao recuperar o banco anterior ` +
        `(${rollbackError.message}). O banco não pôde ser reaberto; mantenha esta página aberta ` +
        `e preserve o arquivo de backup original para recuperação.`
      );
    }
    throw restoreError;
  }
}

const run = (sql, bind = []) => {
  const rows = [];
  db.exec({ sql, bind, rowMode: 'object', resultRows: rows });
  return { rows, id: db.selectValue('SELECT last_insert_rowid()') };
};

async function handleMessage({ id, type, sql, bind, stmts, buffer }) {
  try {
    await ready;
    let result;
    if (type === 'exec') result = run(sql, bind);
    else if (type === 'tx') {
      db.exec('BEGIN');
      try {
        result = stmts.map(([statement, values]) => run(statement, values));
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch (rollbackError) {
          error.message += `; também falhou ao desfazer a transação: ${rollbackError.message}`;
        }
        throw error;
      }
    } else if (type === 'export') result = s3.capi.sqlite3_js_db_export(db);
    else if (type === 'restore') result = await restoreDatabase(buffer);
    else throw Error(`Operação SQLite desconhecida: ${type}`);
    postMessage({ id, r: result });
  } catch (error) {
    postMessage({ id, err: String(error?.message || error) });
  }
}

onmessage = event => {
  // Serializa as operações para que restore não concorra com consultas ou
  // transações que usam a mesma conexão OPFS.
  queue = queue.then(() => handleMessage(event.data));
};
