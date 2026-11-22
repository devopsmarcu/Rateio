// ==========================================================================
// Rateio de Faturas — Tela 1: Início
// ==========================================================================
import { S } from '../core/state.js';
import { esc, R, vencida, proxVenc, diverge, hojeISO } from '../core/format.js';
import { overlay, monthSel, empty, emptyAction, ICO } from '../core/ui.js';
import { meses, faturaRows, q } from '../core/db.js';
import { bancoMeta } from '../core/banco.js';

async function inicio() {
  overlay(0);
  const ms = await meses();
  const rows = (await faturaRows()).filter(f => f.mes_referencia === S.mes);
  const tot = rows.reduce((s, f) => s + f.valor_total, 0);
  const pago = rows.filter(f => f.pago).reduce((s, f) => s + f.valor_total, 0);
  const pend = tot - pago;
  const pct = tot ? Math.min(100, Math.round((pago / tot) * 100)) : 0;
  
  // Itens que requerem atenção
  const att = rows.filter(f => vencida(f) || proxVenc(f) || diverge(f.soma, f.valor_total) || f.sem > 0);
  
  // Resumo por pessoa
  const rr = (await q(`
    SELECT r.pago, r.valor_fracao v, p.id pid, p.nome
    FROM rateio_lancamento r
    JOIN pessoas p ON p.id = r.pessoa_id
    JOIN lancamentos l ON l.id = r.lancamento_id
    JOIN faturas f ON f.id = l.fatura_id
    WHERE f.mes_referencia = ?
  `, [S.mes])).rows;
  
  const people = {};
  rr.forEach(r => {
    const p = people[r.pid] ??= { nome: r.nome, pid: r.pid, t: 0, o: 0 };
    p.t += r.v;
    if (!r.pago) p.o += r.v;
  });

  const rateado = rr.reduce((s, r) => s + r.v, 0);
  const recebido = rr.filter(r => r.pago).reduce((s, r) => s + r.v, 0);
  const pendenteReceber = rateado - recebido;
  const porBanco = rows.reduce((grupos, f) => {
    (grupos[f.banco] ??= []).push(f);
    return grupos;
  }, {});
  const peopleRows = Object.values(people).sort((a, b) => b.o - a.o || a.nome.localeCompare(b.nome, 'pt-BR'));
  const bankRows = Object.entries(porBanco).map(([banco, faturasBanco]) => ({
    banco,
    faturas: faturasBanco,
    total: faturasBanco.reduce((s, f) => s + f.valor_total, 0),
    pendente: faturasBanco.filter(f => !f.pago).reduce((s, f) => s + f.valor_total, 0)
  }));
  const personCount = peopleRows.length;
  const pendingPersonCount = peopleRows.filter(p => p.o > 0.005).length;
  const priorityRows = att.slice().sort((a, b) => {
    const priority = f => vencida(f) ? 0 : f.data_vencimento === hojeISO() ? 1 : diverge(f.soma, f.valor_total) ? 2 : proxVenc(f) ? 3 : f.sem > 0 ? 4 : 5;
    return priority(a) - priority(b);
  });

  const userName = localStorage.userName || 'Usuario';

  if (!ms.length) {
    return `
      <div class="page-header">
        <div class="brand-greeting">
          <span class="brand-sub">Rateio de Faturas</span>
          <h1 class="large-title">Olá, ${esc(userName)}</h1>
        </div>
      </div>
      ${empty(
        'Nenhuma fatura',
        'Importe a primeira fatura para conferir lançamentos e dividir despesas.',
        emptyAction('importar', 'Importar fatura')
      )}`;
  }

  return `
    <div class="page-header">
      <div class="brand-greeting">
        <span class="brand-sub">Rateio de Faturas</span>
        <h1 class="large-title">Olá, ${esc(userName)}</h1>
      </div>
      ${monthSel(ms)}
    </div>

    ${navigator.onLine ? '' : '<div class="offline-bar">Sem conexão. Funções locais continuam disponíveis.</div>'}

    <section class="home-balance" aria-label="Resumo financeiro do mês">
      <button type="button" class="home-balance-item home-pay" data-a="homePay">
        <span class="home-kicker">A pagar</span>
        <strong class="home-amount">${R(pend)}</strong>
        <span class="home-hint">${rows.filter(f => !f.pago).length} ${rows.filter(f => !f.pago).length === 1 ? 'fatura pendente' : 'faturas pendentes'} <span class="chev">${ICO.chev}</span></span>
      </button>
      <button type="button" class="home-balance-item home-receive" data-a="homeReceive">
        <span class="home-kicker">A receber</span>
        <strong class="home-amount">${R(pendenteReceber)}</strong>
        <span class="home-hint">${pendingPersonCount} ${pendingPersonCount === 1 ? 'pessoa pendente' : 'pessoas pendentes'} <span class="chev">${ICO.chev}</span></span>
      </button>
      <div class="home-total"><span>Total das faturas</span><strong class="money">${R(tot)}</strong></div>
      <div class="home-flow-summary"><span>Rateado <strong class="money">${R(rateado)}</strong></span><span>Recebido <strong class="money">${R(recebido)}</strong></span></div>
      <div class="home-progress-copy"><span>${R(pago)} pagos de ${R(tot)}</span><strong>${pct}%</strong></div>
      <div class="bar" role="progressbar" aria-label="Proporção de faturas pagas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i class="hero-progress-bar" style="--progress:${pct}%"></i></div>
    </section>

    <div class="actions home-import-action">
      <button type="button" class="btn primary" data-a="importar">${ICO.plus} Importar fatura</button>
    </div>

    <div class="home-section-heading">
      <h2>Resolver agora</h2>
      ${priorityRows.length ? `<span class="pill warn">${priorityRows.length}</span>` : ''}
    </div>
    ${priorityRows.length ? `<div class="group home-priorities">
      ${priorityRows.map(f => {
        const isVenc = vencida(f);
        const isToday = f.data_vencimento === hojeISO();
        const isDiv = diverge(f.soma, f.valor_total);
        const isProx = proxVenc(f);
        const why = isVenc ? 'Venceu' : isToday ? 'Vence hoje' : isDiv ? 'Conferir valores' : isProx ? 'Vence em breve' : 'Rateio pendente';
        const c = isVenc ? 'bad' : isToday || isDiv || isProx ? 'warn' : 'accent';
        const action = f.sem > 0 && !isVenc && !isToday && !isDiv && !isProx ? 'Ratear' : 'Revisar';
        const bm = bancoMeta(f.banco);
        return `<button type="button" class="cell home-priority" data-a="open" data-id="${f.id}">
          <span class="banco-badge home-bank-icon ${bm.cls}">${bm.sigla}</span>
          <span class="grow">
            <span class="home-priority-bank">${esc(f.banco)}</span>
            <span class="home-priority-meta"><span class="pill ${c}">${why}</span><span class="money">${R(f.valor_total)}</span></span>
          </span>
          <span class="home-action">${action}</span><span class="chev">${ICO.chev}</span>
        </button>`;
      }).join('')}
    </div>` : `<div class="group"><div class="cell mut sm">Nenhuma pendência prioritária neste mês.</div></div>`}

    <div class="home-section-heading"><h2>Por banco</h2></div>
    ${bankRows.length ? `<div class="group home-bank-list">
      ${bankRows.map(({ banco, faturas, total, pendente: pendenteBanco }) => {
        const bm = bancoMeta(banco);
        return `<button type="button" class="cell home-bank-row" data-a="homeBank" data-bank="${esc(banco)}">
          <span class="banco-badge home-bank-icon ${bm.cls}">${bm.sigla}</span>
          <span class="grow"><span class="home-priority-bank">${esc(banco)}</span><span class="sm mut">${faturas.length} ${faturas.length === 1 ? 'fatura' : 'faturas'} · ${pendenteBanco > 0.005 ? `${R(pendenteBanco)} pendente` : 'em dia'}</span></span>
          <strong class="money">${R(total)}</strong><span class="chev">${ICO.chev}</span>
        </button>`;
      }).join('')}
    </div>` : `<div class="group"><div class="cell mut sm">Nenhuma fatura neste mês.</div></div>`}

    <div class="home-section-heading"><h2>Resumo por pessoa</h2><button type="button" class="home-see-all" data-a="homePeopleAll">Ver todas</button></div>
    ${personCount ? `<div class="group home-people-list">
      ${peopleRows.slice(0, 3).map(p => {
          const isPago = p.o <= 0.005;
          const isParcial = !isPago && p.o < p.t - 0.005;
          const st = isPago ? 'Pago' : isParcial ? 'Parcial' : 'Pendente';
          const c = isPago ? 'ok' : 'warn';
          const initials = p.nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
          return `
            <button type="button" class="cell home-person-row" data-a="openp" data-id="${p.pid}">
              <div class="avatar">${initials}</div>
              <div class="grow">
                <div class="item-main">
                  <span class="bold">${esc(p.nome)}</span>
                  <span class="money">${R(p.o)}</span>
                </div>
                <div class="item-meta">
                  <span class="pill ${c}"><i class="dot"></i>${st}</span>
                  <span class="sm mut">Total ${R(p.t)}</span>
                </div>
              </div>
              <span class="chev">${ICO.chev}</span>
            </button>`;
        }).join('')}
    </div>` : `<div class="group"><div class="cell mut sm">Nenhum rateio registrado neste mês.</div></div>`}`;
}

export { inicio };
