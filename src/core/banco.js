// ==========================================================================
// Rateio de Faturas — Helpers de banco (metadados visuais e células)
// ==========================================================================
import { esc, R, vencida, diverge, dataCurta, mesCurto, hojeISO } from './format.js';
import { ICO } from './ui.js';

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

export { bancoMeta, vencimentoInfo, faturaEstado, faturaCell };
