// ==========================================================================
// Rateio de Faturas — Parsing e Extração de Faturas
// ==========================================================================
import { S } from '../../core/state.js';
import { num, mesAtual } from '../../core/format.js';
import { $, openSheet } from '../../core/ui.js';
import { parc } from '../rateio.js';

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
  const m = await import(new URL('../../../lib/pdf.min.mjs', import.meta.url).href);
  m.GlobalWorkerOptions.workerSrc = new URL('../../../lib/pdf.worker.min.mjs', import.meta.url).href;
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

const plain = t => /<\/?(html|body|table|div|p|br)\b/i.test(t) ? html2txt(t) : t;

export { html2txt, utf, askPwd, pdfText, MS, MR, p2, mon, BANCOS, TOTAIS, SKIP, VO, parseFat, plain };
