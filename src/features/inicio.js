// ==========================================================================
// Rateio de Faturas — Tela 1: Início
// ==========================================================================
import { S } from '../core/state.js';
import { esc, R, vencida, proxVenc, diverge } from '../core/format.js';
import { overlay, monthSel, empty, ICO } from '../core/ui.js';
import { meses, faturaRows, q } from '../core/db.js';
import { faturaCell } from '../core/banco.js';

async function inicio() {
  overlay(0);
  const ms = await meses();
  const rows = (await faturaRows()).filter(f => f.mes_referencia === S.mes);
  const tot = rows.reduce((s, f) => s + f.valor_total, 0);
  const pago = rows.filter(f => f.pago).reduce((s, f) => s + f.valor_total, 0);
  const pend = tot - pago;
  const pct = tot ? Math.min(100, Math.round((pago / tot) * 100)) : 0;
  
  // Itens que requerem atenção
  const att = rows.filter(f => vencida(f) || proxVenc(f) || diverge(f.soma, f.valor_total));
  
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
        '<div class="actions" style="margin:0"><button type="button" class="btn primary" data-a="importar">' + ICO.plus + ' Importar fatura</button></div>'
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

    <!-- Resumo Financeiro Hero -->
    <div class="hero">
      <div class="hero-label">Faturas pendentes</div>
      <div class="money-xl">${R(pend)}</div>
      <div class="bar-wrap">
        <div class="bar" aria-hidden="true">
          <i style="width:${pct}%"></i>
        </div>
      </div>
      <div class="sub-metrics">
        <div>
          <div class="k">Pago</div>
          <div class="money ok">${R(pago)} <span class="sm mut">(${pct}%)</span></div>
        </div>
        <div style="text-align:right">
          <div class="k">Total das faturas</div>
          <div class="money">${R(tot)}</div>
        </div>
      </div>
    </div>

    <div class="dashboard-metrics" aria-label="Indicadores financeiros do mês">
      <div class="dashboard-metric">
        <span>Total das faturas</span>
        <strong>${R(tot)}</strong>
      </div>
      <div class="dashboard-metric">
        <span>Já rateado</span>
        <strong>${R(rateado)}</strong>
      </div>
      <div class="dashboard-metric warn">
        <span>Pendente de receber</span>
        <strong>${R(pendenteReceber)}</strong>
      </div>
      <div class="dashboard-metric ok">
        <span>Total recebido</span>
        <strong>${R(recebido)}</strong>
      </div>
    </div>

    <!-- Seção de Atenção (Se houver pendências críticas) -->
    ${att.length ? `
      <p class="section-label">Atenção</p>
      <div class="group">
        ${att.map(f => {
          const isVenc = vencida(f);
          const isProx = proxVenc(f);
          const isDiv = diverge(f.soma, f.valor_total);
          const why = isVenc ? 'Fatura vencida' : isProx ? 'Vence em breve' : isDiv ? 'Fatura não conferida' : 'Revisar';
          const badgeClass = isVenc ? 'bad' : 'warn';
          return `
            <div class="cell pressable" data-a="open" data-id="${f.id}" role="button" tabindex="0">
              <div class="grow">
                <div class="item-main">
                  <b>${esc(f.banco)}</b>
                  <span class="money">${R(f.valor_total)}</span>
                </div>
                <div class="item-meta">
                  <span class="pill ${badgeClass}"><i class="dot"></i>${why}</span>
                </div>
              </div>
              <span class="chev">${ICO.chev}</span>
            </div>`;
        }).join('')}
      </div>` : ''}

    <p class="section-label">Faturas por banco</p>
    ${Object.entries(porBanco).map(([banco, faturasBanco]) => `
      <p class="section-label bank-group-title">${esc(banco)} · ${faturasBanco.length} ${faturasBanco.length === 1 ? 'fatura' : 'faturas'}</p>
      <div class="group">${faturasBanco.map(faturaCell).join('')}</div>
    `).join('')}

    <!-- Resumo por Pessoa -->
    <p class="section-label">Resumo por pessoa</p>
    ${Object.keys(people).length ? `
      <div class="group">
        ${Object.values(people).map(p => {
          const isPago = p.o <= 0.005;
          const isParcial = !isPago && p.o < p.t - 0.005;
          const st = isPago ? 'Pago' : isParcial ? 'Parcial' : 'Pendente';
          const c = isPago ? 'ok' : 'warn';
          const initials = p.nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
          return `
            <div class="cell pressable" data-a="openp" data-id="${p.pid}" role="button" tabindex="0">
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
            </div>`;
        }).join('')}
      </div>` : `
      <div class="group">
        <div class="cell mut sm">Nenhum rateio registrado neste mês.</div>
      </div>`}

    <!-- Botão Principal de Ação -->
    <div class="fab-wrap">
      <button type="button" class="btn primary" data-a="importar">
        ${ICO.plus} Importar fatura
      </button>
    </div>`;
}

export { inicio };
