// ==========================================================================
// Rateio de Faturas — Apple iOS Native PWA Experience
// Architecture: Pure Vanilla JS + SQLite WASM + OPFS + Service Worker
// ==========================================================================

import { oauthService } from './oauth-service.js';
import { ADMIN_NOT_CONFIGURED_MSG } from './oauth-config.js';

const $ = s => document.querySelector(s);

const $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const R = v => (+v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const f2 = x => {
  x = String(x).trim();
  return parseFloat(x.includes(',') ? x.replace(/\./g, '').replace(',', '.') : x);
};
const num = s => f2(String(s).replace(/[R$\s]/g, ''));
const APP_VER = '1.2.0';

// Helpers de data local (não UTC) para evitar erro de dia/mês após 21h no Brasil (UTC-3)
const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const mesAtual = () => hojeISO().slice(0, 7);

// Estado global da aplicação
const S = {
  tab: 'inicio',
  fat: null,
  pessoa: null,
  mes: mesAtual(),
  msgs: [],
  g: {},
  l: null,
  imp: null,
  ff: 'todas',
  editP: null,
  rmode: 'v',
  rt: [],
  ps: [],
  fatTab: 'lancamentos' // 'lancamentos' | 'resumo'
};

// Formatação e datas
const mesLabel = m => {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  const str = new Date(+y, +mo - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const mesCurto = m => {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  const str = new Date(+y, +mo - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const dataCurta = d => {
  if (!d) return '';
  const x = new Date(d + 'T12:00:00');
  return isNaN(x) ? d : x.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};
const vencida = (f, hoje = hojeISO()) => !f.pago && f.data_vencimento && f.data_vencimento < hoje;
const proxVenc = (f, hoje = hojeISO()) => {
  if (f.pago || !f.data_vencimento || f.data_vencimento < hoje) return false;
  const lim = new Date();
  lim.setDate(lim.getDate() + 7);
  // Usar data local para comparação (não UTC)
  const limISO = `${lim.getFullYear()}-${String(lim.getMonth() + 1).padStart(2, '0')}-${String(lim.getDate()).padStart(2, '0')}`;
  return f.data_vencimento <= limISO;
};
const diverge = (soma, tot) => Math.abs(+soma - +tot) > 0.05;
const parcInfo = d => {
  const m = d.match(/parcela\s+(\d+)\s*(?:\/|de)\s*(\d+)/i) || d.match(/\b(\d{2})\/(\d{2})\s*$/) || d.match(/PARC\s*(\d{2})\/(\d{2})/i);
  return m ? `${+m[1]}/${+m[2]}` : '';
};

// Helper visual de marcas de bancos
function bancoMeta(nome) {
  const n = String(nome || '').toLowerCase();
  if (n.includes('nubank') || n.includes('nu pag')) return { cls: 'banco-nubank', sigla: 'Nu', nome: 'Nubank' };
  if (n.includes('mercado pago') || n.includes('mp')) return { cls: 'banco-mercadopago', sigla: 'MP', nome: 'Mercado Pago' };
  if (n.includes('santander')) return { cls: 'banco-santander', sigla: 'SAN', nome: 'Santander' };
  if (n.includes('picpay')) return { cls: 'banco-picpay', sigla: 'PP', nome: 'PicPay' };
  const words = (nome || 'Cartão').trim().split(/\s+/);
  const sigla = (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
  return { cls: 'banco-default', sigla: sigla || 'CC', nome: nome || 'Cartão' };
}

// Informação contextual de vencimento
function vencimentoInfo(f, hoje = hojeISO()) {
  if (!f.data_vencimento) return { text: 'Sem vencimento', status: 'normal' };
  if (f.pago) return { text: `Venc. ${dataCurta(f.data_vencimento)}`, status: 'pago' };
  const d1 = new Date(hoje + 'T12:00:00'), d2 = new Date(f.data_vencimento + 'T12:00:00');
  const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  if (diff < 0) {
    const d = Math.abs(diff);
    return { text: `Venceu há ${d} ${d === 1 ? 'dia' : 'dias'}`, status: 'vencida' };
  }
  if (diff === 0) return { text: 'Vence hoje', status: 'hoje' };
  if (diff <= 7) return { text: `Vence em ${diff} ${diff === 1 ? 'dia' : 'dias'}`, status: 'proximo' };
  return { text: `Vence em ${diff} dias`, status: 'normal' };
}

// Ícones SVG no estilo SF Symbols do iOS
const svg = (p, w = 22, h = 22, sw = 1.9) => `<svg viewBox="0 0 24 24" width="${w}" height="${h}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICO = {
  chev: svg('<path d="m9 6 6 6-6 6"/>', 14, 14, 2.2),
  chevDown: svg('<path d="m6 9 6 6 6-6"/>', 14, 14, 2.4),
  back: svg('<path d="M15 5 8 12l7 7"/>', 22, 22, 2.2),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 20, 20, 2.2),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>', 20, 20),
  share: svg('<path d="M4 12v7a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-7M12 16V3M8 7l4-4 4 4"/>', 20, 20),
  more: svg('<circle cx="12" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none"/>', 22, 22),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 7 9-7"/>', 22, 22),
  file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>', 22, 22),
  clip: svg('<rect x="8" y="4" width="8" height="4" rx="1"/><rect x="5" y="6" width="14" height="14" rx="2"/><path d="M9 12h6M9 16h4"/>', 22, 22),
  card: svg('<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/><path d="M6.5 15h3.5"/>', 24, 24),
  people: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', 22, 22),
  check: svg('<path d="M20 6 9 17l-5-5"/>', 18, 18, 2.5),
  checkCircle: svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', 22, 22, 2.2),
  warn: svg('<path d="M12 8v5M12 16.5h.01"/><path d="M10.3 4.7 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.7a2 2 0 0 0-3.4 0z"/>', 20, 20),
  trash: svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>', 18, 18),
  star: svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', 18, 18)
};

// Gerenciamento de Tema
const themePref = () => localStorage.theme || 'system';
const themeDark = () => {
  const t = themePref();
  return t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme:dark)').matches);
};

function applyTheme() {
  const dark = themeDark();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = $('meta[name=theme-color]');
  if (m) m.content = dark ? '#000000' : '#F5F5F7';
}
applyTheme();
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => {
  if (themePref() === 'system') applyTheme();
});

// Helpers de Interface
function overlay(on) {
  document.body.classList.toggle('overlay', !!on);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

function closeSheet() {
  const r = $('#sheetroot');
  r.hidden = true;
  $('#sheet').innerHTML = '';
  S.sheetLock = 0;
  S.pwd = null;
}

function openSheet(html, lock) {
  S.sheetLock = !!lock;
  $('#sheet').innerHTML = `<div class="grab" aria-hidden="true"></div>` + html;
  $('#sheetroot').hidden = false;
}

function confirmUI(title, msg, okLabel, destructive) {
  return new Promise(res => {
    S._cnf = res;
    openSheet(`
      <h2>${esc(title)}</h2>
      <p class="footnote" style="margin:0 24px 20px;text-align:center">${esc(msg)}</p>
      <div class="action-list">
        <button type="button" class="${destructive ? 'bad' : 'muted'}" data-a="cnfy">${esc(okLabel || 'Confirmar')}</button>
        <button type="button" data-a="cnfn">Cancelar</button>
      </div>`, 1);
  });
}

const top = (title, left, right) => `
  <header class="topbar">
    ${left || '<span></span>'}
    <div class="nav-title">${esc(title)}</div>
    ${right || '<span></span>'}
  </header>`;

const backBtn = (a = 'back', label = 'Voltar') => `
  <button type="button" class="link" data-a="${a}" aria-label="${esc(label)}">
    ${ICO.back}
  </button>`;

const monthSel = (ms, id = 'mes') => {
  const list = ms.length ? ms : [S.mes];
  if (!list.includes(S.mes)) S.mes = list[0];
  return `
    <label class="month-pill" title="Alterar mês">
      <span>${esc(mesLabel(S.mes))}</span>
      ${ICO.chevDown}
      <select data-a="${id}" aria-label="Mês de referência">
        ${list.map(m => `<option value="${esc(m)}" ${m === S.mes ? 'selected' : ''}>${esc(mesLabel(m))}</option>`).join('')}
      </select>
    </label>`;
};

const empty = (title, desc, action) => `
  <div class="empty">
    <div class="ico">${ICO.card}</div>
    <h2>${esc(title)}</h2>
    <p>${esc(desc)}</p>
    ${action || ''}
  </div>`;

const steps = n => `
  <div class="steps" aria-hidden="true">
    ${[1, 2, 3, 4, 5].map(i => `<i class="${i === n ? 'on' : ''}"></i>`).join('')}
  </div>`;

// ==========================================================================
// Retorno dos fluxos de autorização (Gmail e Outlook)
// ==========================================================================
// O Google é autorizado na página-ponte (oauth.html) e o resultado é recebido
// pelo serviço via BroadcastChannel — nada chega pela URL deste aplicativo.
// A Microsoft usa o redirecionamento do MSAL, cujo retorno é tratado abaixo.
const emsg = e => (e && e.userMessage) || 'Não foi possível concluir a operação. Tente novamente.';

(async () => {
  try {
    const ms = await oauthService.initMicrosoft();
    if (ms?.redirect) {
      S.tab = 'faturas';
      S.imp = { step: 1, origin: 'outlook' };
      setTimeout(() => toast('Outlook conectado com sucesso!'), 400);
    }
  } catch (e) {
    S.bootErr = emsg(e);
  }

  // Descarta resíduos de autorização (code/state/error) deixados na URL.
  const p = new URLSearchParams(location.search);
  if (p.has('code') || p.has('state') || p.has('error')) {
    history.replaceState(null, '', location.pathname);
  }
})();

try {
  await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
} catch (e) {
  console.warn('SW registration:', e);
}

if (!crossOriginIsolated) {
  if (!sessionStorage.coi) {
    sessionStorage.coi = 1;
    location.reload();
    await new Promise(() => {});
  }
  $('#app').textContent = 'Página não isolada (COOP/COEP): OPFS indisponível.';
  throw 0;
}

// ==========================================================================
// Comunicação com o SQLite Worker (OPFS)
// ==========================================================================
const W = new Worker('db-worker.js', { type: 'module' });
const P = new Map();
let seq = 0;

W.onmessage = ({ data: { id, r, err } }) => {
  const p = P.get(id);
  P.delete(id);
  err ? p.rej(Error(err)) : p.res(r);
};

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

function faturaEstado(f) {
  const conf = diverge(f.soma, f.valor_total)
    ? { t: 'Divergente', c: 'warn' }
    : { t: 'Conferida', c: 'ok' };
  const pag = f.pago
    ? { t: 'Paga', c: 'ok' }
    : vencida(f)
      ? { t: 'Vencida', c: 'bad' }
      : { t: 'Pendente', c: 'warn' };
  return { conf, pag };
}

function faturaCell(f) {
  const { conf, pag } = faturaEstado(f);
  const bm = bancoMeta(f.banco);
  const vInfo = vencimentoInfo(f);
  const semRateio = f.sem > 0;

  return `
    <div class="cell pressable" data-a="open" data-id="${f.id}" role="button" tabindex="0">
      <div class="banco-badge ${bm.cls}">${bm.sigla}</div>
      <div class="grow">
        <div class="item-main">
          <span class="desc ellipsis">${esc(f.banco)}</span>
          <span class="money">${R(f.valor_total)}</span>
        </div>
        <div class="item-meta sm mut">
          <span>${esc(mesCurto(f.mes_referencia))}</span>
          <span>· <span class="${vInfo.status === 'vencida' ? 'bad' : vInfo.status === 'proximo' || vInfo.status === 'hoje' ? 'warn' : ''}">${esc(vInfo.text)}</span></span>
        </div>
        <div class="item-meta">
          <span class="pill ${conf.c}"><i class="dot"></i>${conf.t}</span>
          <span class="pill ${pag.c}"><i class="dot"></i>${pag.t}</span>
          ${semRateio ? `<span class="pill warn">Rateio pendente</span>` : ''}
        </div>
      </div>
      <span class="chev">${ICO.chev}</span>
    </div>`;
}

// ==========================================================================
// Tela 1: Início
// ==========================================================================
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
      <div class="hero-label">Total pendente</div>
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

// ==========================================================================
// Tela 2: Faturas
// ==========================================================================
async function faturas() {
  if (S.fat) return detalhe(S.fat);
  overlay(0);
  const ms = await meses();
  let rows = await faturaRows();
  const totMes = rows.filter(f => f.mes_referencia === S.mes).reduce((s, f) => s + f.valor_total, 0);
  rows = rows.filter(f => f.mes_referencia === S.mes);

  if (S.ff === 'pendentes') rows = rows.filter(f => !f.pago);
  else if (S.ff === 'pagas') rows = rows.filter(f => f.pago);
  else if (S.ff === 'vencidas') rows = rows.filter(f => vencida(f));

  const filt = ['todas', 'pendentes', 'pagas', 'vencidas'];
  const labels = { todas: 'Todas', pendentes: 'Pendentes', pagas: 'Pagas', vencidas: 'Vencidas' };

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

    <!-- Lista de Faturas -->
    ${rows.length ? `
      <div class="group">
        ${rows.map(faturaCell).join('')}
      </div>` : empty(
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
    ${jaImportada ? '<span class="pill" style="margin-right:4px">Importada</span>' : ''}
    ${m.hasAttachments ? '<span class="pill accent" style="margin-right:4px">anexo</span>' : ''}
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
  const icon = provider === 'google' ? `<span style="color:#EA4335">${ICO.mail}</span>` : `<span style="color:#0078D4">${ICO.mail}</span>`;
  const label = provider === 'google' ? 'Gmail' : 'Outlook';
  const emailText = status.email ? `<span class="sm mut ellipsis" style="max-width:200px">${esc(status.email)}</span>` : '';
  const statusBadge = status.status === 'expirado'
    ? `<span class="pill warn">Expirado</span>`
    : `<span class="pill ok">Conectado</span>`;
  return `
    <div class="account-banner">
      <div style="display:flex;align-items:center;gap:8px">
        ${icon}
        <div>
          <div class="bold">${label}</div>
          ${emailText}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${statusBadge}
        <button type="button" class="pill" data-a="disconn" data-prov="${provider}" style="color:var(--bad)">Desconectar</button>
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
        <div class="ico" style="background:var(--bad-bg);color:var(--bad)">${ICO.warn}</div>
        <h2>Falha na leitura</h2>
        <p>${esc(imp.error)}</p>
        <div class="actions" style="margin:0">
          <button type="button" class="btn primary" data-a="impback">Tentar de novo</button>
        </div>
      </div>`;
  }

  // Etapa 1: Escolha da Origem (Screen 3 Mockup)
  if (imp.step === 1 && !imp.origin) {
    const gStatus = oauthService.getStatus('google');
    const mStatus = oauthService.getStatus('microsoft');
    const statusBadgeG = gStatus.status === 'conectado' ? `<span class="pill ok" style="margin-left:auto">Conectado</span>` :
      gStatus.status === 'expirado' ? `<span class="pill warn" style="margin-left:auto">Expirado</span>` : '';
    const statusBadgeM = mStatus.status === 'conectado' ? `<span class="pill ok" style="margin-left:auto">Conectado</span>` :
      mStatus.status === 'expirado' ? `<span class="pill warn" style="margin-left:auto">Expirado</span>` : '';
    return head + steps(1) + `
      <p class="footnote" style="margin-top:4px">Escolha como deseja importar sua fatura.</p>
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
      <p class="footnote" style="margin-top:14px">O processamento é local neste aparelho. Nenhuma informação é enviada para servidores externos.</p>`;
  }

  // Origem Texto copiado
  if (imp.origin === 'texto' && imp.step === 1) {
    return head + steps(1) + `
      <p class="footnote">Cole o texto ou o código HTML da fatura.</p>
      <div style="margin:12px 16px">
        <textarea id="tx" class="field" style="background:var(--surface);border-radius:var(--radius-lg);padding:14px;min-height:160px;width:100%" placeholder="Cole o conteúdo aqui..."></textarea>
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
            <div class="ico" style="color:var(--mut)">${ICO.mail}</div>
            <h2>Indisponível no momento</h2>
            <p>${esc(ADMIN_NOT_CONFIGURED_MSG)}</p>
          </div>`;
      }
      return head + steps(1) + `
        <div class="empty">
          <div class="ico">${ICO.mail}</div>
          <h2>Conectar ${nome}</h2>
          <p>${!navigator.onLine ? 'Esta origem requer conexão com a internet.' : 'Toque em Conectar para autorizar a leitura segura das suas mensagens.'}</p>
          <div class="actions" style="margin:0">
            <button type="button" class="btn primary" data-a="${imp.origin === 'gmail' ? 'gauth' : 'mauth'}">Conectar ${nome}</button>
          </div>
        </div>`;
    }
    const q = imp.q || 'fatura';
    return head + steps(1) + `
      ${accountBanner(provider, status)}
      <p class="section-label" style="margin-top:16px">Buscar faturas no ${nome}</p>
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
        <h2 class="large-title" style="margin-bottom:6px">Processando...</h2>
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
            <div class="proc-step-icon" style="font-size:12px;font-weight:700">●</div>
            <span>Lendo lançamentos</span>
          </div>
          <div class="proc-step-item pending">
            <div class="proc-step-icon"></div>
            <span>Conferindo valores</span>
          </div>
        </div>

        <div class="actions" style="margin-top:24px">
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
            <div class="bold" style="font-size:18px">${esc(p.banco || 'Banco')}</div>
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
          <span class="field-label" style="width:7.5rem">Banco</span>
          <input id="bn" class="field bold" list="bl" value="${esc(p.banco)}" placeholder="Nome do banco">
        </label>
        <label class="cell">
          <span class="field-label" style="width:7.5rem">Total</span>
          <input id="pt" class="field money bold" inputmode="decimal" value="${esc(p.total)}">
        </label>
        <label class="cell">
          <span class="field-label" style="width:7.5rem">Vencimento</span>
          <input id="pd" class="field" type="date" value="${esc(p.venc)}">
        </label>
        <label class="cell">
          <span class="field-label" style="width:7.5rem">Mês</span>
          <input id="pm" class="field" type="month" value="${esc(p.mes)}">
        </label>
      </div>
      <datalist id="bl">
        ${(p.bancos || []).map(b => `<option value="${esc(b.nome)}">`).join('')}
      </datalist>

      ${p.recorrentesSugeridos && p.recorrentesSugeridos.length > 0 ? `
        <!-- Recorrentes do mês anterior não encontrados na importação -->
        <p class="section-label" style="margin-top:16px">Assinaturas do mês anterior não importadas</p>
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
              <button type="button" class="btn secondary sm" data-a="addrec" data-idx="${idx}" style="margin-left:8px">
                ${ICO.plus} Adicionar
              </button>
            </div>
          `).join('')}
        </div>
        <p class="footnote" style="margin:8px 16px 0">Toque em "Adicionar" para incluir o lançamento com o mesmo rateio do mês anterior.</p>
      ` : ''}

      <div class="actions">
        <button type="button" class="btn primary" data-a="impstep" data-n="4">Continuar</button>
      </div>`;
  }

  // Etapa 4 — Revisão dos lançamentos (Screen 6 Mockup)
  if (step === 4) {
    return head + steps(4) + `
      <div style="padding:0 16px 8px">
        <h2 class="large-title" style="font-size:24px">Lançamentos da fatura</h2>
        <p class="mut sm">${p.itens.length} lançamentos · ${R(p.total)}</p>
      </div>
      <div class="group">
        ${p.itens.map((i, k) => {
          const parc = parcInfo(i.s);
          const m = p.m && p.m[k];
          return `
            <div class="cell pressable" data-a="edititem" data-k="${k}" role="button" tabindex="0">
              <span class="status-ico ok" style="width:24px;height:24px;border-radius:50%;background:var(--ok-bg);color:var(--ok);display:flex;align-items:center;justify-content:center;flex-shrink:0">${ICO.check}</span>
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
      <div class="banco-badge ${bm.cls}" style="margin:0 auto 10px">${bm.sigla}</div>
      <div class="bold" style="font-size:20px">${esc(p.banco || 'Banco')}</div>
      <div class="mut sm" style="margin-bottom:8px">${esc(mesLabel(p.mes))}</div>
      <div class="money-xl">${R(p.total)}</div>
      <p class="sm mut" style="margin-top:8px">${p.itens.length} lançamentos · venc. ${esc(dataCurta(p.venc) || '—')}</p>
      <div class="item-meta" style="justify-content:center;margin-top:10px">
        <span class="pill ${ok ? 'ok' : 'warn'}"><i class="dot"></i>${ok ? 'Valores conferidos' : 'Divergência detectada'}</span>
      </div>
    </div>

    <div class="group">
      <label class="cell">
        <input type="checkbox" id="auto" ${p.auto === false ? '' : 'checked'} style="width:22px;height:22px;accent-color:var(--accent)">
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

// ==========================================================================
// Tela 10: Pessoas
// ==========================================================================
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
    SELECT r.id, r.pago, r.valor_fracao v, l.descricao d, b.nome banco, f.mes_referencia
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

// ==========================================================================
// Tela 12: Ajustes
// ==========================================================================
async function ajustes() {
  overlay(0);
  const t = themePref();
  let storage = 'Indisponível';
  let storagePct = 0;
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      const used = (e.usage || 0) / 1000000;
      const qta = (e.quota || 0) / 1000000;
      storage = `${used.toFixed(1)} MB usados de ${qta ? qta.toFixed(0) : '1000'} MB`;
      storagePct = qta ? Math.min(100, Math.round((used / qta) * 100)) : 1;
    }
  } catch {}

  const off = navigator.onLine ? 'Online' : 'Offline';
  const gStatus = oauthService.getStatus('google');
  const mStatus = oauthService.getStatus('microsoft');
  const gConnected = gStatus.status === 'conectado' || gStatus.status === 'expirado';
  const mConnected = mStatus.status === 'conectado' || mStatus.status === 'expirado';
  const g = gStatus.status === 'conectado' ? (gStatus.email || 'Conectado') :
            gStatus.status === 'expirado' ? 'Expirado — reconectar' : 'Não conectado';
  const m = mStatus.status === 'conectado' ? (mStatus.email || 'Conectado') :
            mStatus.status === 'expirado' ? 'Expirado — reconectar' : 'Não conectado';
  const userName = localStorage.userName || 'Usuario';

  return `
    <div class="page-header">
      <div class="brand-greeting">
        <span class="brand-sub">Preferências</span>
        <h1 class="large-title">Ajustes</h1>
      </div>
    </div>

    <!-- Identificação -->
    <p class="section-label">Identificação</p>
    <div class="group">
      <label class="cell">
        <span class="grow">
          <span class="field-label">Seu Nome</span>
          <input id="uname" class="field bold" value="${esc(userName)}" placeholder="Seu nome">
        </span>
        <button type="button" class="pill accent" data-a="suname">Salvar</button>
      </label>
    </div>

    <!-- Aparência -->
    <p class="section-label">Aparência</p>
    <div class="group">
      ${[
        ['light', 'Tema claro'],
        ['dark', 'Tema escuro'],
        ['system', 'Seguir o sistema']
      ].map(([k, l]) => `
        <button type="button" class="cell pressable ${t === k ? 'on' : ''}" data-a="theme" data-k="${k}">
          <span class="grow bold">${l}</span>
          <span class="radio-mark"></span>
        </button>
      `).join('')}
    </div>
    <p class="footnote">Acompanha automaticamente a aparência configurada no seu iPhone.</p>

    <!-- Importação de e-mails -->
    <p class="section-label">Importação de e-mails</p>
    <div class="group">
      <button type="button" class="cell pressable" data-a="gauth">
        <span class="ico gmail" style="width:28px;height:28px;border-radius:6px;background:rgba(234,67,53,0.12);color:#EA4335;display:flex;align-items:center;justify-content:center;margin-right:4px">${ICO.mail}</span>
        <span class="grow">
          <span class="bold">Gmail</span>
          ${gStatus.email ? `<br><span class="sm mut">${esc(gStatus.email)}</span>` : ''}
        </span>
        <span class="pill ${gConnected ? (gStatus.status === 'expirado' ? 'warn' : 'ok') : ''}">${esc(g)}</span>
        <span class="chev">${ICO.chev}</span>
      </button>
      <button type="button" class="cell pressable" data-a="mauth">
        <span class="ico outlook" style="width:28px;height:28px;border-radius:6px;background:rgba(0,120,212,0.12);color:#0078D4;display:flex;align-items:center;justify-content:center;margin-right:4px">${ICO.mail}</span>
        <span class="grow">
          <span class="bold">Outlook</span>
          ${mStatus.email ? `<br><span class="sm mut">${esc(mStatus.email)}</span>` : ''}
        </span>
        <span class="pill ${mConnected ? (mStatus.status === 'expirado' ? 'warn' : 'ok') : ''}">${esc(m)}</span>
        <span class="chev">${ICO.chev}</span>
      </button>
      ${gConnected ? `
        <button type="button" class="cell pressable" data-a="disconn" data-prov="google">
          <span style="color:#EA4335;margin-right:8px">${ICO.mail}</span>
          <span class="grow">Desconectar Gmail</span>
        </button>` : ''}
      ${mConnected ? `
        <button type="button" class="cell pressable" data-a="disconn" data-prov="microsoft">
          <span style="color:#0078D4;margin-right:8px">${ICO.mail}</span>
          <span class="grow">Desconectar Outlook</span>
        </button>` : ''}
    </div>

    <!-- Dados e armazenamento -->
    <p class="section-label">Dados e armazenamento</p>
    <div class="group">
      <button type="button" class="cell pressable" data-a="exp">
        <span class="grow bold">Exportar backup (.sqlite3)</span>
        <span class="chev">${ICO.chev}</span>
      </button>
      <div class="cell">
        <div class="grow">
          <div class="item-main">
            <span class="bold">Armazenamento local</span>
            <span class="mut sm">${esc(storage)}</span>
          </div>
          <div class="storage-bar">
            <div class="storage-bar-val" style="width:${Math.max(2, storagePct)}%"></div>
          </div>
        </div>
      </div>
    </div>
    <p class="footnote">Os dados ficam salvos exclusivamente no armazenamento local deste iPhone (SQLite via OPFS). Não há sincronização na nuvem. Exporte backups regulares para prevenir perdas ao limpar dados do Safari.</p>

    <!-- Privacidade -->
    <p class="section-label">Privacidade</p>
    <div class="group">
      <div class="cell">
        <span class="grow sm mut">
          Todas as faturas, lançamentos e rateios são analisados e processados localmente neste aparelho. Conexões externas ocorrem apenas ao buscar e-mails via Gmail ou Outlook mediante sua autorização explícita.
        </span>
      </div>
    </div>

    <!-- Informações do Aplicativo -->
    <p class="section-label">Aplicativo</p>
    <div class="group">
      <div class="cell">
        <span class="grow bold">Versão</span>
        <span class="mut sm">${APP_VER}</span>
      </div>
      <div class="cell">
        <span class="grow bold">Estado da rede</span>
        <span class="pill ${navigator.onLine ? 'ok' : 'warn'}">${off}</span>
      </div>
      <div class="cell">
        <span class="grow sm mut">
          Para instalar no iPhone: toque no botão Compartilhar do Safari e selecione <b>Adicionar à Tela de Início</b>. O aplicativo funciona offline para todas as rotinas locais.
        </span>
      </div>
    </div>`;
}

// ==========================================================================
// Tela: Parcelas (Projeção de parcelas futuras e recorrências)
// ==========================================================================
async function parcelas() {
  overlay(0);
  const ms = await meses();

  // Busca todos os lançamentos com info de parcelas/recorrência
  const rows = (await q(`
    SELECT l.*, f.mes_referencia, f.banco_id, b.nome banco, f.data_vencimento
    FROM lancamentos l
    JOIN faturas f ON f.id = l.fatura_id
    JOIN bancos b ON b.id = f.banco_id
    WHERE l.n_parcelas IS NOT NULL OR l.recorrente = 1
    ORDER BY l.grupo_parcela_id, f.mes_referencia, l.id
  `)).rows;

  if (!rows.length) {
    return `
      <div class="page-header">
        <div class="brand-greeting">
          <span class="brand-sub">Projeção</span>
          <h1 class="large-title">Parcelas & Recorrências</h1>
        </div>
      </div>
      ${empty(
        'Nenhuma parcela ou recorrência',
        'Importe faturas com compras parceladas ou marque lançamentos como assinatura mensal.',
        ''
      )}`;
  }

  // Agrupa por grupo_parcela_id (para parcelados) ou por descrição normalizada (para recorrentes)
  const grupos = new Map();
  for (const r of rows) {
    const key = r.grupo_parcela_id || `rec:${norm(r.descricao)}:${r.banco_id}`;
    if (!grupos.has(key)) {
      grupos.set(key, {
        grupo_parcela_id: r.grupo_parcela_id,
        recorrente: !!r.recorrente,
        banco: r.banco,
        banco_id: r.banco_id,
        descricao_base: r.descricao,
        parcelas: [],
        mes_inicio: r.mes_referencia,
        valor_parcela: r.valor,
        n_parcelas: r.n_parcelas
      });
    }
    grupos.get(key).parcelas.push({
      mes: r.mes_referencia,
      parcela_atual: r.parcela_atual,
      valor: r.valor,
      fatura_id: r.fatura_id,
      lancamento_id: r.id,
      data_vencimento: r.data_vencimento
    });
  }

  // Ordena parcelas dentro de cada grupo por mês
  for (const g of grupos.values()) {
    g.parcelas.sort((a, b) => a.mes.localeCompare(b.mes));
  }

  // Converte para array e ordena: primeiro parcelados com parcelas restantes, depois recorrentes
  const gruposArray = [...grupos.values()].sort((a, b) => {
    // Prioriza grupos com parcelas futuras
    const aFuturo = a.parcelas.some(p => p.mes > S.mes) || (a.recorrente && a.parcelas.every(p => p.mes <= S.mes));
    const bFuturo = b.parcelas.some(p => p.mes > S.mes) || (b.recorrente && b.parcelas.every(p => p.mes <= S.mes));
    if (aFuturo && !bFuturo) return -1;
    if (!aFuturo && bFuturo) return 1;
    return a.mes_inicio.localeCompare(b.mes_inicio);
  });

  const userName = localStorage.userName || 'Usuario';

  return `
    <div class="page-header">
      <div class="brand-greeting">
        <span class="brand-sub">Projeção</span>
        <h1 class="large-title">Parcelas & Recorrências</h1>
      </div>
      ${monthSel(ms)}
    </div>

    ${navigator.onLine ? '' : '<div class="offline-bar">Sem conexão. Funções locais continuam disponíveis.</div>'}

    <p class="section-label" style="margin-top:16px">Compras parceladas</p>
    ${renderParcelasGrupos(gruposArray.filter(g => !g.recorrente), 'parcelado')}

    <p class="section-label" style="margin-top:16px">Assinaturas mensais (recorrentes)</p>
    ${renderParcelasGrupos(gruposArray.filter(g => g.recorrente), 'recorrente')}
  `;
}

function renderParcelasGrupos(grupos, tipo) {
  if (!grupos.length) {
    return `<div class="group"><div class="cell mut sm">${tipo === 'parcelado' ? 'Nenhuma compra parcelada encontrada.' : 'Nenhuma assinatura recorrente cadastrada.'}</div></div>`;
  }

  return `
    <div class="group">
      ${grupos.map(g => {
        const parcelasJaImportadas = g.parcelas.filter(p => p.mes <= S.mes);
        const parcelasFuturas = g.parcelas.filter(p => p.mes > S.mes);
        const totalParcelas = g.n_parcelas || parcelasJaImportadas.length + parcelasFuturas.length;
        const parcelasRestantes = totalParcelas - parcelasJaImportadas.length;
        const valorTotalComprometido = parcelasFuturas.reduce((s, p) => s + p.valor, 0);
        const valorParcela = g.valor_parcela || (parcelasJaImportadas[0]?.valor || 0);

        // Para recorrentes, mostra "Próximo mês" se não houver no mês atual
        const temNoMesAtual = g.parcelas.some(p => p.mes === S.mes);
        const proximoMes = temNoMesAtual ? 'Neste mês' : (parcelasFuturas[0] ? `A partir de ${mesLabel(parcelasFuturas[0].mes)}` : '—');

        return `
          <div class="cell pressable" data-a="vergrupo" data-grupo="${esc(JSON.stringify({
            grupo_parcela_id: g.grupo_parcela_id,
            recorrente: g.recorrente,
            banco: g.banco,
            descricao_base: g.descricao_base,
            n_parcelas: totalParcelas,
            valor_parcela: valorParcela
          }))}" role="button" tabindex="0">
            <div class="grow">
              <div class="item-main">
                <span class="desc ellipsis">${esc(g.descricao_base)}</span>
                <span class="money">${R(valorParcela)}${tipo === 'parcelado' ? ` × ${totalParcelas}` : '/mês'}</span>
              </div>
              <div class="item-meta sm mut">
                <span>${esc(g.banco)}</span>
                ${tipo === 'parcelado' ? `
                  <span>· ${parcelasJaImportadas.length}/${totalParcelas} importadas</span>
                  ${parcelasRestantes > 0 ? `<span class="warn">· ${parcelasRestantes} restante${parcelasRestantes > 1 ? 's' : ''}</span>` : ''}
                ` : `
                  <span>· ${proximoMes}</span>
                `}
              </div>
              <div class="item-meta">
                ${tipo === 'parcelado' && parcelasRestantes > 0 ? `
                  <span class="pill warn">Futuro: ${R(valorTotalComprometido)}</span>
                ` : ''}
                ${tipo === 'recorrente' ? `
                  <span class="pill accent">${ICO.star} Recorrente</span>
                ` : ''}
              </div>
            </div>
            <span class="chev">${ICO.chev}</span>
          </div>
        `;
      }).join('')}
    </div>`;
}

// Handler para ver detalhes do grupo
async function verGrupo(grupoData) {
  // Busca todas as parcelas do grupo (incluindo meses futuros não importados)
  const grupo = JSON.parse(grupoData);
  const { grupo_parcela_id, recorrente, banco, descricao_base, n_parcelas, valor_parcela } = grupo;

  let parcelas;
  if (grupo_parcela_id) {
    const rows = (await q(`
      SELECT l.*, f.mes_referencia, f.data_vencimento, f.banco_id
      FROM lancamentos l
      JOIN faturas f ON f.id = l.fatura_id
      WHERE l.grupo_parcela_id = ?
      ORDER BY f.mes_referencia
    `, [grupo_parcela_id])).rows;
    parcelas = rows.map(r => ({
      mes: r.mes_referencia,
      parcela_atual: r.parcela_atual,
      valor: r.valor,
      fatura_id: r.fatura_id,
      lancamento_id: r.id,
      data_vencimento: r.data_vencimento,
      importado: true
    }));
  } else {
    // Recorrente: busca todos recorrentes do banco e filtra por descrição normalizada em JS
    const rows = (await q(`
      SELECT l.*, f.mes_referencia, f.data_vencimento, f.banco_id
      FROM lancamentos l
      JOIN faturas f ON f.id = l.fatura_id
      JOIN bancos b ON b.id = f.banco_id
      WHERE b.nome = ? AND l.recorrente = 1
      ORDER BY f.mes_referencia
    `, [banco])).rows;
    const targetNorm = norm(descricao_base);
    parcelas = rows
      .filter(r => norm(r.descricao) === targetNorm)
      .map(r => ({
        mes: r.mes_referencia,
        parcela_atual: null,
        valor: r.valor,
        fatura_id: r.fatura_id,
        lancamento_id: r.id,
        data_vencimento: r.data_vencimento,
        importado: true
      }));
  }

  // Identifica meses faltantes (para parcelados) ou próximo mês (para recorrentes)
  const mesesImportados = new Set(parcelas.map(p => p.mes));
  const todosMeses = [];
  const mesAtualNum = S.mes;

  if (grupo_parcela_id && n_parcelas) {
    // Para parcelados: gera lista de todos os meses esperados
    const primeira = parcelas[0];
    if (primeira) {
      const [ano, mes] = primeira.mes.split('-').map(Number);
      for (let i = 0; i < n_parcelas; i++) {
        let m = mes + i;
        let a = ano;
        while (m > 12) { m -= 12; a++; }
        const mesStr = `${a}-${String(m).padStart(2, '0')}`;
        todosMeses.push({
          mes: mesStr,
          importado: mesesImportados.has(mesStr),
          parcela_atual: i + 1,
          valor: valor_parcela,
          data_vencimento: parcelas.find(p => p.mes === mesStr)?.data_vencimento
        });
      }
    }
  } else if (recorrente) {
    // Para recorrentes: mostra mês atual + próximos 6 meses
    const [ano, mes] = mesAtualNum.split('-').map(Number);
    for (let i = 0; i <= 6; i++) {
      let m = mes + i;
      let a = ano;
      while (m > 12) { m -= 12; a++; }
      const mesStr = `${a}-${String(m).padStart(2, '0')}`;
      todosMeses.push({
        mes: mesStr,
        importado: mesesImportados.has(mesStr),
        parcela_atual: null,
        valor: valor_parcela,
        data_vencimento: parcelas.find(p => p.mes === mesStr)?.data_vencimento
      });
    }
  }

  const mesLabelFull = m => {
    const [y, mo] = m.split('-');
    const str = new Date(+y, +mo - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  return `
    ${top(
      grupo_parcela_id ? 'Detalhes da Compra Parcelada' : 'Detalhes da Assinatura',
      backBtn('parcelas', 'Parcelas')
    )}
    <div class="hero">
      <div class="bold" style="font-size:18px">${esc(descricao_base)}</div>
      <div class="sm mut" style="margin-top:4px">${esc(banco)}</div>
      <div class="money-xl" style="margin-top:8px">${R(valor_parcela)}${grupo_parcela_id ? ` × ${n_parcelas}` : '/mês'}</div>
      <div class="item-meta" style="justify-content:center;margin-top:10px">
        ${grupo_parcela_id ? `
          <span class="pill">Total: ${R(valor_parcela * n_parcelas)}</span>
          <span class="pill ${parcelas.filter(p => p.mes <= S.mes).length === n_parcelas ? 'ok' : 'warn'}">${parcelas.filter(p => p.mes <= S.mes).length}/${n_parcelas} importadas</span>
        ` : `
          <span class="pill accent">${ICO.star} Assinatura mensal ativa</span>
        `}
      </div>
    </div>

    <p class="section-label">Cronograma</p>
    <div class="group">
      ${todosMeses.map((p, i) => `
        <div class="cell ${!p.importado && p.mes <= S.mes ? 'bad' : ''}">
          <div class="grow">
            <div class="item-main">
              <span class="bold">${esc(mesLabelFull(p.mes))}</span>
              <span class="money">${R(p.valor)}</span>
            </div>
            <div class="item-meta sm mut">
              ${p.importado
                ? `<span class="ok">${ICO.check} Importado</span> ${p.data_vencimento ? `· Vence ${dataCurta(p.data_vencimento)}` : ''}`
                : p.mes <= S.mes
                  ? `<span class="bad">${ICO.warn} Não importado — fatura do ${esc(banco)} não encontrada</span>`
                  : `<span class="mut">${ICO.chev} Previsto${p.data_vencimento ? ` · Vence ${dataCurta(p.data_vencimento)}` : ''}</span>`
              }
            </div>
          </div>
          ${p.importado && p.lancamento_id ? `<span class="chev">${ICO.chev}</span>` : ''}
        </div>
      `).join('')}
    </div>

    ${!recorrente ? `
      <div class="actions" style="margin-top:16px">
        <button type="button" class="btn secondary" data-a="togglerec" data-grupo="${esc(grupoData)}">
          ${ICO.star} Marcar como assinatura mensal
        </button>
      </div>
    ` : ''}
  `;
}

// ==========================================================================
// Roteador e Navegação
// ==========================================================================
const V = { inicio, faturas, parcelas, pessoas, ajustes };

async function go(t) {
  if (t) {
    S.tab = t;
    if (t !== 'faturas') S.fat = null;
    if (t !== 'pessoas') S.pessoa = null;
    S.imp = null;
  }
  document.querySelectorAll('#tabbar button').forEach(b => {
    const on = b.dataset.t === S.tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });

  try {
    $('#app').innerHTML = S.imp ? importarView() : await V[S.tab]();
  } catch (e) {
    $('#app').innerHTML = `<div class="empty"><h2>Erro</h2><p>${esc(e.message)}</p></div>`;
  }
  if (S.bootErr) {
    toast(S.bootErr);
    S.bootErr = 0;
  }
}

// ==========================================================================
// Parsing e Extração de Faturas
// ==========================================================================
const html2txt = h => h
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  .replace(/<\/(tr|p|div|li|h\d)>|<br\s*\/?>/gi, '\n')
  .replace(/<\/t[dh]>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/[ \t]+/g, ' ');

const utf = u => new TextDecoder().decode(u);

function askPwd(why) {
  return new Promise((resolve, reject) => {
    S.pwd = { resolve, reject };
    openSheet(`
      <h2>PDF protegido por senha</h2>
      <p class="footnote" style="text-align:center">${why === 2 ? 'Senha incorreta. Tente novamente.' : 'Informe a senha para abrir o arquivo.'}</p>
      <div class="group">
        <div class="cell">
          <input id="pw" class="field" type="password" placeholder="Senha do PDF" autocomplete="off">
        </div>
      </div>
      <div class="actions">
        <button type="button" class="btn primary" data-a="pwok">Desbloquear</button>
        <button type="button" class="btn ghost" data-a="pwno">Cancelar</button>
      </div>`, 1);
    setTimeout(() => $('#pw')?.focus(), 250);
  });
}

async function pdfText(buf) {
  const m = await import('./lib/pdf.min.mjs');
  m.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.min.mjs';
  const task = m.getDocument({ data: buf });
  S.pdfTask = task;
  task.onPassword = (cb, why) => {
    askPwd(why).then(p => cb(p), () => task.destroy());
  };
  const d = await task.promise;
  let o = '';
  for (let i = 1; i <= d.numPages; i++) {
    if (S.imp) S.imp.status = `Lendo página ${i} de ${d.numPages}`;
    const c = await (await d.getPage(i)).getTextContent();
    let y, l = '';
    for (const it of c.items) {
      if (y !== undefined && Math.abs(it.transform[5] - y) > 2) {
        o += l.trim() + '\n';
        l = '';
      }
      l += it.str + ' ';
      y = it.transform[5];
    }
    o += l.trim() + '\n';
  }
  S.pdfTask = null;
  return o;
}

const MS = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const MR = 'jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez';
const p2 = n => String(n).padStart(2, '0');
const mon = s => MS[s.slice(0, 3).toLowerCase()];

const BANCOS = [
  ['Nubank', /nubank|nu pagamentos/i],
  ['Mercado Pago', /mercado pago/i],
  ['Santander', /santander/i],
  ['PicPay', /picpay/i]
];

const TOTAIS = [
  /^total da fatura R\$ ?([\d.]+,\d{2}) ?$/mi,
  /^total a pagar R\$ ?([\d.]+,\d{2}) ?$/mi,
  /\(=\) ?saldo desta fatura ([\d.]+,\d{2})/i,
  /^total R\$ ?([\d.]+,\d{2}) ?$/mi,
  /(?:valor total|total a pagar)[^\d\n]{0,40}([\d.]+,\d{2})/i
];

const SKIP = /^(pagamento (em|de fatura|da fatura|recebido|efetuado)|saldo restante)/i;
const VO = /^-? ?R?\$? ?-?[\d.]+,\d{2}$/;

function parseFat(t) {
  t = t.replace(/[\u2212\u2013]/g, '-').replace(/[ \t\u00a0]+/g, ' ');
  const banco = (BANCOS.find(([, r]) => r.test(t)) || [])[0] || '';
  let tot = null;
  for (const r of TOTAIS) if ((tot = t.match(r))) break;

  let ve = null, m;
  if (m = t.match(/vencimento[^\d\n]{0,30}(\d{2})\/(\d{2})\/(\d{4})/i) ||
          t.match(/vencimento\s+(\d{2})\/(\d{2})\/(\d{4})/i) ||
          t.match(/(\d{2})\/(\d{2})\/(\d{4}) ?\| ?\d{2}\/\d{2}\/\d{4} Vencimento/i)) {
    ve = [+m[3], +m[2], +m[1]];
  } else if (m = t.match(new RegExp(`vencimento[^\\d\\n]{0,30}(\\d{1,2})(?: de)?\\s+(${MR})[a-zç]*\\.?(?:\\s+de)?\\s+(\\d{4})`, 'i'))) {
    ve = [+m[3], mon(m[2]), +m[1]];
  }

  const vy = ve ? ve[0] : new Date().getFullYear();
  const vm = ve ? ve[1] : 12;
  const vi = ve ? `${ve[0]}-${p2(ve[1])}-${p2(ve[2])}` : '';
  const itens = [];
  const VAL = '(-?\\s?R?\\$?\\s?-?[\\d.]+,\\d{2})$';
  const r1 = new RegExp(`^(\\d{2})/(\\d{2})(?:/(\\d{2,4}))?\\s+(.+?)\\s+${VAL}`);
  const r2 = new RegExp(`^(\\d{1,2})(?: de)?\\s+(${MR})[a-zç]*\\.?(?:\\s+(?:de\\s+)?(20\\d{2}))?\\s+(.+?)\\s+${VAL}`, 'i');
  const r2n = new RegExp(`^(\\d{1,2}) (${MR})[a-zç]*\\.? (.+)$`, 'i');

  const put = (d, mm, yy, desc, val) => {
    desc = desc.replace(/^[•·]+ ?\d{4} /, '').replace(/^[•·–-] ?/, '').trim();
    if (!desc || SKIP.test(desc)) return;
    mm = +mm;
    const y = yy ? (String(yy).length === 2 ? 2000 + +yy : +yy) : (mm > vm ? vy - 1 : vy);
    itens.push({ d: `${y}-${p2(mm)}-${p2(d)}`, s: desc, v: num(val) });
  };

  let pend = null, k = 0;
  for (const l of t.split('\n')) {
    const s = l.trim().replace(/^\S (?=\d{2}\/\d{2} )/, '');
    let x = s.match(r1);
    if (pend && ++k <= 5 && VO.test(s)) {
      put(pend[0], pend[1], 0, pend[2], s);
      pend = null;
      continue;
    }
    if (x) put(x[1], x[2], x[3], x[4], x[5]);
    else if ((x = s.match(r2))) put(x[1], mon(x[2]), x[3], x[4], x[5]);
    else if ((x = s.match(r2n))) { pend = [x[1], mon(x[2]), x[3]]; k = 0; }
    else if ((x = s.match(/^\(\+\) (Juros Remuneratórios|IOF|Juros de Mora|Multa por Atraso) ([\d.]+,\d{2})$/i)) && num(x[2]) > 0) {
      itens.push({ d: vi, s: x[1], v: num(x[2]) });
    }
  }

  const soma = itens.reduce((a, i) => a + i.v, 0);
  const total = tot ? num(tot[1]) : soma;
  // Adiciona info de parcelas aos itens
  const itensComParc = itens.map(i => {
    const pc = parc(i.s);
    return {
      ...i,
      v: i.v.toFixed(2),
      n_parcelas: pc.t || null,
      parcela_atual: pc.n || null,
      // grupo_parcela_id será preenchido no savefat (novo) ou pelo casar (existente)
      grupo_parcela_id: null
    };
  });
  return {
    banco,
    total: total.toFixed(2),
    soma: soma.toFixed(2),
    venc: vi,
    mes: ve ? `${ve[0]}-${p2(ve[1])}` : mesAtual(),
    itens: itensComParc
  };
}

const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

// Gera UUID v4 simples para grupo de parcelas
const genUUID = () => crypto.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
  return v.toString(16);
});

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

const plain = t => /<\/?(html|body|table|div|p|br)\b/i.test(t) ? html2txt(t) : t;

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
    AND l.recorrente = 1
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

// Geração do Texto de Cobrança Formatado (Screen 11 Mockup)
function cobrancaTexto(a, mes) {
  const o = a.filter(x => !x.pago), t = o.reduce((s, x) => s + x.v, 0);
  let msg = `Olá ${a[0].nome}! Segue sua cobrança do mês:\n\n`;
  msg += `• Mês: ${mesLabel(mes)}\n`;
  msg += `• Valor total: ${R(t)}\n`;
  if (a[0].chave_pix) {
    msg += `• Pagamento via Pix\n`;
    msg += `• Chave Pix: ${a[0].chave_pix}\n`;
  }
  msg += `\nPrincipais gastos:\n`;
  msg += o.map(x => `• ${x.d}: ${R(x.v)}`).join('\n');
  msg += `\n\n⚠️ Pagamento pendente.`;
  return msg;
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

// Modal de Cobrança via Pix (Screen 11 Mockup)
function modalCobranca(a, mes) {
  const txt = cobrancaTexto(a, mes);
  openSheet(`
    <h2>Cobrança via Pix</h2>
    <p class="footnote" style="text-align:center;margin-top:0">Pronto para enviar por WhatsApp, iMessage ou outro app.</p>
    
    <div class="pix-preview-card">${esc(txt)}</div>

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

// ==========================================================================
// Mapa de Ações de Eventos (Event Delegation)
// ==========================================================================
const A = {
  tab: d => {
    S.fat = null;
    S.pessoa = null;
    if (d.t !== 'faturas') S.imp = null;
    go(d.t);
  },
  open: d => {
    S.fat = +d.id;
    S.imp = null;
    S.tab = 'faturas';
    go();
  },
  back: () => {
    S.fat = null;
    go();
  },
  backp: () => {
    S.pessoa = null;
    go();
  },
  openp: d => {
    S.pessoa = +d.id;
    S.tab = 'pessoas';
    go();
  },
  ff: d => {
    S.ff = d.k;
    go();
  },
  scrollto: d => {
    const el = $(d.target);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  },
  importar: () => {
    S.imp = { step: 1 };
    S.fat = null;
    go();
  },
  impback: () => {
    syncPreviewFields();
    if (!S.imp || S.imp.step <= 1) {
      if (S.imp?.origin && S.imp.step === 1) {
        S.imp.origin = null;
        go();
        return;
      }
      S.imp = null;
      go();
      return;
    }
    if (S.imp.step === 2) {
      S.pdfTask?.destroy?.();
      S.imp.step = 1;
      S.imp.error = null;
      go();
      return;
    }
    S.imp.step = Math.max(1, S.imp.step - 1);
    if (S.imp.step === 2) S.imp.step = 1;
    go();
  },
  impcancel: () => {
    S.pdfTask?.destroy?.();
    S.imp = { step: 1 };
    go();
  },
  origem: d => {
    if (d.k === 'arquivo') {
      $('#fl')?.click();
      return;
    }
    S.imp = { step: 1, origin: d.k, q: 'fatura' };
    go();
  },
  impstep: d => {
    syncPreviewFields();
    S.imp.step = +d.n;
    go();
  },
  mes: (d, el) => {
    S.mes = el.value;
    go();
  },
  mesp: (d, el) => {
    S.mes = el.value;
    go();
  },
  theme: d => {
    localStorage.theme = d.k;
    applyTheme();
    go();
  },
  suname: () => {
    const n = $('#uname')?.value.trim();
    if (n) {
      localStorage.userName = n;
      toast('Nome atualizado');
    }
  },
  paga: async d => {
    const f = (await q('SELECT pago FROM faturas WHERE id = ?', [d.id])).rows[0];
    const ok = await confirmUI(
      f.pago ? 'Marcar como pendente' : 'Marcar como paga',
      f.pago
        ? 'A fatura voltará ao estado pendente. Os pagamentos individuais atribuídos aos participantes não são alterados.'
        : 'Confirma o pagamento total desta fatura? Os pagamentos individuais dos participantes não são alterados.',
      'Confirmar',
      0
    );
    closeSheet();
    if (!ok) return;
    await q('UPDATE faturas SET pago = 1 - pago WHERE id = ?', [d.id]);
    toast(f.pago ? 'Fatura pendente' : 'Fatura marcada como paga');
    go();
  },
  fatmenu: d => {
    openSheet(`
      <h2>Opções da Fatura</h2>
      <div class="action-list">
        <button type="button" data-a="paga" data-id="${d.id}">Alternar status de pagamento</button>
        <button type="button" class="bad" data-a="delfat" data-id="${d.id}">Excluir fatura</button>
        <button type="button" data-a="closesheet">Cancelar</button>
      </div>`);
  },
  fatrateio: () => {
    const el = $('#lancamentos-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    toast('Selecione um lançamento para ratear');
  },
  fatresumo: () => {
    S.tab = 'inicio';
    go();
  },
  editfat: async d => {
    const f = (await q('SELECT f.*, b.nome banco FROM faturas f JOIN bancos b ON b.id=f.banco_id WHERE f.id=?', [d.id])).rows[0];
    openSheet(`
      <h2>Editar Fatura</h2>
      <div class="group">
        <label class="cell">
          <span class="field-label" style="width:7rem">Total</span>
          <input id="ef_tot" class="field money bold" inputmode="decimal" value="${esc(f.valor_total)}">
        </label>
        <label class="cell">
          <span class="field-label" style="width:7rem">Vencimento</span>
          <input id="ef_venc" class="field" type="date" value="${esc(f.data_vencimento || '')}">
        </label>
      </div>
      <div class="actions">
        <button type="button" class="btn primary" data-a="svefat" data-id="${d.id}">Salvar alterações</button>
      </div>`);
  },
  svefat: async d => {
    const v = f2($('#ef_tot')?.value);
    const dt = $('#ef_venc')?.value;
    if (isNaN(v) || v < 0) return toast('Valor inválido');
    await q('UPDATE faturas SET valor_total = ?, data_vencimento = ? WHERE id = ?', [v, dt || null, d.id]);
    closeSheet();
    toast('Fatura atualizada');
    go();
  },
  delfat: async d => {
    closeSheet();
    const ok = await confirmUI(
      'Excluir fatura',
      'A fatura, seus lançamentos e rateios associados serão removidos deste iPhone. Esta ação é irreversível.',
      'Excluir',
      1
    );
    closeSheet();
    if (!ok) return;
    await tx([
      ['DELETE FROM lancamentos WHERE fatura_id = ?', [d.id]],
      ['DELETE FROM faturas WHERE id = ?', [d.id]]
    ]);
    S.fat = null;
    toast('Fatura excluída com sucesso');
    go();
  },
  addpui: () => {
    openSheet(`
      <h2>Nova Pessoa</h2>
      <div class="group">
        <div class="cell">
          <input id="pn" class="field bold" placeholder="Nome completo" autocomplete="name">
        </div>
        <div class="cell">
          <input id="pp" class="field" placeholder="Chave Pix (opcional)" autocomplete="off">
        </div>
      </div>
      <div class="actions">
        <button type="button" class="btn primary" data-a="addp">Adicionar pessoa</button>
      </div>`);
  },
  addp: async () => {
    const n = $('#pn')?.value.trim();
    if (!n) return toast('Informe o nome da pessoa');
    await q('INSERT INTO pessoas(nome, chave_pix) VALUES(?, ?)', [n, $('#pp')?.value.trim() || null]);
    closeSheet();
    toast('Pessoa adicionada');
    if (S.l) {
      // Se estava no meio do rateio, recarrega a lista
      const Ps = (await q('SELECT * FROM pessoas ORDER BY nome')).rows;
      S.ps = Ps;
      renderRateio(Ps, S.rt);
    } else {
      go();
    }
  },
  editp: async d => {
    const p = (await q('SELECT * FROM pessoas WHERE id = ?', [d.id])).rows[0];
    openSheet(`
      <h2>Editar Cadastro</h2>
      <div class="group">
        <div class="cell">
          <input id="pn" class="field bold" value="${esc(p.nome)}" placeholder="Nome">
        </div>
        <div class="cell">
          <input id="pp" class="field" value="${esc(p.chave_pix || '')}" placeholder="Chave Pix">
        </div>
      </div>
      <div class="actions">
        <button type="button" class="btn primary" data-a="svpessoa" data-id="${d.id}">Salvar alterações</button>
      </div>`);
  },
  svpessoa: async d => {
    const n = $('#pn')?.value.trim();
    if (!n) return toast('Informe o nome');
    await q('UPDATE pessoas SET nome = ?, chave_pix = ? WHERE id = ?', [n, $('#pp')?.value.trim() || null, d.id]);
    closeSheet();
    toast('Cadastro atualizado');
    go();
  },
  delp: async d => {
    const ok = await confirmUI(
      'Excluir pessoa',
      'Se houver despesas ou rateios vinculados a esta pessoa, a exclusão será bloqueada para proteger o histórico financeiro.',
      'Excluir',
      1
    );
    closeSheet();
    if (!ok) return;
    try {
      await q('DELETE FROM pessoas WHERE id = ?', [d.id]);
      S.pessoa = null;
      toast('Pessoa excluída');
      go();
    } catch {
      toast('Não é possível excluir: existem rateios vinculados.');
    }
  },
  rpago: async (d, el) => {
    await q('UPDATE rateio_lancamento SET pago = ? WHERE id = ?', [el.checked ? 1 : 0, d.id]);
    toast(el.checked ? 'Pagamento marcado' : 'Pagamento pendente');
    go();
  },
  cobra: async d => {
    const a = S.g[d.pid];
    if (!a?.length) return;
    modalCobranca(a, S.mes);
  },
  sharetext: async d => {
    const txt = decodeURIComponent(d.txt);
    try {
      if (navigator.share) {
        await navigator.share({ text: txt });
        toast('Cobrança compartilhada');
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
    await navigator.clipboard.writeText(txt);
    toast('Texto da cobrança copiado');
  },
  copytext: async d => {
    const txt = decodeURIComponent(d.txt);
    await navigator.clipboard.writeText(txt);
    toast('Texto da cobrança copiado');
  },
  copypix: async d => {
    const p = (await q('SELECT chave_pix FROM pessoas WHERE id = ?', [d.id])).rows[0];
    if (!p?.chave_pix) return;
    await navigator.clipboard.writeText(p.chave_pix);
    toast('Chave Pix copiada com sucesso');
  },
  disconn: async d => {
    const prov = d.prov;
    try {
      if (prov === 'google') await oauthService.disconnectGoogle();
      else if (prov === 'microsoft') await oauthService.disconnectMicrosoft();
      toast(prov === 'google' ? 'Gmail desconectado' : 'Outlook desconectado');
    } catch (e) {
      toast(emsg(e));
    }
    go();
  },
  gauth: async () => {
    try {
      await oauthService.startGoogleAuth();
      toast('Gmail conectado com sucesso!');
    } catch (e) {
      toast(emsg(e));
    }
    go();
  },
  mauth: async () => {
    try {
      await oauthService.startMicrosoftAuth();
    } catch (e) {
      toast(emsg(e));
      go();
    }
  },
  gbusca: async () => {
    if (!navigator.onLine) return toast('Você está offline. Conecte-se para acessar suas mensagens.');
    const t = $('#gq')?.value.trim() || 'fatura';
    const q = /newer_than/.test(t) ? t : t + ' newer_than:90d';
    if (S.imp) { S.imp.q = t; S.imp.qeff = q; }
    try {
      const result = await oauthService.searchGmail(q, 12);
      S.msgs = result.messages;
      if (S.imp) S.imp.nextPage = result.nextPage || null;
      const el = $('#gl');
      if (el) el.innerHTML = gl() || '<div class="cell mut">Nenhuma mensagem encontrada.</div>';
      const ga = $('#ga');
      if (ga) ga.innerHTML = result.nextPage
        ? '<div class="actions"><button type="button" class="btn secondary" data-a="loadmore">Carregar mais</button></div>'
        : '';
    } catch (e) {
      toast(emsg(e));
      go();
    }
  },
  mbusca: async () => {
    if (!navigator.onLine) return toast('Você está offline. Conecte-se para acessar suas mensagens.');
    const t = $('#gq')?.value.trim() || 'fatura';
    if (S.imp) S.imp.q = t;
    try {
      const result = await oauthService.searchOutlook(t, 12);
      S.msgs = result.messages;
      if (S.imp) S.imp.nextPage = result.nextPage || null;
      const el = $('#gl');
      if (el) el.innerHTML = gl() || '<div class="cell mut">Nenhuma mensagem encontrada.</div>';
      const ga = $('#ga');
      if (ga) ga.innerHTML = result.nextPage
        ? '<div class="actions"><button type="button" class="btn secondary" data-a="loadmore">Carregar mais</button></div>'
        : '';
    } catch (e) {
      toast(emsg(e));
      go();
    }
  },
  loadmore: async () => {
    const imp = S.imp;
    if (!imp?.nextPage) return;
    const page = imp.nextPage;
    try {
      const result = imp.origin === 'gmail'
        ? await oauthService.searchGmail(imp.qeff || imp.q || 'fatura', 12, page)
        : await oauthService.searchOutlook(imp.q || 'fatura', 12, page);
      S.msgs = [...S.msgs, ...result.messages];
      imp.nextPage = result.nextPage || null;
      const el = $('#gl');
      if (el) el.innerHTML = gl();
      const ga = $('#ga');
      if (ga) ga.innerHTML = imp.nextPage
        ? '<div class="actions"><button type="button" class="btn secondary" data-a="loadmore">Carregar mais</button></div>'
        : '';
    } catch (e) {
      toast(emsg(e));
    }
  },
  setchip: d => {
    if (S.imp) S.imp.q = d.k;
    const qEl = $('#gq');
    if (qEl) qEl.value = d.k;
    go();
  },
  gpick: async d => {
    const m = S.msgs[d.i];
    let atts = [];
    try {
      atts = await m.listAttachments();
    } catch {
      atts = [];
    }
    m._atts = atts;
    openSheet(`
      <h2>Opções da mensagem</h2>
      <p class="footnote">${esc(m.subject)}</p>
      <div class="action-list">
        ${atts.map((a, j) => `<button type="button" data-a="att" data-i="${d.i}" data-j="${j}">Anexo: ${esc(a.name)}</button>`).join('')}
        <button type="button" data-a="frombody" data-i="${d.i}">Usar texto do e-mail</button>
        <button type="button" data-a="closesheet">Cancelar</button>
      </div>`);
  },
  frombody: async d => {
    closeSheet();
    const m = S.msgs[d.i];
    if (oauthService.isImported(m.key)) {
      const ok = await confirmUI('Mensagem já importada', 'Esta mensagem já foi importada antes. Deseja importar novamente?', 'Importar', 0);
      if (!ok) return;
    }
    S.imp = { ...S.imp, step: 2, msgKey: m.key, status: 'Lendo e-mail…' };
    await go();
    try {
      await show(m.body || m.snippet || '');
    } catch (e) {
      S.imp = { step: 2, error: 'Não foi possível interpretar o e-mail. Tente novamente.' };
      go();
    }
  },
  att: async d => {
    closeSheet();
    const m = S.msgs[d.i];
    const a = (m._atts || [])[d.j];
    if (!a) return toast('Anexo indisponível. Tente novamente.');
    if (oauthService.isImported(m.key)) {
      const ok = await confirmUI('Mensagem já importada', 'Esta mensagem já foi importada antes. Deseja importar novamente?', 'Importar', 0);
      if (!ok) return;
    }
    S.imp = { ...S.imp, step: 2, msgKey: m.key, status: 'Lendo anexo…' };
    await go();
    try {
      const b = await a.download();
      await show(/\.pdf$/i.test(a.name) ? await pdfText(b) : utf(b));
    } catch (e) {
      S.imp = { step: 2, error: 'Não foi possível ler o anexo. Tente novamente.' };
      go();
    }
  },
  parse: async () => {
    try {
      const f = $('#fl')?.files?.[0];
      const tx = $('#tx')?.value || '';
      if (!f && !tx.trim()) return toast('Selecione um arquivo ou cole o texto');
      S.imp = {
        ...S.imp,
        step: 2,
        origin: S.imp?.origin || (f ? 'arquivo' : 'texto'),
        status: f ? (/pdf/i.test(f.name) ? 'Lendo PDF…' : 'Lendo arquivo…') : 'Interpretando texto…'
      };
      await go();
      await show(f ? (/\.pdf$/i.test(f.name) ? await pdfText(new Uint8Array(await f.arrayBuffer())) : await f.text()) : tx);
      const fl = $('#fl');
      if (fl) fl.value = '';
    } catch (e) {
      S.imp = { step: 2, origin: S.imp?.origin, error: 'Falha ao ler: ' + e.message };
      go();
    }
  },
  edititem: d => {
    const i = S.imp.p.itens[+d.k];
    S.editK = +d.k;
    openSheet(`
      <h2>Editar Lançamento</h2>
      <div class="group">
        <label class="cell">
          <span class="grow">
            <span class="field-label">Descrição</span>
            <input id="is" class="field bold" value="${esc(i.s)}">
          </span>
        </label>
        <label class="cell">
          <span class="grow">
            <span class="field-label">Data</span>
            <input id="idat" class="field" type="date" value="${esc(i.d || '')}">
          </span>
        </label>
        <label class="cell">
          <span class="grow">
            <span class="field-label">Valor</span>
            <input id="iv" class="field money bold" inputmode="decimal" value="${esc(i.v)}">
          </span>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="btn primary" data-a="svitem">Salvar</button>
        <button type="button" class="btn danger" data-a="rmit">Remover lançamento</button>
      </div>`);
  },
  svitem: () => {
    const it = S.imp.p.itens[S.editK];
    it.s = $('#is').value.trim();
    it.d = $('#idat').value;
    it.v = f2($('#iv').value).toFixed(2);
    S.imp.p.soma = S.imp.p.itens.reduce((a, i) => a + (+i.v), 0).toFixed(2);
    closeSheet();
    go();
  },
  rmit: () => {
    S.imp.p.itens.splice(S.editK, 1);
    if (S.imp.p.m) S.imp.p.m.splice(S.editK, 1);
    S.imp.p.soma = S.imp.p.itens.reduce((a, i) => a + (+i.v), 0).toFixed(2);
    closeSheet();
    go();
  },
  savefat: async () => {
    syncPreviewFields();
    const p = S.imp.p, nome = p.banco.trim();
    if (!nome) return toast('Informe o banco');
    const tot = +p.total, venc = p.venc, mes = p.mes;
    if (!(tot >= 0) || !mes) return toast('Total ou mês inválidos');
    // Inclui n_parcelas, parcela_atual, grupo_parcela_id, recorrente, _rateioSugerido
    const its = p.itens.map(i => [
      i.d, i.s.trim(), +i.v,
      i.n_parcelas || null,
      i.parcela_atual || null,
      i.grupo_parcela_id || null,
      i.recorrente ? 1 : 0,
      i._rateioSugerido || null
    ]).filter(i => i[1] && !isNaN(i[2]));

    let b = (await q('SELECT id FROM bancos WHERE nome = ?', [nome])).rows[0]?.id;
    if (!b) b = (await q('INSERT INTO bancos(nome) VALUES(?)', [nome])).id;

    if ((await q('SELECT 1 FROM faturas WHERE banco_id = ? AND mes_referencia = ?', [b, mes])).rows.length) {
      const ok = await confirmUI('Fatura já existente', 'Já existe fatura deste banco e mês cadastrada. Deseja importar mesmo assim?', 'Importar', 0);
      closeSheet();
      if (!ok) return;
    }

    const fid = (await q('INSERT INTO faturas(banco_id, mes_referencia, valor_total, data_vencimento) VALUES(?, ?, ?, ?)', [b, mes, tot, venc || null])).id;
    const rs = await tx(its.map(([d, s, v, np, pa, gpi, rec, rsug]) =>
      ['INSERT INTO lancamentos(fatura_id, descricao, valor, data_transacao, n_parcelas, parcela_atual, grupo_parcela_id, recorrente) VALUES(?, ?, ?, ?, ?, ?, ?, ?)',
       [fid, s, v, d || null, np, pa, gpi, rec]]
    ));

    let n = 0;
    const st = [];
    if (p.auto !== false) {
      // Usa o casar result já calculado no preview (p.m) para evitar recalcular
      const M = p.m;
      M.forEach((m, i) => {
        if (!m) return;
        const lid = rs[i].id, T = Math.round(its[i][2] * 100);
        const c = cents(T, m.sh.map(x => x.pct));
        n++;
        m.sh.forEach((x, j) => st.push([
          'INSERT INTO rateio_lancamento(lancamento_id, pessoa_id, valor_fracao, porcentagem, pago) VALUES(?, ?, ?, ?, 0)',
          [lid, x.pid, c[j] / 100, T ? +(c[j] / T * 100).toFixed(4) : 0]
        ]));
        if (m.sh.length === 1) st.push(['UPDATE lancamentos SET dono_id = ? WHERE id = ?', [m.sh[0].pid, lid]]);
      });
    }
    // Aplica rateio sugerido para recorrentes adicionados manualmente
    its.forEach((item, i) => {
      if (item[7] && rs[i]) { // _rateioSugerido existe
        const lid = rs[i].id;
        const T = Math.round(item[2] * 100);
        const c = cents(T, [item[7].porcentagem || (item[7].valor_fracao / item[2]) * 100]);
        st.push([
          'INSERT INTO rateio_lancamento(lancamento_id, pessoa_id, valor_fracao, porcentagem, pago) VALUES(?, ?, ?, ?, ?)',
          [lid, item[7].pessoa_id, c[0] / 100, T ? +(c[0] / T * 100).toFixed(4) : 0, item[7].pago || 0]
        ]);
        n++;
      }
    });

    if (st.length) await tx(st);

    // Registra a mensagem como importada (prevenção de duplicidade).
    if (S.imp?.msgKey) oauthService.markImported(S.imp.msgKey);
    S.imp = null;
    S.fat = fid;
    S.tab = 'faturas';
    S.mes = mes;
    toast(n ? `Fatura salva · ${n} rateios reaproveitados` : 'Fatura salva com sucesso');
    go();
  },
  ratear: async d => {
    const l = S.l = (await q('SELECT * FROM lancamentos WHERE id = ?', [d.id])).rows[0];
    const Ps = (await q('SELECT * FROM pessoas ORDER BY nome')).rows;
    const Rt = (await q('SELECT * FROM rateio_lancamento WHERE lancamento_id = ?', [l.id])).rows;
    if (!Ps.length) return toast('Cadastre pessoas participantes primeiro');
    S.rmode = 'v';
    S.rt = Rt;
    S.ps = Ps;
    renderRateio(Ps, Rt);
  },
  togglerecl: async (d, el) => {
    // Handler para o toggle de recorrência na folha de rateio
    const novoValor = el.checked ? 1 : 0;
    await q('UPDATE lancamentos SET recorrente = ? WHERE id = ?', [novoValor, S.l.id]);
    S.l.recorrente = novoValor;
    toast(novoValor ? 'Marcado como assinatura mensal' : 'Assinatura mensal removida');
    // Re-renderiza a folha para atualizar o estado
    renderRateio(S.ps, S.rt);
  },
  rmode: d => {
    const box = $('#sheet');
    const s = [...box.querySelectorAll('.rat-row')].map(row => ({
      c: row.querySelector('input[type=checkbox]'),
      v: f2(row.querySelector('.rv').value)
    }));
    const prev = S.rmode;
    S.rmode = d.k;
    const Rt = S.ps.map(p => {
      const row = s.find(x => +x.c.dataset.pid === p.id);
      if (!row || !row.c.checked || isNaN(row.v)) return S.rt.find(x => x.pessoa_id === p.id);
      if (prev === 'p' && S.rmode === 'v') return { pessoa_id: p.id, valor_fracao: (S.l.valor * row.v) / 100, porcentagem: row.v };
      if (prev === 'v' && S.rmode === 'p') return { pessoa_id: p.id, valor_fracao: row.v, porcentagem: S.l.valor ? (row.v / S.l.valor) * 100 : 0 };
      return { pessoa_id: p.id, valor_fracao: row.v, porcentagem: row.v };
    }).filter(Boolean);
    S.rt = Rt;
    renderRateio(S.ps, Rt);
  },
  igual: () => {
    const c = [...$('#sheet').querySelectorAll('input[type=checkbox]:checked')];
    if (!c.length) return toast('Selecione ao menos uma pessoa');
    const pct = S.rmode === 'p';
    c.forEach(x => {
      x.closest('.rat-row').querySelector('.rv').value = (pct ? 100 / c.length : S.l.valor / c.length).toFixed(2);
    });
    rateioRest();
  },
  ratclear: () => {
    $('#sheet').querySelectorAll('input[type=checkbox]').forEach(c => (c.checked = false));
    $('#sheet').querySelectorAll('.rv').forEach(i => (i.value = ''));
    rateioRest();
  },
  reuse: async () => {
    const f = (await q(`
      SELECT b.nome banco, f.mes_referencia mes
      FROM lancamentos l
      JOIN faturas f ON f.id = l.fatura_id
      JOIN bancos b ON b.id = f.banco_id
      WHERE l.id = ?
    `, [S.l.id])).rows[0];

    const M = await casar(f.banco, f.mes, [{ s: S.l.descricao, v: S.l.valor }]);
    if (!M[0]) return toast('Nenhum rateio anterior correspondente');
    modalReaproveitamento(M[0], S.l.id);
  },
  applyreuse: async d => {
    closeSheet();
    const f = (await q(`
      SELECT b.nome banco, f.mes_referencia mes
      FROM lancamentos l
      JOIN faturas f ON f.id = l.fatura_id
      JOIN bancos b ON b.id = f.banco_id
      WHERE l.id = ?
    `, [d.lid])).rows[0];

    const M = await casar(f.banco, f.mes, [{ s: S.l.descricao, v: S.l.valor }]);
    if (!M[0]) return;
    const Rt = M[0].sh.map(x => ({
      pessoa_id: x.pid,
      valor_fracao: (S.l.valor * x.pct) / 100,
      porcentagem: x.pct
    }));
    S.rt = Rt;
    renderRateio(S.ps, Rt, `Reaproveitado · ${M[0].info}`);
  },
  svrat: async () => {
    const l = S.l, T = Math.round(l.valor * 100), pct = S.rmode === 'p';
    const s = [...$('#sheet').querySelectorAll('input[type=checkbox]:checked')].map(c => ({
      pid: +c.dataset.pid,
      v: f2(c.closest('.rat-row').querySelector('.rv').value)
    }));
    if (!s.length || s.some(x => isNaN(x.v))) return toast('Preencha os valores de cada participante');

    let c;
    if (pct) {
      if (Math.abs(s.reduce((a, x) => a + x.v, 0) - 100) > 0.05) return toast('Percentuais devem somar 100%');
      c = s.map(x => Math.round((T * x.v) / 100));
    } else {
      c = s.map(x => Math.round(x.v * 100));
    }

    const df = T - c.reduce((a, b) => a + b, 0);
    if (!pct && Math.abs(df) > s.length) return toast('A soma dos valores difere do total de ' + R(l.valor));
    // Ajuste de centavos na última pessoa
    c[c.length - 1] += df;

    const old = Object.fromEntries((await q('SELECT pessoa_id, pago FROM rateio_lancamento WHERE lancamento_id = ?', [l.id])).rows.map(r => [r.pessoa_id, r.pago]));

    await tx([
      ['DELETE FROM rateio_lancamento WHERE lancamento_id = ?', [l.id]],
      ...s.map((x, i) => [
        'INSERT INTO rateio_lancamento(lancamento_id, pessoa_id, valor_fracao, porcentagem, pago) VALUES(?, ?, ?, ?, ?)',
        [l.id, x.pid, c[i] / 100, T ? +(c[i] / T * 100).toFixed(4) : 0, old[x.pid] || 0]
      ]),
      ['UPDATE lancamentos SET dono_id = ? WHERE id = ?', [s.length === 1 ? s[0].pid : null, l.id]]
    ]);

    closeSheet();
    toast('Rateio salvo com sucesso');
    go();
  },
  closesheet: () => {
    if (!S.sheetLock) closeSheet();
  },
  cnfy: () => {
    const r = S._cnf;
    S._cnf = null;
    r?.(true);
  },
  cnfn: () => {
    const r = S._cnf;
    S._cnf = null;
    closeSheet();
    r?.(false);
  },
  pwok: () => {
    const p = $('#pw')?.value;
    const x = S.pwd;
    S.pwd = null;
    closeSheet();
    x?.resolve(p || '');
  },
  pwno: () => {
    const x = S.pwd;
    S.pwd = null;
    closeSheet();
    x?.reject(Error('Cancelado'));
  },
  exp: async () => {
    const b = await call('export');
    const u = URL.createObjectURL(new Blob([b], { type: 'application/vnd.sqlite3' }));
    Object.assign(document.createElement('a'), {
      href: u,
      download: `faturas-${hojeISO()}.sqlite3`
    }).click();
    setTimeout(() => URL.revokeObjectURL(u), 9000);
    toast('Backup .sqlite3 exportado');
  },
  vergrupo: d => {
    const grupo = JSON.parse(d.grupo);
    openSheet(verGrupo(grupo));
  },
  addrec: d => {
    const idx = +d.idx;
    const p = S.imp?.p;
    const rec = p?.recorrentesSugeridos?.[idx];
    if (!rec || !p) return;
    // Adiciona o item à lista de itens da importação
    p.itens.push({
      d: '', // data será preenchida depois se necessário
      s: rec.descricao,
      v: rec.valor.toFixed(2),
      n_parcelas: null,
      parcela_atual: null,
      grupo_parcela_id: null,
      recorrente: true,
      _rateioSugerido: rec.rateio // marca para aplicar rateio ao salvar
    });
    p.soma = p.itens.reduce((a, i) => a + (+i.v), 0).toFixed(2);
    // Remove da lista de sugeridos
    p.recorrentesSugeridos.splice(idx, 1);
    go();
  },
  togglerec: async d => {
    const grupo = JSON.parse(d.grupo);
    const { grupo_parcela_id, banco, descricao_base } = grupo;
    // Atualiza todos os lançamentos do grupo para recorrente=1
    if (grupo_parcela_id) {
      await q('UPDATE lancamentos SET recorrente = 1 WHERE grupo_parcela_id = ?', [grupo_parcela_id]);
    } else {
      // Para recorrentes identificados por descrição normalizada + banco
      // Busca os IDs em JS e atualiza
      const rows = (await q(`
        SELECT l.id
        FROM lancamentos l
        JOIN faturas f ON f.id = l.fatura_id
        JOIN bancos b ON b.id = f.banco_id
        WHERE b.nome = ? AND l.recorrente = 0
      `, [banco])).rows;
      const targetNorm = norm(descricao_base);
      const ids = rows.filter(r => norm(r.descricao) === targetNorm).map(r => r.id);
      if (ids.length) {
        await q(`UPDATE lancamentos SET recorrente = 1 WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
      }
    }
    closeSheet();
    toast('Marcado como assinatura mensal');
    go();
  }
};

// ==========================================================================
// Ouvintes de Eventos Globais
// ==========================================================================
document.addEventListener('click', e => {
  const a = e.target.closest('[data-a]');
  if (!a || a.tagName === 'SELECT') return;
  if (a.dataset.a === 'rpago') return;
  A[a.dataset.a]?.(a.dataset, a);
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fl' && t.files?.[0]) A.parse();
  if (t.dataset.a === 'rpago') A.rpago(t.dataset, t);
  if (t.tagName === 'SELECT' && t.dataset.a) A[t.dataset.a](t.dataset, t);
  if (t.closest?.('.rat-row')) rateioRest();
});

document.addEventListener('input', e => {
  if (e.target.classList.contains('rv')) rateioRest();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#sheetroot').hidden && !S.sheetLock) closeSheet();
  const a = e.target.closest?.('[data-a][role=button]');
  if (a && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    A[a.dataset.a]?.(a.dataset, a);
  }
});

window.addEventListener('online', () => S.tab && go());
window.addEventListener('offline', () => S.tab && go());

// Inicializa a visualização
go();
