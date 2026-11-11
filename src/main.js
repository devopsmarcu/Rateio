// ==========================================================================
// Rateio de Faturas — Bootstrap, Roteador e Delegação de Eventos
// Architecture: Pure Vanilla JS + SQLite WASM + OPFS + Service Worker
// ==========================================================================

import { S } from './core/state.js';
import { esc, f2, R, hojeISO } from './core/format.js';
import { $, toast, closeSheet, openSheet, confirmUI, emsg } from './core/ui.js';
import { initTheme, applyTheme } from './core/theme.js';
import { initDb, call, q, tx } from './core/db.js';
import { inicio } from './features/inicio.js';
import { faturas } from './features/faturas.js';
import { parcelas, verGrupo } from './features/parcelas.js';
import { pessoas, modalCobranca } from './features/pessoas.js';
import { cobrancas } from './features/cobrancas.js';
import { ajustes } from './features/ajustes.js';
import { norm, casar, cents, rateioRest, renderRateio, modalReaproveitamento } from './features/rateio.js';
import { gl, importarView, show, syncPreviewFields } from './features/importacao/view.js';
import { pdfText, utf } from './features/importacao/parse.js';
import { oauthService } from './integrations/oauth/service.js';

initTheme();

// ==========================================================================
// Retorno dos fluxos de autorização (Gmail e Outlook)
// ==========================================================================
// O Google é autorizado na página-ponte (oauth.html) e o resultado é recebido
// pelo serviço via BroadcastChannel — nada chega pela URL deste aplicativo.
// A Microsoft usa o redirecionamento do MSAL, cujo retorno é tratado abaixo.
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

// Comunicação com o SQLite Worker (OPFS)
initDb();

// ==========================================================================
// Roteador e Navegação
// ==========================================================================
const V = { inicio, faturas, parcelas, pessoas, cobrancas, ajustes };

export async function go(t) {
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
  mesc: (d, el) => {
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
  spixnome: () => {
    const n = $('#pixNome')?.value.trim();
    localStorage.pixNome = n;
    toast('Nome Pix salvo');
  },
  spixcidade: () => {
    const c = $('#pixCidade')?.value.trim();
    localStorage.pixCidade = c;
    toast('Cidade Pix salva');
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
    let a = S.g[d.pid];
    if (!a?.length) {
      const rows = (await q(`
        SELECT r.id, r.pago, r.valor_fracao v, l.descricao d, b.nome banco,
          f.mes_referencia, f.data_vencimento, p.nome, p.chave_pix, p.id pid
        FROM rateio_lancamento r
        JOIN lancamentos l ON l.id = r.lancamento_id
        JOIN faturas f ON f.id = l.fatura_id
        JOIN bancos b ON b.id = f.banco_id
        JOIN pessoas p ON p.id = r.pessoa_id
        WHERE r.pessoa_id = ? AND f.mes_referencia = ?
        ORDER BY b.nome COLLATE NOCASE, l.data_transacao DESC, l.id DESC
      `, [d.pid, S.mes])).rows;
      a = rows;
      S.g[d.pid] = rows;
    }
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
  copyemv: async d => {
    const txt = decodeURIComponent(d.txt);
    await navigator.clipboard.writeText(txt);
    toast('Código Pix copiado');
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
  imp_sqlite: async () => {
    const ok = await confirmUI(
      'Restaurar backup',
      '⚠️ ATENÇÃO: Esta ação substituirá TODOS os dados atuais (faturas, lançamentos, pessoas, rateios) pelo conteúdo do arquivo de backup. Esta ação é IRREVERSÍVEL.',
      'Confirmar restauração',
      1
    );
    if (!ok) return;
    closeSheet();
    const input = $('#fl_sqlite');
    if (!input) return toast('Erro: input de arquivo não encontrado');
    input.onchange = async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      if (!file.name.endsWith('.sqlite3')) return toast('Selecione um arquivo .sqlite3 válido');
      try {
        const buffer = await file.arrayBuffer();
        const result = await call('restore', buffer);
        if (result?.ok) {
          toast('Backup restaurado com sucesso! Recarregando...');
          // Recarrega completamente o estado
          S.fat = null;
          S.pessoa = null;
          S.imp = null;
          await go('inicio');
        } else {
          toast('Erro ao restaurar: ' + (result?.err || 'Erro desconhecido'));
        }
      } catch (e) {
        toast('Erro ao restaurar: ' + e.message);
      }
    };
    input.click();
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
