// ==========================================================================
// Rateio de Faturas — Helpers de Interface (DOM, ícones, folhas e componentes)
// ==========================================================================
import { S } from './state.js';
import { esc, mesLabel } from './format.js';

const $ = s => document.querySelector(s);

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

const emsg = e => (e && e.userMessage) || 'Não foi possível concluir a operação. Tente novamente.';

export { $, svg, ICO, overlay, toast, closeSheet, openSheet, confirmUI, top, backBtn, monthSel, empty, steps, emsg };
