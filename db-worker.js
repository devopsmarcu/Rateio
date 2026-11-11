import sqlite3InitModule from './sqlite/sqlite3.mjs';
const DDL=`
CREATE TABLE IF NOT EXISTS pessoas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, chave_pix TEXT);
CREATE TABLE IF NOT EXISTS bancos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS faturas (id INTEGER PRIMARY KEY AUTOINCREMENT, banco_id INTEGER NOT NULL, mes_referencia TEXT NOT NULL, valor_total REAL NOT NULL, data_vencimento TEXT, pago INTEGER DEFAULT 0, FOREIGN KEY (banco_id) REFERENCES bancos(id));
CREATE TABLE IF NOT EXISTS lancamentos (id INTEGER PRIMARY KEY AUTOINCREMENT, fatura_id INTEGER NOT NULL, descricao TEXT NOT NULL, valor REAL NOT NULL, data_transacao TEXT, dono_id INTEGER, n_parcelas INTEGER, parcela_atual INTEGER, grupo_parcela_id TEXT, recorrente INTEGER DEFAULT 0, FOREIGN KEY (fatura_id) REFERENCES faturas(id), FOREIGN KEY (dono_id) REFERENCES pessoas(id));
CREATE TABLE IF NOT EXISTS rateio_lancamento (id INTEGER PRIMARY KEY AUTOINCREMENT, lancamento_id INTEGER NOT NULL, pessoa_id INTEGER NOT NULL, valor_fracao REAL NOT NULL, porcentagem REAL, pago INTEGER DEFAULT 0, FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id) ON DELETE CASCADE, FOREIGN KEY (pessoa_id) REFERENCES pessoas(id));`;

let s3,db;
const ready=(async()=>{
 s3=await sqlite3InitModule();
 if(!s3.oo1.OpfsDb)throw Error('VFS opfs indisponível (requer COOP/COEP + Safari 16.4+)');
 db=new s3.oo1.OpfsDb('/faturas.sqlite3','c');
 db.exec('PRAGMA foreign_keys=ON');db.exec(DDL);
 // Migração defensiva: adiciona colunas se não existirem (v1)
 const v = db.selectValue('PRAGMA user_version') ?? 0;
 if (v < 1) {
   try { db.exec(`ALTER TABLE lancamentos ADD COLUMN n_parcelas INTEGER`); } catch(_) {}
   try { db.exec(`ALTER TABLE lancamentos ADD COLUMN parcela_atual INTEGER`); } catch(_) {}
   try { db.exec(`ALTER TABLE lancamentos ADD COLUMN recorrente INTEGER DEFAULT 0`); } catch(_) {}
   try { db.exec(`ALTER TABLE lancamentos ADD COLUMN grupo_parcela_id TEXT`); } catch(_) {}
   db.exec(`PRAGMA user_version = 1`);
 }
})();

// Valida se o buffer contém um banco SQLite válido com as tabelas esperadas
async function validateDbBuffer(s3Module, buffer) {
  const tempPath = '/faturas_temp_restore.sqlite3';
  let tempDb;
  try {
    const uint8 = new Uint8Array(buffer);
    // A API de importação pertence ao construtor OpfsDb, não à instância.
    await s3Module.oo1.OpfsDb.importDb(tempPath, uint8);
    tempDb = new s3Module.oo1.OpfsDb(tempPath, 'c');
    // Verifica tabelas essenciais
    const names = new Set(tempDb.selectValues(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('pessoas','bancos','faturas','lancamentos','rateio_lancamento')
    `));
    const required = ['pessoas','bancos','faturas','lancamentos','rateio_lancamento'];
    for (const t of required) if (!names.has(t)) throw Error(`Tabela ausente: ${t}`);
    return true;
  } finally {
    try { tempDb?.close(); } catch {}
    try { await s3Module.opfs.unlink(tempPath); } catch {}
  }
}

const run=(sql,bind=[])=>{const rows=[];db.exec({sql,bind,rowMode:'object',resultRows:rows});return{rows,id:db.selectValue('SELECT last_insert_rowid()')}};
onmessage=async({data:{id,type,sql,bind,stmts,buffer}})=>{
 try{await ready;let r;
  if(type==='exec')r=run(sql,bind);
  else if(type==='tx'){db.exec('BEGIN');try{r=stmts.map(([s,b])=>run(s,b));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
  else if(type==='export')r=s3.capi.sqlite3_js_db_export(db);
  else if(type==='restore'){
    // Valida o buffer recebido em banco temporário antes de substituir
    await validateDbBuffer(s3, buffer);
    // Fecha banco atual
    db.close();
    const uint8 = new Uint8Array(buffer);
    // Substitui o arquivo principal pela API de importação do OPFS.
    await s3.oo1.OpfsDb.importDb('/faturas.sqlite3', uint8);
    // Reabre o banco principal
    db = new s3.oo1.OpfsDb('/faturas.sqlite3','c');
    db.exec('PRAGMA foreign_keys=ON');
    // Reaplica migração v1 por segurança
    const v = db.selectValue('PRAGMA user_version') ?? 0;
    if (v < 1) {
      try { db.exec(`ALTER TABLE lancamentos ADD COLUMN n_parcelas INTEGER`); } catch(_) {}
      try { db.exec(`ALTER TABLE lancamentos ADD COLUMN parcela_atual INTEGER`); } catch(_) {}
      try { db.exec(`ALTER TABLE lancamentos ADD COLUMN recorrente INTEGER DEFAULT 0`); } catch(_) {}
      try { db.exec(`ALTER TABLE lancamentos ADD COLUMN grupo_parcela_id TEXT`); } catch(_) {}
      db.exec(`PRAGMA user_version = 1`);
    }
    r = { ok: true };
  }
  postMessage({id,r})
 }catch(e){postMessage({id,err:String(e.message||e)})}
};
