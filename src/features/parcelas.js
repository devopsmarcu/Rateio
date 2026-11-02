// ==========================================================================
// Rateio de Faturas — Tela: Parcelas (Projeção de parcelas futuras e recorrências)
// ==========================================================================
import { S } from '../core/state.js';
import { esc, R, mesLabel, dataCurta } from '../core/format.js';
import { overlay, empty, monthSel, top, backBtn, ICO } from '../core/ui.js';
import { q, meses } from '../core/db.js';
import { norm } from './rateio.js';

async function parcelas() {
  overlay(0);
  const ms = await meses();

  // Busca todos os lançamentos com info de parcelas/recorrência
  // COALESCE garante que linhas antigas (NULL) sejam tratadas corretamente
  const rows = (await q(`
    SELECT l.*, f.mes_referencia, f.banco_id, b.nome banco, f.data_vencimento
    FROM lancamentos l
    JOIN faturas f ON f.id = l.fatura_id
    JOIN bancos b ON b.id = f.banco_id
    WHERE l.n_parcelas IS NOT NULL OR COALESCE(l.recorrente, 0) = 1
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
    // COALESCE para tratar linhas antigas onde recorrente é NULL
    const rows = (await q(`
      SELECT l.*, f.mes_referencia, f.data_vencimento, f.banco_id
      FROM lancamentos l
      JOIN faturas f ON f.id = l.fatura_id
      JOIN bancos b ON b.id = f.banco_id
      WHERE b.nome = ? AND COALESCE(l.recorrente, 0) = 1
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

export { parcelas, renderParcelasGrupos, verGrupo };
