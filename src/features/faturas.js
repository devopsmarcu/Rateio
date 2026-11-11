// ==========================================================================
// Rateio de Faturas — Tela 2: Faturas e Detalhe da Fatura
// ==========================================================================
import { S } from '../core/state.js';
import { esc, R, vencida, diverge, mesLabel, dataCurta, parcInfo } from '../core/format.js';
import { overlay, top, monthSel, empty, backBtn, ICO } from '../core/ui.js';
import { q, meses, faturaRows } from '../core/db.js';
import { bancoMeta, faturaEstado, faturaCell } from '../core/banco.js';

async function faturas() {
  if (S.fat) return detalhe(S.fat);
  overlay(0);
  const ms = await meses();
  let rows = await faturaRows();
  const totMes = rows.filter(f => f.mes_referencia === S.mes).reduce((s, f) => s + f.valor_total, 0);
  rows = rows.filter(f => f.mes_referencia === S.mes);

  if (S.ff === 'pendentes') rows = rows.filter(f => !f.pago);
  else if (S.ff === 'pagas') rows = rows.filter(f => f.pago);
  else if (S.ff === 'divergentes') rows = rows.filter(f => diverge(f.soma, f.valor_total));
  if (S.fq) rows = rows.filter(f => f.banco.toLocaleLowerCase('pt-BR').includes(S.fq.toLocaleLowerCase('pt-BR')));

  const filt = ['todas', 'pendentes', 'pagas', 'divergentes'];
  const labels = { todas: 'Todas', pendentes: 'Pendentes', pagas: 'Pagas', divergentes: 'Divergentes' };
  const porBanco = rows.reduce((grupos, f) => {
    (grupos[f.banco] ??= []).push(f);
    return grupos;
  }, {});

  return `
    ${top(
      'Faturas',
      '<span></span>',
      `<button type="button" class="link right" data-a="importar" aria-label="Importar fatura">${ICO.plus}</button>`
    )}

    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 16px 10px;">
      ${monthSel(ms)}
      <span class="sm mut">Total: <b class="money ${rows.length ? 'bold' : ''}">${R(totMes)}</b></span>
    </div>

    <!-- Segmented Control iOS -->
    <div class="seg" role="tablist">
      ${filt.map(k => `
        <button type="button" data-a="ff" data-k="${k}" class="${S.ff === k ? 'on' : ''}">${labels[k]}</button>
      `).join('')}
    </div>

    <div class="fatura-search">
      <input class="field" type="search" data-a="fsearch" value="${esc(S.fq)}" placeholder="Pesquisar por banco" aria-label="Pesquisar faturas por banco">
    </div>

    <!-- Lista de Faturas agrupada por instituição -->
    ${rows.length ? `
      ${Object.entries(porBanco).map(([banco, faturasBanco]) => `
        <p class="section-label">${esc(banco)} · ${faturasBanco.length} ${faturasBanco.length === 1 ? 'fatura' : 'faturas'}</p>
        <div class="group">${faturasBanco.map(faturaCell).join('')}</div>
      `).join('')}` : empty(
        'Nenhuma fatura',
        'Não há faturas para o filtro selecionado.',
        '<div class="actions" style="margin:0"><button type="button" class="btn primary" data-a="importar">' + ICO.plus + ' Importar fatura</button></div>'
      )}`;
}

// ==========================================================================
// Tela 7: Detalhes da Fatura & Lançamentos
// ==========================================================================
async function detalhe(id) {
  overlay(1);
  const f = (await q(`
    SELECT f.*, b.nome banco
    FROM faturas f
    JOIN bancos b ON b.id = f.banco_id
    WHERE f.id = ?
  `, [id])).rows[0];

  if (!f) {
    S.fat = null;
    return faturas();
  }

  const L = (await q(`SELECT * FROM lancamentos WHERE fatura_id = ? ORDER BY data_transacao DESC, id DESC`, [id])).rows;
  const Rt = (await q(`
    SELECT r.lancamento_id lid, r.valor_fracao v, r.pago, p.nome, p.id pid
    FROM rateio_lancamento r
    JOIN pessoas p ON p.id = r.pessoa_id
    WHERE r.lancamento_id IN (SELECT id FROM lancamentos WHERE fatura_id = ?)
  `, [id])).rows;

  const soma = L.reduce((s, l) => s + l.valor, 0);
  const { conf, pag } = faturaEstado({ ...f, soma });
  const bm = bancoMeta(f.banco);

  // Resumo por pessoa nesta fatura
  const resumoP = {};
  Rt.forEach(x => {
    resumoP[x.nome] = (resumoP[x.nome] || 0) + x.v;
  });

  return `
    ${top(
      f.banco,
      backBtn('back', 'Faturas'),
      `<button type="button" class="link right" data-a="fatmenu" data-id="${id}" aria-label="Mais ações">${ICO.more}</button>`
    )}

    <!-- Cabeçalho do Banco e Fatura -->
    <div class="hero">
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px">
        <div class="banco-badge ${bm.cls}" style="width:32px;height:32px;font-size:12px">${bm.sigla}</div>
        <span class="bold">${esc(f.banco)}</span>
        <span class="mut sm">· ${esc(mesLabel(f.mes_referencia))}</span>
      </div>
      <div class="money-xl">${R(f.valor_total)}</div>
      <div class="sm mut" style="margin-top:4px">
        Vencimento: <b class="bold">${esc(dataCurta(f.data_vencimento) || '—')}</b>
      </div>
      <div class="item-meta" style="justify-content:center;margin-top:12px">
        <span class="pill ${conf.c}"><i class="dot"></i>${conf.t}</span>
        <span class="pill ${pag.c}"><i class="dot"></i>${pag.t}</span>
      </div>
      ${diverge(soma, f.valor_total)
        ? `<div class="pill warn" style="margin-top:12px">Lançamentos somam ${R(soma)} (diferença ${R(f.valor_total - soma)})</div>`
        : `<div class="pill ok" style="margin-top:12px">${ICO.check} Itens conferem com o total da fatura</div>`}
    </div>

    <!-- Menu Agrupado de Ações Estilo iOS (Screen 7 Mockup) -->
    <div class="group">
      <div class="cell pressable" data-a="scrollto" data-target="#lancamentos-section">
        <span class="grow bold">Lançamentos</span>
        <span class="mut sm">${L.length}</span>
        <span class="chev">${ICO.chev}</span>
      </div>
      <div class="cell pressable" data-a="fatrateio" data-id="${id}">
        <span class="grow bold">Rateio entre pessoas</span>
        <span class="chev">${ICO.chev}</span>
      </div>
      <div class="cell pressable" data-a="fatresumo" data-id="${id}">
        <span class="grow bold">Resumo por pessoa</span>
        <span class="chev">${ICO.chev}</span>
      </div>
      <div class="cell pressable" data-a="paga" data-id="${id}">
        <span class="grow bold">Status do pagamento</span>
        <span class="pill ${pag.c}">${pag.t}</span>
        <span class="chev">${ICO.chev}</span>
      </div>
      <div class="cell pressable" data-a="editfat" data-id="${id}">
        <span class="grow bold">Editar dados da fatura</span>
        <span class="chev">${ICO.chev}</span>
      </div>
      <div class="cell pressable" data-a="delfat" data-id="${id}">
        <span class="grow bad bold">Excluir fatura</span>
        <span class="chev" style="color:var(--bad)">${ICO.chev}</span>
      </div>
    </div>

    <!-- Lista de Lançamentos -->
    <p class="section-label" id="lancamentos-section">Lançamentos · ${L.length}</p>
    <div class="group">
      ${L.map(l => {
        const r = Rt.filter(x => x.lid === l.id);
        const sum = r.reduce((s, x) => s + x.v, 0);
        const ok = r.length && Math.abs(sum - l.valor) <= 0.05;
        const parc = parcInfo(l.descricao);
        return `
          <div class="cell pressable" data-a="ratear" data-id="${l.id}" role="button" tabindex="0">
            <div class="grow">
              <div class="item-main">
                <span class="desc">${esc(l.descricao)}</span>
                <span class="money">${R(l.valor)}</span>
              </div>
              <div class="item-meta sm mut">
                ${l.data_transacao ? `<span>${esc(dataCurta(l.data_transacao))}</span>` : ''}
                ${parc ? `<span class="pill">Parcela ${esc(parc)}</span>` : ''}
              </div>
              <div class="item-meta">
                ${ok
                  ? `<span class="pill ok">${r.map(x => esc(x.nome) + ' ' + R(x.v)).join(' · ')}</span>`
                  : r.length
                    ? `<span class="pill warn">${r.map(x => esc(x.nome)).join(', ')} · incompleto</span>`
                    : `<span class="pill warn">Sem rateio</span>`}
              </div>
            </div>
            <span class="chev">${ICO.chev}</span>
          </div>`;
      }).join('') || '<div class="cell mut">Nenhum lançamento encontrado.</div>'}
    </div>

    <div class="actions">
      <button type="button" class="btn secondary" data-a="paga" data-id="${id}">
        ${f.pago ? 'Marcar como pendente' : 'Marcar fatura como paga'}
      </button>
    </div>`;
}

export { faturas, detalhe };
