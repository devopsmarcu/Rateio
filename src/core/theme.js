// ==========================================================================
// Rateio de Faturas — Gerenciamento de Tema
// ==========================================================================
import { $ } from './ui.js';

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

// Efeito colateral de inicialização: aplica o tema e registra o listener do sistema.
function initTheme() {
  applyTheme();
  matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => {
    if (themePref() === 'system') applyTheme();
  });
}

export { themePref, themeDark, applyTheme, initTheme };
