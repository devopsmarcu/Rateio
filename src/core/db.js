// ==========================================================================
// Rateio de Faturas — Comunicação com o SQLite Worker (OPFS)
// ==========================================================================

let W = null;
const P = new Map();
let seq = 0;

// Cria o worker do SQLite. Deve ser chamado APÓS a verificação de COOP/COEP
// (crossOriginIsolated), pois o OPFS depende do isolamento.
function initDb() {
  W = new Worker(new URL('../../db-worker.js', import.meta.url), { type: 'module' });
  W.onmessage = ({ data: { id, r, err } }) => {
    const p = P.get(id);
    P.delete(id);
    err ? p.rej(Error(err)) : p.res(r);
  };
}

const call = (type, o = {}) => new Promise((res, rej) => {
  P.set(++seq, { res, rej });
  W.postMessage({ id: seq, type, ...o });
});

const q = (sql, bind = []) => call('exec', { sql, bind });
const tx = stmts => call('tx', { stmts });

async function meses() {
  return (await q('SELECT DISTINCT mes_referencia m FROM faturas ORDER BY m DESC')).rows.map(r => r.m);
}

async function faturaRows() {
  return (await q(`
    SELECT f.*, b.nome banco,
      (SELECT COALESCE(SUM(valor), 0) FROM lancamentos WHERE fatura_id = f.id) soma,
      (SELECT COUNT(*) FROM lancamentos WHERE fatura_id = f.id) n,
      (SELECT COUNT(*) FROM lancamentos l WHERE l.fatura_id = f.id AND NOT EXISTS (SELECT 1 FROM rateio_lancamento r WHERE r.lancamento_id = l.id)) sem
    FROM faturas f
    JOIN bancos b ON b.id = f.banco_id
    ORDER BY mes_referencia DESC, f.id DESC
  `)).rows;
}

export { initDb, call, q, tx, meses, faturaRows };
