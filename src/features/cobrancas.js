// ============================================================================
// Rateio de Faturas — Central de cobranças mensais
// ============================================================================
import { S } from '../core/state.js';
import { esc, R } from '../core/format.js';
import { overlay, top, monthSel, empty, ICO } from '../core/ui.js';
import { q, meses } from '../core/db.js';

async function cobrancas() {
  overlay(0);
  const ms = await meses();
  const pessoas = (await q(`
    SELECT p.id, p.nome, p.chave_pix,
      COALESCE(SUM(CASE WHEN f.id IS NOT NULL AND r.pago = 0 THEN r.valor_fracao ELSE 0 END), 0) pendente,
      COALESCE(SUM(CASE WHEN f.id IS NOT NULL THEN r.valor_fracao ELSE 0 END), 0) total,
      SUM(CASE WHEN f.id IS NOT NULL AND r.pago = 0 THEN 1 ELSE 0 END) lancamentos_abertos
    FROM pessoas p
    LEFT JOIN rateio_lancamento r ON r.pessoa_id = p.id
    LEFT JOIN lancamentos l ON l.id = r.lancamento_id
    LEFT JOIN faturas f ON f.id = l.fatura_id AND f.mes_referencia = ?
    GROUP BY p.id
    HAVING pendente > 0.005
    ORDER BY pendente DESC, p.nome COLLATE NOCASE
  `, [S.mes])).rows;

  const totalPendente = pessoas.reduce((s, p) => s + p.pendente, 0);

  return `
    ${top('Cobranças')}

    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 16px 12px">
      ${monthSel(ms, 'mesc')}
      <span class="pill ${pessoas.length ? 'warn' : 'ok'}"><i class="dot"></i>${pessoas.length} ${pessoas.length === 1 ? 'pessoa' : 'pessoas'}</span>
    </div>

    <div class="hero charge-hero">
      <div class="hero-label">Pendente de recebimento</div>
      <div class="money-xl">${R(totalPendente)}</div>
      <div class="sm mut" style="margin-top:6px">${pessoas.length ? 'Gere uma cobrança individual com os lançamentos separados por banco.' : 'Nenhuma cobrança pendente neste mês.'}</div>
    </div>

    <p class="section-label">Cobranças em aberto</p>
    ${pessoas.length ? `
      <div class="group">
        ${pessoas.map(p => {
          const iniciais = p.nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
          return `
            <div class="cell charge-cell">
              <button type="button" class="charge-person" data-a="openp" data-id="${p.id}" aria-label="Ver detalhes de ${esc(p.nome)}">
                <span class="avatar">${iniciais}</span>
                <span class="grow">
                  <span class="item-main"><b>${esc(p.nome)}</b><span class="money">${R(p.pendente)}</span></span>
                  <span class="sm mut">${p.lancamentos_abertos || 0} ${p.lancamentos_abertos === 1 ? 'lançamento em aberto' : 'lançamentos em aberto'}</span>
                </span>
              </button>
              <button type="button" class="pill accent charge-action" data-a="cobra" data-pid="${p.id}">${ICO.share} Cobrar</button>
            </div>`;
        }).join('')}
      </div>` : empty(
        'Tudo em dia',
        'Não há valores pendentes de recebimento no mês selecionado.'
      )}`;
}

export { cobrancas };
