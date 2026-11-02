// ==========================================================================
// Rateio de Faturas — Formatação e utilitários de número/data
// ==========================================================================

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

export { esc, R, f2, num, APP_VER, hojeISO, mesAtual, mesLabel, mesCurto, dataCurta, vencida, proxVenc, diverge, parcInfo };
