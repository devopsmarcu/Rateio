import sqlite3InitModule from './sqlite/sqlite3.mjs';
const DDL=`
CREATE TABLE IF NOT EXISTS pessoas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, chave_pix TEXT);
CREATE TABLE IF NOT EXISTS bancos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS faturas (id INTEGER PRIMARY KEY AUTOINCREMENT, banco_id INTEGER NOT NULL, mes_referencia TEXT NOT NULL, valor_total REAL NOT NULL, data_vencimento TEXT, pago INTEGER DEFAULT 0, FOREIGN KEY (banco_id) REFERENCES bancos(id));
CREATE TABLE IF NOT EXISTS lancamentos (id INTEGER PRIMARY KEY AUTOINCREMENT, fatura_id INTEGER NOT NULL, descricao TEXT NOT NULL, valor REAL NOT NULL, data_transacao TEXT, dono_id INTEGER, n_parcelas INTEGER, parcela_atual INTEGER, grupo_parcela_id TEXT, recorrente INTEGER DEFAULT 0, FOREIGN KEY (fatura_id) REFERENCES faturas(id), FOREIGN KEY (dono_id) REFERENCES pessoas(id));
CREATE TABLE IF NOT EXISTS rateio_lancamento (id INTEGER PRIMARY KEY AUTOINCREMENT, lancamento_id INTEGER NOT NULL, pessoa_id INTEGER NOT NULL, valor_fracao REAL NOT NULL, porcentagem REAL, pago INTEGER DEFAULT 0, FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id) ON DELETE CASCADE, FOREIGN KEY (pessoa_id) REFERENCES pessoas(id));`;

const MIGRATIONS = [
  // v1: colunas de parcelamento e recorrência
  `ALTER TABLE lancamentos ADD COLUMN n_parcelas INTEGER`,
  `ALTER TABLE lancamentos ADD COLUMN parcela_atual INTEGER`,
  `ALTER TABLE lancamentos ADD COLUMN grupo_parcela_id TEXT`,
  `ALTER TABLE lancamentos ADD COLUMN recorrente INTEGER DEFAULT 0`,
];

let s3,db;
const ready=(async()=>{
 s3=await sqlite3InitModule();
 if(!s3.oo1.OpfsDb)throw Error('VFS opfs indisponível (requer COOP/COEP + Safari 16.4+)');
 db=new s3.oo1.OpfsDb('/faturas.sqlite3','c');
 db.exec('PRAGMA foreign_keys=ON');db.exec(DDL);
 // Migrações não-destrutivas via user_version
 const current = db.selectValue('PRAGMA user_version') || 0;
 for (let v = current + 1; v <= MIGRATIONS.length; v++) {
   try { db.exec(MIGRATIONS[v - 1]); } catch (e) { /* coluna já existe */ }
   db.exec(`PRAGMA user_version = ${v}`);
 }
})();
const run=(sql,bind=[])=>{const rows=[];db.exec({sql,bind,rowMode:'object',resultRows:rows});return{rows,id:db.selectValue('SELECT last_insert_rowid()')}};
onmessage=async({data:{id,type,sql,bind,stmts}})=>{
 try{await ready;let r;
  if(type==='exec')r=run(sql,bind);
  else if(type==='tx'){db.exec('BEGIN');try{r=stmts.map(([s,b])=>run(s,b));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
  else if(type==='export')r=s3.capi.sqlite3_js_db_export(db);
  postMessage({id,r})
 }catch(e){postMessage({id,err:String(e.message||e)})}
};
