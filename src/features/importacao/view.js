// ==========================================================================
// Rateio de Faturas — Telas de Importação de Fatura (Etapas 1 a 5)
// ==========================================================================
import { S } from '../../core/state.js';
import { esc, R, mesLabel, dataCurta, diverge, f2, parcInfo } from '../../core/format.js';
import { $, overlay, top, backBtn, steps, ICO, empty } from '../../core/ui.js';
import { bancoMeta } from '../../core/banco.js';
import { q } from '../../core/db.js';
import { oauthService } from '../../integrations/oauth/service.js';
import { ADMIN_NOT_CONFIGURED_MSG } from '../../integrations/oauth/config.js';
import { plain, parseFat } from './parse.js';
import { casar, norm } from '../rateio.js';
import { genUUID } from '../../core/pix.js';
import { go } from '../../main.js';

// ==========================================================================
// Telas de Importação de Fatura (Etapas 1 a 5)
// ==========================================================================
// Lista de mensagens normalizada pelo oauth-service (formato único p/ Gmail e Outlook).
const gl = () => S.msgs.map((m, i) => {
  const jaImportada = oauthService.isImported(m.key);
  return `
  <div class="cell pressable msg-row" data-a="gpick" data-i="${i}" role="button" tabindex="0">
    <div class="grow">
      <div class="bold ellipsis">${esc(m.subject)}</div>
      <div class="sm mut ellipsis">${esc(m.from)}</div>
    </div>
    ${jaImportada ? '<span class="pill badge-gap">Importada</span>' : ''}
    ${m.hasAttachments ? '<span class="pill accent badge-gap">anexo</span>' : ''}
    <span class="chev">${ICO.chev}</span>
  </div>
`}).join('');

// Chips de busca rápida para e-mail
const SEARCH_CHIPS = ['fatura', 'boleto', 'fechamento', 'cartão', 'nubank', 'mercado pago'];
const searchChips = (q) => `
  <div class="search-chips">
    ${SEARCH_CHIPS.map(c => `<button type="button" class="chip ${q === c ? 'active' : ''}" data-a="setchip" data-k="${esc(c)}">${esc(c)}</button>`).join('')}
  </div>`;

// Banner de conta conectada
const accountBanner = (provider, status) => {
  const icon = provider === 'google' ? `<span class="brand-icon gmail">${ICO.mail}</span>` : `<span class="brand-icon outlook">${ICO.mail}</span>`;
  const label = provider === 'google' ? 'Gmail' : 'Outlook';
  const emailText = status.email ? `<span class="sm mut ellipsis account-email">${esc(status.email)}</span>` : '';
  const statusBadge = status.status === 'expirado'
    ? `<span class="pill warn">Expirado</span>`
    : `<span class="pill ok">Conectado</span>`;
  return `
    <div class="account-banner">
      <div class="account-layout-start">
        ${icon}
        <div>
          <div class="bold">${label}</div>
          ${emailText}
        </div>
      </div>
      <div class="account-layout-start">
        ${statusBadge}
        <button type="button" class="pill bad" data-a="disconn" data-prov="${provider}">Desconectar</button>
      </div>
    </div>`;
};

function importarView() {
  overlay(1);
  const imp = S.imp ||= { step: 1 };
  const head = top('Importar fatura', backBtn('impback', 'Voltar'));

  // Etapa 2: Erro durante leitura
  if (imp.error && imp.step === 2) {
    return head + steps(2) + `
      <div class="empty">
        <div class="ico error-icon">${ICO.warn}</div>
        <h2>Falha na leitura</h2>
        <p>${esc(imp.error)}</p>
        <div class="actions recovery-actions">
          <button type="button" class="btn primary" data-a="impback">Tentar de novo</button>
        </div>
      </div>`;
  }

  // Etapa 1: Escolha da Origem (Screen 3 Mockup)
  if (imp.step === 1 && !imp.origin) {
    const gStatus = oauthService.getStatus('google');
    const mStatus = oauthService.getStatus('microsoft');
    const statusBadgeG = gStatus.status === 'conectado' ? `<span class="pill ok badge-auto">Conectado</span>` :
      gStatus.status === 'expirado' ? `<span class="pill warn badge-auto">Expirado</span>` : '';
    const statusBadgeM = mStatus.status === 'conectado' ? `<span class="pill ok badge-auto">Conectado</span>` :
      mStatus.status === 'expirado' ? `<span class="pill warn badge-auto">Expirado</span>` : '';
    return head + steps(1) + `
      <p class="footnote caption-gap">Escolha como deseja importar sua fatura.</p>
      <div class="origin">
        <button type="button" data-a="origem" data-k="gmail">
          <span class="ico gmail">${ICO.mail}</span>
          <span>
            <b>Gmail</b>
            <span>${gStatus.email ? esc(gStatus.email) : 'Importe do seu e-mail do Gmail'}</span>
          </span>
          ${statusBadgeG}
        </button>
        <button type="button" data-a="origem" data-k="outlook">
          <span class="ico outlook">${ICO.mail}</span>
          <span>
            <b>Outlook</b>
            <span>${mStatus.email ? esc(mStatus.email) : 'Importe do seu e-mail do Outlook'}</span>
          </span>
          ${statusBadgeM}
        </button>
        <button type="button" data-a="origem" data-k="arquivo">
          <span class="ico file">${ICO.file}</span>
          <span>
            <b>Arquivo PDF ou HTML</b>
            <span>Selecione um arquivo do seu iPhone</span>
          </span>
        </button>
        <button type="button" data-a="origem" data-k="texto">
          <span class="ico clip">${ICO.clip}</span>
          <span>
            <b>Texto copiado</b>
            <span>Cole o texto da fatura aqui</span>
          </span>
        </button>
      </div>
      <p class="footnote summary-description">O processamento é local neste aparelho. Nenhuma informação é enviada para servidores externos.</p>`;
  }

  // Origem Texto copiado
  if (imp.origin === 'texto' && imp.step === 1) {
    return head + steps(1) + `
      <p class="footnote">Cole o texto ou o código HTML da fatura.</p>
      <div class="search-textarea-wrap">
        <textarea id="tx" class="field form-area" placeholder="Cole o conteúdo aqui..."></textarea>
      </div>
      <div class="actions">
        <button type="button" class="btn primary" data-a="parse">Analisar texto</button>
      </div>`;
  }

  // Origem Gmail ou Outlook
  if ((imp.origin === 'gmail' || imp.origin === 'outlook') && imp.step === 1) {
    const provider = imp.origin === 'gmail' ? 'google' : 'microsoft';
    const status = oauthService.getStatus(provider);
    const nome = imp.origin === 'gmail' ? 'Gmail' : 'Outlook';
    const isConnected = status.status === 'conectado' || status.status === 'expirado';
    if (!isConnected) {
      const configured = imp.origin === 'gmail' ? oauthService.isGoogleConfigured() : oauthService.isMicrosoftConfigured();
      if (!configured) {
        return head + steps(1) + `
          <div class="empty">
            <div class="ico">${ICO.mail}</div>
            <h2>Indisponível no momento</h2>
            <p>${esc(ADMIN_NOT_CONFIGURED_MSG)}</p>
          </div>`;
      }
      return head + steps(1) + `
        <div class="empty">
          <div class="ico">${ICO.mail}</div>
          <h2>Conectar ${nome}</h2>
          <p>${!navigator.onLine ? 'Esta origem requer conexão com a internet.' : 'Toque em Conectar para autorizar a leitura segura das suas mensagens.'}</p>
          <div class="actions recovery-actions">
            <button type="button" class="btn primary" data-a="${imp.origin === 'gmail' ? 'gauth' : 'mauth'}">Conectar ${nome}</button>
          </div>
        </div>`;
    }
    const q = imp.q || 'fatura';
    return head + steps(1) + `
      ${accountBanner(provider, status)}
      <p class="section-label space-before-section">Buscar faturas no ${nome}</p>
      ${searchChips(q)}
      <div class="group">
        <div class="cell">
          <input id="gq" class="field" value="${esc(q)}" placeholder="Termo de busca (ex: fatura)">
        </div>
      </div>
      <div class="actions">
        <button type="button" class="btn primary" data-a="${imp.origin === 'gmail' ? 'gbusca' : 'mbusca'}">Buscar mensagens</button>
      </div>
      <div id="gl" class="group">${gl() || ''}</div>
      ${imp.nextPage ? `<div class="actions"><button type="button" class="btn secondary" data-a="loadmore">Carregar mais</button></div>` : ''}
      <div id="ga"></div>`;
  }

  // Etapa 2: Processamento com Indicador Circular & Checklist (Screen 4 Mockup)
  if (imp.step === 2) {
    return head + steps(2) + `
      <div class="proc">
        <h2 class="large-title item-heading">Processando...</h2>
        <p class="mut sm">Lendo sua fatura. Isso pode levar alguns segundos.</p>
        
        <div class="proc-ring-container">
          <svg class="proc-ring" viewBox="0 0 96 96">
            <circle class="ring-bg" cx="48" cy="48" r="40" />
            <circle class="ring-val" cx="48" cy="48" r="40" />
          </svg>
          <div class="proc-ring-pct">68%</div>
        </div>

        <div class="proc-steps">
          <div class="proc-step-item done">
            <div class="proc-step-icon">${ICO.check}</div>
            <span>Identificando o banco</span>
          </div>
          <div class="proc-step-item done">
            <div class="proc-step-icon">${ICO.check}</div>
            <span>Extraindo dados</span>
          </div>
          <div class="proc-step-item active">
            <div class="proc-step-icon proc-step-active-mark">●</div>
            <span>Lendo lançamentos</span>
          </div>
          <div class="proc-step-item pending">
            <div class="proc-step-icon"></div>
            <span>Conferindo valores</span>
          </div>
        </div>

        <div class="actions actions-top-lg">
          <button type="button" class="btn secondary" data-a="impcancel">Cancelar</button>
        </div>
      </div>`;
  }

  if (imp.step >= 3 && imp.p) return preview(imp);

  return head + empty('Importação', 'Escolha uma origem para continuar.', '');
}

// Etapas 3, 4 e 5: Conferência, Lançamentos e Confirmação
function preview(imp) {
  const p = imp.p, step = imp.step;
  const head = top('Importar fatura', backBtn('impback', 'Voltar'));
  const ok = !diverge(p.soma, p.total) && p.itens.length;
  const bm = bancoMeta(p.banco);

  // Etapa 3 — Conferência dos dados (Screen 5 Mockup)
  if (step === 3) {
    const diff = Math.abs(+p.total - +p.soma);
    return head + steps(3) + `
      <!-- Card do Banco Identificado -->
      <div class="conf-summary-card">
        <div class="conf-bank-header">
          <div class="banco-badge ${bm.cls}">${bm.sigla}</div>
          <div>
            <div class="bold summary-name-lg">${esc(p.banco || 'Banco')}</div>
            <div class="mut sm">${esc(mesLabel(p.mes))}</div>
          </div>
        </div>
        <div class="conf-grid">
          <div class="metric">
            <span class="metric-label">Total da fatura</span>
            <span class="metric-value">${R(p.total)}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Vencimento</span>
            <span class="metric-value">${esc(dataCurta(p.venc) || '—')}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Lançamentos</span>
            <span class="metric-value">${p.itens.length}</span>
          </div>
          <div class="metric">
            <span class="metric-label">Soma dos lançamentos</span>
            <span class="metric-value">${R(p.soma)}</span>
          </div>
        </div>
      </div>

      <!-- Card de Status da Conferência -->
      <div class="conf-status-card ${ok ? 'ok' : 'warn'}">
        <div class="status-ico">${ok ? ICO.check : ICO.warn}</div>
        <div>
          <div class="status-title">${ok ? 'Valores conferem' : 'Divergência nos valores'}</div>
          <div class="status-sub">Diferença: ${R(diff)}</div>
        </div>
      </div>

      <!-- Ajustes Rápidos nos Metadados -->
      <p class="section-label">Ajustar informações</p>
      <div class="group">
        <label class="cell">
          <span class="field-label field-label-wide">Banco</span>
          <input id="bn" class="field bold" list="bl" value="${esc(p.banco)}" placeholder="Nome do banco">
        </label>
        <label class="cell">
          <span class="field-label field-label-wide">Total</span>
          <input id="pt" class="field money bold" inputmode="decimal" value="${esc(p.total)}">
        </label>
        <label class="cell">
          <span class="field-label field-label-wide">Vencimento</span>
          <input id="pd" class="field" type="date" value="${esc(p.venc)}">
        </label>
        <label class="cell">
          <span class="field-label field-label-wide">Mês</span>
          <input id="pm" class="field" type="month" value="${esc(p.mes)}">
        </label>
      </div>
      <datalist id="bl">
        ${(p.bancos || []).map(b => `<option value="${esc(b.nome)}">`).join('')}
      </datalist>

      ${p.recorrentesSugeridos && p.recorrentesSugeridos.length > 0 ? `
        <!-- Recorrentes do mês anterior não encontrados na importação -->
        <p class="section-label space-before-section">Assinaturas do mês anterior não importadas</p>
        <div class="group">
          ${p.recorrentesSugeridos.map((r, idx) => `
            <div class="cell">
              <div class="grow">
                <div class="item-main">
                  <span class="desc">${esc(r.descricao)}</span>
                  <span class="money">${R(r.valor)}</span>
                </div>
                <div class="item-meta sm mut">
                  <span class="pill accent">${ICO.star} Recorrente do mês anterior</span>
                </div>
              </div>
              <button type="button" class="btn secondary sm list-action" data-a="addrec" data-idx="${idx}">
                ${ICO.plus} Adicionar
              </button>
            </div>
          `).join('')}
        </div>
        <p class="footnote hint-note">Toque em "Adicionar" para incluir o lançamento com o mesmo rateio do mês anterior.</p>
      ` : ''}

      <div class="actions">
        <button type="button" class="btn primary" data-a="impstep" data-n="4">Continuar</button>
      </div>`;
  }

  // Etapa 4 — Revisão dos lançamentos (Screen 6 Mockup)
  if (step === 4) {
    return head + steps(4) + `
      <div class="content-heading">
        <h2 class="large-title compact-title">Lançamentos da fatura</h2>
        <p class="mut sm">${p.itens.length} lançamentos · ${R(p.total)}</p>
      </div>
      <div class="group">
        ${p.itens.map((i, k) => {
          const parc = parcInfo(i.s);
          const m = p.m && p.m[k];
          return `
            <div class="cell pressable" data-a="edititem" data-k="${k}" role="button" tabindex="0">
              <span class="state-icon ok">${ICO.check}</span>
              <div class="grow">
                <div class="item-main">
                  <span class="desc">${esc(i.s)}</span>
                  <span class="money">${R(i.v)}</span>
                </div>
                <div class="item-meta sm mut">
                  ${i.d ? esc(dataCurta(i.d)) : ''}
                  ${parc ? ` · parcela ${esc(parc)}` : ''}
                </div>
                ${m ? `<div class="item-meta"><span class="pill accent">Rateio reutilizado · ${esc(m.info)}</span></div>` : ''}
              </div>
              <span class="chev">${ICO.chev}</span>
            </div>`;
        }).join('')}
      </div>
      <div class="actions">
        <button type="button" class="btn primary" data-a="impstep" data-n="5">Continuar</button>
      </div>`;
  }

  // Etapa 5 — Confirmação Final
  return head + steps(5) + `
    <div class="hero">
      <div class="banco-badge ${bm.cls} summary-badge">${bm.sigla}</div>
      <div class="bold summary-name">${esc(p.banco || 'Banco')}</div>
      <div class="mut sm summary-subtitle">${esc(mesLabel(p.mes))}</div>
      <div class="money-xl">${R(p.total)}</div>
      <p class="sm mut parcel-bank">${p.itens.length} lançamentos · venc. ${esc(dataCurta(p.venc) || '—')}</p>
      <div class="item-meta centered-meta">
        <span class="pill ${ok ? 'ok' : 'warn'}"><i class="dot"></i>${ok ? 'Valores conferidos' : 'Divergência detectada'}</span>
      </div>
    </div>

    <div class="group">
      <label class="cell">
        <input type="checkbox" id="auto" ${p.auto === false ? '' : 'checked'} class="item-check">
        <span class="grow">
          <span class="bold">Aplicar rateios automáticos</span><br>
          <span class="sm mut">Reaproveita divisões de parcelas e despesas recorrentes do mês anterior</span>
        </span>
      </label>
    </div>

    <div class="actions">
      <button type="button" class="btn primary" data-a="savefat">Salvar fatura</button>
    </div>
    <input id="bn" type="hidden" value="${esc(p.banco)}">
    <input id="pt" type="hidden" value="${esc(p.total)}">
    <input id="pd" type="hidden" value="${esc(p.venc)}">
    <input id="pm" type="hidden" value="${esc(p.mes)}">
    <div id="pv" hidden>${p.itens.map(i => `<div class="it"><input type="date" value="${esc(i.d || '')}"><input value="${esc(i.s)}"><input value="${esc(i.v)}"></div>`).join('')}</div>`;
}

async function show(t) {
  if (S.imp) S.imp.status = 'Interpretando lançamentos…';
  t = plain(t);
  const p = parseFat(t);
  const bs = (await q('SELECT nome FROM bancos')).rows;
  p.bancos = bs;
  p.auto = true;
  if (S.imp?.origin === 'texto') {
    const tx = $('#tx');
    if (tx) tx.value = t;
  }
  const casarResult = await casar(p.banco, p.mes, p.itens.map(i => ({ s: i.s, v: +i.v })));
  // Merge casar results (grupo_parcela_id, recorrente) into preview items
  p.itens.forEach((item, i) => {
    if (casarResult[i]) {
      item.grupo_parcela_id = casarResult[i].grupo_parcela_id || genUUID();
      item.recorrente = casarResult[i].recorrente || false;
    } else if (item.n_parcelas && !item.grupo_parcela_id) {
      // Nova compra parcelada: gera novo grupo
      item.grupo_parcela_id = genUUID();
    }
  });

  // Detecta recorrentes do mês anterior que não estão na importação atual
  // Busca lançamentos recorrentes do mesmo banco no mês anterior
  const mesAnterior = (() => {
    const [ano, mes] = p.mes.split('-').map(Number);
    let m = mes - 1, a = ano;
    if (m === 0) { m = 12; a--; }
    return `${a}-${String(m).padStart(2, '0')}`;
  })();

  const recorrentesAnterior = (await q(`
    SELECT l.*, r.pessoa_id, r.valor_fracao, r.porcentagem, r.pago
    FROM lancamentos l
    JOIN faturas f ON f.id = l.fatura_id
    JOIN rateio_lancamento r ON r.lancamento_id = l.id
    WHERE f.banco_id = (SELECT id FROM bancos WHERE nome = ?)
    AND f.mes_referencia = ?
    AND COALESCE(l.recorrente, 0) = 1
  `, [p.banco, mesAnterior])).rows;

  // Filtra os que NÃO têm correspondência na importação atual
  const descricoesImportadas = new Set(p.itens.map(i => norm(i.s)));
  const recorrentesFaltando = recorrentesAnterior
    .filter(r => !descricoesImportadas.has(norm(r.descricao)))
    .map(r => ({
      descricao: r.descricao,
      valor: r.valor,
      rateio: { pessoa_id: r.pessoa_id, valor_fracao: r.valor_fracao, porcentagem: r.porcentagem, pago: r.pago }
    }));

  if (recorrentesFaltando.length > 0) {
    p.recorrentesSugeridos = recorrentesFaltando;
  }

  p.m = casarResult;
  S.imp = {
    ...S.imp,
    step: p.itens.length ? 3 : 2,
    p,
    error: p.itens.length ? null : 'Nenhum lançamento foi reconhecido. Verifique o conteúdo ou utilize outro arquivo.'
  };
  await go();
}

function syncPreviewFields() {
  const p = S.imp?.p;
  if (!p) return;
  const bn = $('#bn'), pt = $('#pt'), pd = $('#pd'), pm = $('#pm');
  if (bn) p.banco = bn.value.trim();
  if (pt && pt.value) p.total = f2(pt.value).toFixed(2);
  if (pd) p.venc = pd.value;
  if (pm) p.mes = pm.value;
  const auto = $('#auto');
  if (auto) p.auto = auto.checked;
}

export { gl, SEARCH_CHIPS, searchChips, accountBanner, importarView, preview, show, syncPreviewFields };
