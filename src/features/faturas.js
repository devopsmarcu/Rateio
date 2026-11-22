// ==========================================================================
// Rateio de Faturas — Tela 2: Faturas e Detalhe da Fatura
// ==========================================================================
import { S } from '../core/state.js';
import { esc, R, diverge, mesLabel, mesCurto, dataCurta, parcInfo } from '../core/format.js';
import { overlay, top, monthSel, empty, emptyAction, backBtn, ICO } from '../core/ui.js';
import { q, meses, faturaRows } from '../core/db.js';
import { bancoMeta, faturaEstado, vencimentoInfo } from '../core/banco.js';

async function faturas() {
  if (S.fat) return detalhe(S.fat);
  overlay(0);
  const ms = await meses();
  const allRows = await faturaRows();
  const periodRows = allRows.filter(f => f.mes_referencia === S.mes);
  const totMes = periodRows.reduce((s, f) => s + f.valor_total, 0);
  const banks = [...new Set(periodRows.map(f => f.banco))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (S.fb && !banks.includes(S.fb)) S.fb = '';
  const needle = (S.fq || '').trim().toLocaleLowerCase('pt-BR');
  const matches = f => !needle || [
    f.banco, f.mes_referencia, mesLabel(f.mes_referencia), f.data_vencimento,
    dataCurta(f.data_vencimento), vencimentoInfo(f).text, R(f.valor_total), String(f.valor_total),
    f.pago ? 'paga paga pago recebida' : 'pendente aberta não paga',
    diverge(f.soma, f.valor_total) ? 'divergente diferença' : 'conferida'
  ].some(v => String(v || '').toLocaleLowerCase('pt-BR').includes(needle));
  const queryRows = periodRows.filter(f => (!S.fb || f.banco === S.fb) && matches(f));
  const counts = {
    todas: queryRows.length,
    pendentes: queryRows.filter(f => !f.pago).length,
    pagas: queryRows.filter(f => !!f.pago).length,
    divergentes: queryRows.filter(f => diverge(f.soma, f.valor_total)).length
  };
  let rows = queryRows.filter(f => {
    if (S.ff === 'pendentes') return !f.pago;
    if (S.ff === 'pagas') return !!f.pago;
    if (S.ff === 'divergentes') return diverge(f.soma, f.valor_total);
    return true;
  });

  const participantRows = rows.length ? (await q(`
    SELECT l.fatura_id,
      COALESCE(SUM(r.valor_fracao), 0) total,
      COALESCE(SUM(CASE WHEN r.pago = 0 THEN r.valor_fracao ELSE 0 END), 0) pendente
    FROM lancamentos l
    LEFT JOIN rateio_lancamento r ON r.lancamento_id = l.id
    WHERE l.fatura_id IN (${rows.map(() => '?').join(',')})
    GROUP BY l.fatura_id
  `, rows.map(f => f.id))).rows : [];
  const participantByInvoice = new Map(participantRows.map(r => [r.fatura_id, r]));
  rows = rows.map(f => ({ ...f, recebimentos: participantByInvoice.get(f.id) || { total: 0, pendente: 0 } }));

  const compare = (a, b) => {
    if (S.fo === 'valor') return (+b.valor_total - +a.valor_total) || String(a.banco).localeCompare(String(b.banco), 'pt-BR');
    if (S.fo === 'instituicao') return String(a.banco).localeCompare(String(b.banco), 'pt-BR') || String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || ''));
    return String(a.data_vencimento || '9999-12-31').localeCompare(String(b.data_vencimento || '9999-12-31')) || String(a.banco).localeCompare(String(b.banco), 'pt-BR');
  };
  const attention = rows.filter(f => {
    const due = vencimentoInfo(f);
    return !f.pago && ['vencida', 'hoje'].includes(due.status);
  }).sort(compare);
  const attentionIds = new Set(attention.map(f => f.id));
  const others = rows.filter(f => !attentionIds.has(f.id)).sort(compare);
  const labels = { todas: 'Todas', pendentes: 'Pendentes', pagas: 'Pagas', divergentes: 'Divergentes' };

  const invoiceRow = f => {
    const { conf, pag } = faturaEstado(f);
    const bm = bancoMeta(f.banco);
    const due = vencimentoInfo(f);
    const urgent = ['vencida', 'hoje', 'proximo'].includes(due.status) && !f.pago;
    const date = f.data_vencimento ? dataCurta(f.data_vencimento) : '';
    const dueText = due.status === 'vencida'
      ? `${due.text} · ${date}`
      : due.status === 'hoje'
        ? `${due.text} · ${date}`
        : due.status === 'proximo'
          ? `${due.text} · ${date}`
          : f.pago ? `Paga${date ? ` em ${date}` : ''}` : date ? `Vencimento · ${date}` : 'Sem vencimento';
    const receipt = +f.recebimentos.pendente > 0
      ? `${R(f.recebimentos.pendente)} a receber${f.sem > 0 ? ` · ${f.sem} ${f.sem === 1 ? 'item sem rateio' : 'itens sem rateio'}` : ''}`
      : f.sem > 0
        ? `Rateio pendente em ${f.sem} ${f.sem === 1 ? 'lançamento' : 'lançamentos'}`
        : +f.recebimentos.total > 0 ? 'Recebimentos concluídos' : 'Sem rateio de participantes';
    const receiptTone = +f.recebimentos.pendente > 0 ? 'info' : f.sem > 0 ? 'warn' : +f.recebimentos.total > 0 ? 'ok' : 'mut';
    return `
      <article class="invoice-row ${due.status === 'vencida' && !f.pago ? 'is-overdue' : due.status === 'hoje' && !f.pago ? 'is-due-today' : ''}">
        <button type="button" class="invoice-open" data-a="open" data-id="${f.id}" aria-label="Detalhes de ${esc(f.banco)}, ${esc(mesCurto(f.mes_referencia))}, ${esc(R(f.valor_total))}">
          <span class="banco-badge bank-avatar-sm ${bm.cls}" aria-hidden="true">${esc(bm.sigla)}</span>
          <span class="invoice-main">
            <span class="invoice-bank">${esc(f.banco)}</span>
            <span class="invoice-period">${esc(mesCurto(f.mes_referencia))}</span>
          </span>
          <span class="invoice-money">${R(f.valor_total)}</span>
          <span class="invoice-due ${due.status === 'vencida' ? 'bad' : urgent ? 'warn' : f.pago ? 'ok' : 'mut'}">${esc(dueText)}</span>
          <span class="invoice-payment"><span class="pill ${pag.c}"><i class="dot"></i>Fatura ${f.pago ? 'paga' : 'pendente'}</span>${diverge(f.soma, f.valor_total) ? `<span class="pill warn">${conf.t}</span>` : ''}</span>
          <span class="chev">${ICO.chev}</span>
        </button>
        <div class="invoice-receipt ${receiptTone}"><span class="invoice-receipt-label">Participantes</span><span>${esc(receipt)}</span></div>
        ${!f.pago && f.n > 0 ? `<button type="button" class="invoice-rate" data-a="fatrateio" data-id="${f.id}" aria-label="Abrir lançamentos para ratear a fatura ${esc(f.banco)}">Ratear <span aria-hidden="true">${ICO.chev}</span></button>` : ''}
      </article>`;
  };

  const emptyState = () => {
    if (!periodRows.length) return empty('Nenhuma fatura neste mês', 'Importe uma fatura ou escolha outra competência para continuar.', emptyAction('importar', 'Importar fatura'));
    if (S.fq.trim()) return empty('Nenhum resultado para a busca', 'Tente outro banco, valor, competência, vencimento ou status.', `<button type="button" class="btn secondary" data-a="clearfilters">Limpar pesquisa</button>`);
    if (S.fb) return empty(`Nenhuma fatura em ${S.fb}`, 'Esse banco não tem faturas nesta competência e com o status selecionado.', `<button type="button" class="btn secondary" data-a="clearbank">Ver todos os bancos</button>`);
    if (S.ff === 'pendentes') return empty('Nenhuma fatura pendente', 'Todas as faturas desta competência estão pagas.');
    if (S.ff === 'pagas') return empty('Nenhuma fatura paga', 'Ainda não há faturas pagas nesta competência.');
    if (S.ff === 'divergentes') return empty('Nenhuma divergência', 'Os valores lançados conferem com as faturas desta competência.');
    return empty('Nenhuma fatura encontrada', 'Revise os filtros ou importe uma fatura.', emptyAction('importar', 'Importar fatura'));
  };

  return `
    ${top(
      'Faturas',
      '<span></span>',
      `<button type="button" class="invoice-import" data-a="importar">${ICO.plus}<span>Importar</span></button>`
    )}

    <div class="month-summary-row">
      ${monthSel(ms)}
      <span class="sm mut">Total <b class="money ${periodRows.length ? 'bold' : ''}">${R(totMes)}</b></span>
    </div>

    <div class="fatura-search">
      <input class="field" type="search" data-a="fsearch" value="${esc(S.fq)}" placeholder="Buscar banco, valor ou status" aria-label="Buscar por banco, valor, competência, vencimento ou status">
    </div>

    <div class="seg invoice-filters" role="group" aria-label="Filtrar faturas por status">
      ${['todas', 'pendentes', 'pagas', 'divergentes'].map(k => `
        <button type="button" data-a="ff" data-k="${k}" class="${S.ff === k ? 'on' : ''}" aria-pressed="${S.ff === k}"><span>${labels[k]}</span><span class="filter-count">${counts[k]}</span></button>
      `).join('')}
    </div>

    <div class="invoice-tools">
      <label class="invoice-select-wrap">
        <span class="sr-only">Filtrar por banco</span>
        <select class="field" data-a="fb" aria-label="Filtrar por banco">
          <option value="">Todos os bancos</option>
          ${banks.map(b => `<option value="${esc(b)}" ${S.fb === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
        </select>
      </label>
      <label class="invoice-select-wrap invoice-sort-wrap">
        <span class="sr-only">Ordenar faturas</span>
        <select class="field" data-a="fo" aria-label="Ordenar faturas">
          <option value="vencimento" ${S.fo === 'vencimento' ? 'selected' : ''}>Vencimento ↑</option>
          <option value="valor" ${S.fo === 'valor' ? 'selected' : ''}>Maior valor</option>
          <option value="instituicao" ${S.fo === 'instituicao' ? 'selected' : ''}>Instituição</option>
        </select>
      </label>
    </div>

    <div class="invoice-results" aria-live="polite">
      <span>${rows.length} ${rows.length === 1 ? 'resultado' : 'resultados'}</span>
      ${attention.length ? `<span class="invoice-attention-count"><i class="dot" aria-hidden="true"></i>${attention.length} ${attention.length === 1 ? 'exige' : 'exigem'} atenção</span>` : ''}
    </div>

    ${rows.length ? `
      ${attention.length ? `<section class="invoice-section" aria-labelledby="invoice-attention-heading"><h2 id="invoice-attention-heading" class="invoice-section-heading">${ICO.warn}<span>Exigem atenção · ${attention.length}</span></h2><div class="invoice-list">${attention.map(invoiceRow).join('')}</div></section>` : ''}
      ${others.length ? `<section class="invoice-section" aria-labelledby="invoice-other-heading"><h2 id="invoice-other-heading" class="invoice-section-heading">${attention.length ? 'Demais faturas' : 'Faturas'} · ${others.length}</h2><div class="invoice-list">${others.map(invoiceRow).join('')}</div></section>` : ''}`
      : emptyState()}`;
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
      <div class="title-row centered-text item-heading">
        <div class="banco-badge bank-avatar-sm ${bm.cls}">${bm.sigla}</div>
        <span class="bold">${esc(f.banco)}</span>
        <span class="mut sm">· ${esc(mesLabel(f.mes_referencia))}</span>
      </div>
      <div class="money-xl">${R(f.valor_total)}</div>
      <div class="sm mut caption-gap">
        Vencimento: <b class="bold">${esc(dataCurta(f.data_vencimento) || '—')}</b>
      </div>
      <div class="item-meta centered-meta">
        <span class="pill ${conf.c}"><i class="dot"></i>${conf.t}</span>
        <span class="pill ${pag.c}"><i class="dot"></i>${pag.t}</span>
      </div>
      ${diverge(soma, f.valor_total)
        ? `<div class="pill warn inline-pill">Lançamentos somam ${R(soma)} (diferença ${R(f.valor_total - soma)})</div>`
        : `<div class="pill ok inline-pill">${ICO.check} Itens conferem com o total da fatura</div>`}
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
        <span class="chev danger-chevron">${ICO.chev}</span>
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
