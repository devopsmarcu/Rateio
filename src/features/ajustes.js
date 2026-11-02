// ==========================================================================
// Rateio de Faturas — Tela 12: Ajustes
// ==========================================================================
import { esc, APP_VER } from '../core/format.js';
import { overlay, ICO } from '../core/ui.js';
import { themePref } from '../core/theme.js';
import { oauthService } from '../integrations/oauth/service.js';

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

    <!-- Configuração Pix (para BR Code "copia e cola") -->
    <p class="section-label">Configuração Pix</p>
    <div class="group">
      <label class="cell">
        <span class="grow">
          <span class="field-label">Nome no Pix</span>
          <input id="pixNome" class="field bold" value="${esc(localStorage.pixNome || '')}" placeholder="Nome do recebedor (máx. 25 chars)" maxlength="25">
        </span>
        <button type="button" class="pill accent" data-a="spixnome">Salvar</button>
      </label>
      <label class="cell">
        <span class="grow">
          <span class="field-label">Cidade</span>
          <input id="pixCidade" class="field bold" value="${esc(localStorage.pixCidade || '')}" placeholder="Cidade (máx. 15 chars)" maxlength="15">
        </span>
        <button type="button" class="pill accent" data-a="spixcidade">Salvar</button>
      </label>
    </div>
    <p class="footnote">Usados para gerar o código Pix "copia e cola" (BR Code EMV) nas cobranças. O nome e a cidade devem conter apenas letras sem acento.</p>

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
      <button type="button" class="cell pressable" data-a="imp_sqlite">
        <span class="grow bold">Restaurar backup (.sqlite3)</span>
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

export { ajustes };
