// ==========================================================================
// Rateio de Faturas — Rateio de lançamentos (normalização, casamento e UI)
// ==========================================================================
import { S } from '../core/state.js';
import { esc, R, f2, parcInfo, dataCurta } from '../core/format.js';
import { $, openSheet, ICO } from '../core/ui.js';
import { q } from '../core/db.js';

const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

function parc(d) {
  const m = d.match(/^(.*?)\s*-?\s*parcela\s+(\d+)\s*(?:\/|de)\s*(\d+)\s*$/i) ||
            d.match(/^(.*?)\s+(\d{2})\/(\d{2})$/) ||
            d.match(/^(.*?)\s*PARC\s*(\d{2})\/(\d{2})$/i);
  return m ? { k: norm(m[1]), n: +m[2], t: +m[3], raw: `${m[2]}/${m[3]}` } : { k: norm(d), n: 0, t: 0, raw: '' };
}

// Regra de ajuste financeiro de centavos na última pessoa
const cents = (T, pcts) => {
  const c = pcts.map(x => Math.round((T * x) / 100));
  c[c.length - 1] += T - c.reduce((a, b) => a + b, 0);
  return c;
};

async function casar(banco, mes, its) {
  const b = (await q('SELECT id FROM bancos WHERE nome = ?', [banco])).rows[0];
  if (!b) return its.map(() => null);

  const rows = (await q(`
    SELECT l.id lid, l.descricao d, l.valor v, l.grupo_parcela_id gpid, l.recorrente rec, r.pessoa_id pid, r.porcentagem pc, r.valor_fracao vf, p.nome
    FROM lancamentos l
    JOIN faturas f ON f.id = l.fatura_id
    JOIN rateio_lancamento r ON r.lancamento_id = l.id
    JOIN pessoas p ON p.id = r.pessoa_id
    WHERE f.banco_id = ? AND f.mes_referencia < ?
    ORDER BY f.mes_referencia DESC, l.id
  `, [b.id, mes])).rows;

  const H = new Map();
  for (const r of rows) {
    let h = H.get(r.lid);
    if (!h) H.set(r.lid, h = { ...parc(r.d), v: r.v, sh: [], grupo_parcela_id: r.gpid, recorrente: !!r.rec });
    h.sh.push({ pid: r.pid, nome: r.nome, pct: r.pc || (r.v ? (r.vf / r.v) * 100 : 0) });
  }

  const L = [...H.values()].filter(h => h.sh.reduce((a, x) => a + x.pct, 0) > 0);
  return its.map(i => {
    const c = parc(i.s);
    const h = L.find(h => h.k === c.k && (c.n ? h.n && h.t === c.t && h.n < c.n : !h.n && Math.abs(h.v - i.v) < 0.005));
    return h ? { sh: h.sh, info: c.n ? `parcela ${c.n}/${c.t}` : 'recorrente', grupo_parcela_id: h.grupo_parcela_id, recorrente: h.recorrente } : null;
  });
}

// Atualização e Validação do Rateio em Tempo Real
function rateioRest() {
  const box = $('#sheet');
  if (!box || !S.l) return;
  const pct = S.rmode === 'p';

  const rows = [...box.querySelectorAll('.rat-row')];
  let sum = 0;
  let countSelected = 0;

  rows.forEach(row => {
    const chk = row.querySelector('input[type=checkbox]');
    const inp = row.querySelector('.rv');
    const sub = row.querySelector('.rat-sub');
    const v = f2(inp.value);

    if (chk.checked && !isNaN(v)) {
      countSelected++;
      sum += v;
      if (pct) {
        const valCalc = S.l.valor * (v / 100);
        sub.textContent = R(valCalc);
      } else {
        const pctCalc = S.l.valor ? (v / S.l.valor) * 100 : 0;
        sub.textContent = pctCalc.toFixed(1) + '%';
      }
    } else {
      sub.textContent = '';
    }
  });

  const el = box.querySelector('.rest');
  if (!el) return;

  if (!countSelected) {
    el.className = 'rest mut';
    el.textContent = 'Selecione as pessoas para o rateio';
    return;
  }

  if (pct) {
    const ok = Math.abs(sum - 100) <= 0.05;
    if (ok) {
      el.className = 'rest ok';
      el.textContent = `Total distribuído: ${R(S.l.valor)} ✓ Completo`;
    } else if (sum < 100) {
      el.className = 'rest warn';
      el.textContent = `${sum.toFixed(1)}% distribuídos · Faltam ${(100 - sum).toFixed(1)}%`;
    } else {
      el.className = 'rest bad';
      el.textContent = `${sum.toFixed(1)}% distribuídos · Excede ${(sum - 100).toFixed(1)}%`;
    }
  } else {
    const df = S.l.valor - sum;
    if (Math.abs(df) <= 0.005) {
      el.className = 'rest ok';
      el.textContent = `Total distribuído: ${R(sum)} ✓ Completo`;
    } else if (df > 0) {
      el.className = 'rest warn';
      el.textContent = `Distribuído: ${R(sum)} · Faltam ${R(df)}`;
    } else {
      el.className = 'rest bad';
      el.textContent = `Distribuído: ${R(sum)} · Excede ${R(-df)}`;
    }
  }
}

// Renderizador da Folha de Rateio (Screen 8 Mockup)
function renderRateio(Ps, Rt, hint) {
  const l = S.l, pct = S.rmode === 'p';
  const parc = parcInfo(l.descricao);
  const isRecorrente = !!l.recorrente;

  openSheet(`
    <h2>Rateio de Lançamento</h2>
    <div class="sheet-pad" style="text-align:center;padding-bottom:8px">
      <div class="bold" style="font-size:18px">${esc(l.descricao)}</div>
      <div class="sm mut" style="margin-top:2px">
        <span class="money bold">${R(l.valor)}</span>
        ${l.data_transacao ? ` · ${dataCurta(l.data_transacao)}` : ''}
        ${parc ? ` · Parcela ${esc(parc)}` : ''}
      </div>
      ${hint ? `<div class="pill accent" style="margin-top:8px">${ICO.star} ${esc(hint)}</div>` : ''}
    </div>

    <!-- Alternador de Modo (Segmented Control) -->
    <div class="seg" style="margin:10px 16px 12px">
      <button type="button" class="${pct ? '' : 'on'}" data-a="rmode" data-k="v">Por valor</button>
      <button type="button" class="${pct ? 'on' : ''}" data-a="rmode" data-k="p">Por porcentagem</button>
    </div>

    <!-- Toggle Assinatura Mensal -->
    <div class="group" style="margin:0 16px 12px">
      <label class="cell" style="padding:8px 0">
        <span class="grow">
          <span class="bold">${ICO.star} Assinatura mensal (recorrente)</span>
          <span class="sm mut">Este lançamento se repetirá todos os meses. O rateio será sugerido automaticamente nas próximas faturas deste banco.</span>
        </span>
        <input type="checkbox" id="recToggle" ${isRecorrente ? 'checked' : ''} data-a="togglerecl" style="width:24px;height:24px;accent-color:var(--accent)">
      </label>
    </div>

    <!-- Lista de Participantes -->
    <div class="group">
      ${Ps.map(p => {
        const r = Rt.find(x => x.pessoa_id === p.id);
        const val = r
          ? (pct
              ? (r.porcentagem ?? (l.valor ? (r.valor_fracao / l.valor) * 100 : 0)).toFixed(2)
              : r.valor_fracao.toFixed(2))
          : '';
        const initials = p.nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
        return `
          <div class="cell rat-row">
            <label style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;cursor:pointer">
              <input type="checkbox" data-pid="${p.id}" ${r ? 'checked' : ''}>
              <div class="avatar" style="width:30px;height:30px;font-size:12px">${initials}</div>
              <span class="bold ellipsis">${esc(p.nome)}</span>
            </label>
            <div>
              <input class="rv rat-amt" inputmode="decimal" value="${val}" aria-label="${esc(p.nome)}" placeholder="${pct ? '0.00%' : 'R$ 0,00'}">
              <div class="rat-sub"></div>
            </div>
          </div>`;
      }).join('')}
    </div>

    <!-- Atalho para Adicionar Pessoa -->
    <div style="padding:0 16px 8px;text-align:right">
      <button type="button" class="btn ghost sm" data-a="addpui" style="display:inline-flex;padding:0">
        ${ICO.plus} Adicionar pessoa
      </button>
    </div>

    <!-- Status do Rateio -->
    <div class="rest mut">—</div>

    <!-- Ações do Rateio -->
    <div class="actions">
      <button type="button" class="btn primary" data-a="svrat">Confirmar</button>
      <button type="button" class="btn secondary" data-a="igual">Dividir igualmente</button>
      <div style="display:flex;gap:10px">
        <button type="button" class="btn ghost" style="flex:1" data-a="reuse">Reaproveitar anterior</button>
        <button type="button" class="btn ghost bad" style="flex:1" data-a="ratclear">Limpar</button>
      </div>
    </div>`);

  rateioRest();
}

// Modal de Reaproveitamento de Rateio (Screen 9 Mockup)
function modalReaproveitamento(match, lid) {
  openSheet(`
    <div style="text-align:center;padding:12px 16px 0">
      <div class="pill accent" style="margin-bottom:12px">${ICO.star} Rateio anterior</div>
      <h2 style="padding:0 16px 6px">Este lançamento já foi rateado antes.</h2>
      <p class="mut sm">Deseja reaproveitar a divisão do mês anterior?</p>
    </div>

    <div class="reuse-card">
      <div class="bold" style="font-size:18px">${esc(S.l.descricao)}</div>
      <div class="money-lg" style="margin:6px 0">${R(S.l.valor)}</div>
      <div class="sm mut">${match.info} · ${match.sh.map(x => `${esc(x.nome)} (${x.pct.toFixed(0)}%)`).join(' / ')}</div>
    </div>

    <div class="actions">
      <button type="button" class="btn primary" data-a="applyreuse" data-lid="${lid}">Reaproveitar rateio</button>
      <button type="button" class="btn secondary" data-a="closesheet">Configurar manualmente</button>
    </div>`);
}

export { norm, parc, cents, casar, rateioRest, renderRateio, modalReaproveitamento };
