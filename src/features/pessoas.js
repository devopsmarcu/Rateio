// ==========================================================================
// Rateio de Faturas — Tela 10: Pessoas
// ==========================================================================
import { S } from '../core/state.js';
import { esc, R, mesLabel, dataCurta } from '../core/format.js';
import { overlay, empty, top, backBtn, monthSel, openSheet, ICO } from '../core/ui.js';
import { q, meses } from '../core/db.js';
import { pixEmv } from '../core/pix.js';

async function pessoas() {
  if (S.pessoa) return pessoaDetalhe(S.pessoa);
  overlay(0);
  const r = (await q('SELECT * FROM pessoas ORDER BY nome')).rows;
  const rr = (await q(`
    SELECT r.pago, r.valor_fracao v, p.id pid
    FROM rateio_lancamento r
    JOIN pessoas p ON p.id = r.pessoa_id
    JOIN lancamentos l ON l.id = r.lancamento_id
    JOIN faturas f ON f.id = l.fatura_id
    WHERE f.mes_referencia = ?
  `, [S.mes])).rows;

  const tot = {}, pend = {};
  rr.forEach(x => {
    tot[x.pid] = (tot[x.pid] || 0) + x.v;
    if (!x.pago) pend[x.pid] = (pend[x.pid] || 0) + x.v;
  });

  return `
    <div class="page-header">
      <div class="brand-greeting">
        <span class="brand-sub">Gerenciar</span>
        <h1 class="large-title">Pessoas</h1>
      </div>
      <button type="button" class="month-pill" data-a="addpui" aria-label="Adicionar pessoa">
        ${ICO.plus} <span>Adicionar</span>
      </button>
    </div>

    ${r.length ? `
      <div class="group">
        ${r.map(p => {
          const o = pend[p.id] || 0, has = tot[p.id] > 0;
          const initials = p.nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
          return `
            <div class="cell pressable" data-a="openp" data-id="${p.id}" role="button" tabindex="0">
              <div class="avatar">${initials}</div>
              <div class="grow">
                <div class="item-main">
                  <span class="bold">${esc(p.nome)}</span>
                  <span class="money">${has ? R(o) : ''}</span>
                </div>
                <div class="sm mut ellipsis">${esc(p.chave_pix || 'Sem chave Pix')}</div>
                <div class="item-meta">
                  ${!has
                    ? `<span class="pill">Sem rateio no mês</span>`
                    : o <= 0.005
                      ? `<span class="pill ok"><i class="dot"></i>Pago no mês</span>`
                      : `<span class="pill warn"><i class="dot"></i>Pendente</span>`}
                </div>
              </div>
              <span class="chev">${ICO.chev}</span>
            </div>`;
        }).join('')}
      </div>` : empty(
        'Nenhuma pessoa',
        'Cadastre os participantes para dividir despesas.',
        '<div class="actions" style="margin:0"><button type="button" class="btn primary" data-a="addpui">' + ICO.plus + ' Adicionar pessoa</button></div>'
      )}`;
}

// Resumo Individual da Pessoa (Screen 10 Mockup)
async function pessoaDetalhe(id) {
  overlay(1);
  const p = (await q('SELECT * FROM pessoas WHERE id = ?', [id])).rows[0];
  if (!p) {
    S.pessoa = null;
    return pessoas();
  }

  const ms = await meses();
  const rows = (await q(`
    SELECT r.id, r.pago, r.valor_fracao v, l.descricao d, b.nome banco,
      f.mes_referencia, f.data_vencimento
    FROM rateio_lancamento r
    JOIN lancamentos l ON l.id = r.lancamento_id
    JOIN faturas f ON f.id = l.fatura_id
    JOIN bancos b ON b.id = f.banco_id
    WHERE r.pessoa_id = ? AND f.mes_referencia = ?
    ORDER BY l.data_transacao DESC, l.id DESC
  `, [id, S.mes])).rows;

  S.g[id] = rows.map(x => ({ ...x, nome: p.nome, chave_pix: p.chave_pix, pid: id }));
  const t = rows.reduce((s, x) => s + x.v, 0);
  const o = rows.filter(x => !x.pago).reduce((s, x) => s + x.v, 0);
  const pg = t - o;
  const initials = p.nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return `
    ${top(
      'Resumo por Pessoa',
      backBtn('backp', 'Pessoas'),
      `<button type="button" class="link right" data-a="editp" data-id="${id}">Editar</button>`
    )}

    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 16px 12px">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="avatar" style="width:32px;height:32px;font-size:13px">${initials}</div>
        <span class="bold" style="font-size:18px">${esc(p.nome)}</span>
      </div>
      ${monthSel(ms, 'mesp')}
    </div>

    <!-- Cards de Resumo Individual -->
    <div class="hero">
      <div class="sub-metrics" style="border:0;padding:0;margin:0">
        <div>
          <div class="k">Total devido</div>
          <div class="money">${R(t)}</div>
        </div>
        <div>
          <div class="k">Total pago</div>
          <div class="money ok">${R(pg)}</div>
        </div>
      </div>
      <div style="margin-top:16px;padding-top:14px;border-top:0.5px solid var(--separator)">
        <div class="hero-label">Saldo pendente</div>
        <div class="money-xl ${o > 0.005 ? 'bad' : 'ok'}">${R(o)}</div>
      </div>
    </div>

    <!-- Chave Pix -->
    ${p.chave_pix ? `
      <div class="group">
        <div class="cell pressable" data-a="copypix" data-id="${id}">
          <span class="grow">
            <span class="field-label">Chave Pix</span>
            <span class="bold">${esc(p.chave_pix)}</span>
          </span>
          <span class="pill accent">${ICO.copy} Copiar</span>
        </div>
      </div>` : ''}

    <!-- Lista de Lançamentos da Pessoa -->
    <p class="section-label">Lançamentos no mês · ${rows.length}</p>
    ${rows.length ? `
      <div class="group">
        ${rows.map(x => `
          <div class="cell">
            <label class="grow" style="display:flex;align-items:flex-start;gap:12px;cursor:pointer">
              <input type="checkbox" data-a="rpago" data-id="${x.id}" ${x.pago ? 'checked' : ''} style="width:22px;height:22px;margin-top:2px;accent-color:var(--accent)">
              <span>
                <span class="desc">${esc(x.d)}</span>
                <div class="sm mut">${esc(x.banco)}</div>
              </span>
            </label>
            <div style="text-align:right">
              <span class="money ${x.pago ? 'ok' : ''}">${R(x.v)}</span>
              <div class="xs ${x.pago ? 'ok' : 'warn'}">${x.pago ? 'Pago' : 'Pendente'}</div>
            </div>
          </div>
        `).join('')}
      </div>` : `
      <div class="group">
        <div class="cell mut sm">Sem lançamentos atribuídos neste mês.</div>
      </div>`}

    <!-- Ações de Cobrança -->
    <div class="actions">
      <button type="button" class="btn primary" data-a="cobra" data-pid="${id}" ${o < 0.005 ? 'disabled' : ''}>
        ${ICO.share} Copiar cobrança
      </button>
      ${p.chave_pix ? `
        <button type="button" class="btn secondary" data-a="copypix" data-id="${id}">
          ${ICO.copy} Copiar chave Pix
        </button>` : ''}
      <button type="button" class="btn danger" data-a="delp" data-id="${id}">
        Excluir pessoa
      </button>
    </div>`;
}

// Geração do Texto de Cobrança Formatado (Screen 11 Mockup)
function cobrancaTexto(a, mes) {
  const o = a.filter(x => !x.pago);
  const t = o.reduce((s, x) => s + x.v, 0);
  const porBanco = new Map();

  o.forEach(x => {
    const banco = x.banco || 'Banco não informado';
    if (!porBanco.has(banco)) porBanco.set(banco, []);
    porBanco.get(banco).push(x);
  });

  let msg = `Olá ${a[0].nome}! Segue sua cobrança do mês:\n\n`;
  msg += `• Mês: ${mesLabel(mes)}\n`;
  if (a[0].chave_pix) {
    msg += `• Pagamento via Pix\n`;
    msg += `• Chave Pix: ${a[0].chave_pix}\n`;
  }
  msg += '\nFaturas pendentes por banco:\n';

  porBanco.forEach((faturas, banco) => {
    const totalBanco = faturas.reduce((s, x) => s + x.v, 0);
    const vencimentos = [...new Set(faturas.map(x => x.data_vencimento).filter(Boolean))];
    const vencimento = vencimentos.length
      ? vencimentos.map(dataCurta).join(' · ')
      : 'Não informado';

    msg += `\n${banco}\n`;
    msg += `Vencimento: ${vencimento}\n`;
    msg += faturas.map(x => `• ${x.d}: ${R(x.v)}`).join('\n');
    msg += `\nSubtotal ${banco}: ${R(totalBanco)}\n`;
  });

  msg += `\nTotal geral: ${R(t)}\n\n⚠️ Pagamento pendente.`;
  return msg;
}

// Modal de Cobrança via Pix (Screen 11 Mockup)
function modalCobranca(a, mes) {
  const txt = cobrancaTexto(a, mes);
  const chave = a[0]?.chave_pix;
  const total = a.filter(x => !x.pago).reduce((s, x) => s + x.v, 0);
  const pixNome = localStorage.pixNome || a[0]?.nome || 'Pagador';
  const pixCidade = localStorage.pixCidade || 'Brasil';
  // Gera txid baseado na pessoa + mês (máx 25 chars)
  const txid = (a[0]?.pid ? `p${a[0].pid}` : 'c') + mes.replace('-', '');

  let emv = '';
  if (chave) {
    emv = pixEmv({ chave, nome: pixNome, cidade: pixCidade, valor: total, txid });
  }

  openSheet(`
    <h2>Cobrança via Pix</h2>
    <p class="footnote" style="text-align:center;margin-top:0">Pronto para enviar por WhatsApp, iMessage ou outro app.</p>

    <div class="pix-preview-card">${esc(txt)}</div>

    ${chave ? `
      <div style="margin-top:16px;padding:12px;background:var(--surface);border-radius:var(--radius-lg)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span class="bold">Código Pix (copia e cola)</span>
          <span class="pill accent">${ICO.copy} BR Code EMV</span>
        </div>
        <div style="font-family:monospace;font-size:12px;word-break:break-all;background:var(--bg);padding:8px;border-radius:6px;min-height:40px" id="pixEmvCode">${esc(emv)}</div>
        <div class="actions" style="margin-top:8px">
          <button type="button" class="btn secondary" data-a="copyemv" data-txt="${encodeURIComponent(emv)}">
            ${ICO.copy} Copiar código Pix
          </button>
        </div>
      </div>
    ` : ''}

    <div class="actions">
      <button type="button" class="btn primary" data-a="sharetext" data-txt="${encodeURIComponent(txt)}">
        ${ICO.share} Compartilhar
      </button>
      <button type="button" class="btn secondary" data-a="copytext" data-txt="${encodeURIComponent(txt)}">
        ${ICO.copy} Copiar texto
      </button>
      <button type="button" class="btn ghost" data-a="closesheet">Fechar</button>
    </div>`);
}

export { pessoas, pessoaDetalhe, modalCobranca };
