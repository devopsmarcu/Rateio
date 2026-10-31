// ==========================================================================
// Rateio de Faturas — Serviço de autenticação (Gmail e Outlook)
// ==========================================================================
//
// Implementação:
//  - Google  : Google Identity Services (GIS) + Gmail API.
//  - Microsoft: Microsoft Identity Platform via MSAL Browser + Microsoft Graph.
//
// Regras de segurança aplicadas (ver Seção 7 do enunciado):
//  - Nenhuma senha é solicitada ou transmitida ao aplicativo.
//  - Nenhum Client Secret no frontend (apenas Client IDs públicos).
//  - Tokens ficam apenas em sessionStorage (memória da aba), nunca em
//    localStorage, e são descartados ao fechar a aba.
//  - Tokens e conteúdo de e-mail nunca vão para logs.
//  - A desconexão limpa todo o estado local (não revoga autorizações remotas).

import { OAUTH_CONFIG, getRedirectUri, ADMIN_NOT_CONFIGURED_MSG } from './oauth-config.js';

const RELAY_CHANNEL = 'rateio-oauth';
const IMPORTED_KEY = 'rateio_imported_msgs';
const MAX_IMPORTED_KEYS = 300;

// --------------------------------------------------------------------------
// Erro com mensagem amigável para o usuário (Seção 9 do enunciado).
// --------------------------------------------------------------------------
export class OAuthError extends Error {
  constructor(userMessage, technical, cause) {
    super(userMessage);
    this.name = 'OAuthError';
    this.userMessage = userMessage;
    this.technical = technical || userMessage;
    this.cause = cause;
  }
}

const MSG = {
  adminNotConfigured: ADMIN_NOT_CONFIGURED_MSG,
  notConnected: 'Sua conta ainda não está conectada. Conecte-a para importar faturas.',
  offline: 'Você está offline. Conecte-se à internet para acessar suas mensagens.',
  cancelled: 'Você cancelou a autorização.',
  expired: 'A autorização expirou. Conecte sua conta novamente.',
  forbidden: 'Não foi possível acessar as mensagens. Verifique as permissões concedidas.',
  rateLimited: 'Não foi possível acessar as mensagens agora. Tente novamente em instantes.',
  interrupted: 'A conexão foi interrompida. Tente novamente.',
  generic: 'Não foi possível conectar sua conta. Tente novamente.'
};

// --------------------------------------------------------------------------
// Armazenamento de sessão (apenas sessionStorage).
// --------------------------------------------------------------------------
const STORAGE = {
  get: k => {
    try {
      return sessionStorage.getItem('oauth_' + k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      sessionStorage.setItem('oauth_' + k, v);
    } catch {}
  },
  remove: k => {
    try {
      sessionStorage.removeItem('oauth_' + k);
      // Remove também valores legados gravados em localStorage por versões antigas.
      localStorage.removeItem('oauth_' + k);
    } catch {}
  }
};

// Chaves sensíveis que versões antigas gravavam em localStorage.
const LEGACY_LOCAL_KEYS = [
  'oauth_google_token', 'oauth_google_exp', 'oauth_google_email', 'oauth_google_state',
  'oauth_microsoft_token', 'oauth_microsoft_exp', 'oauth_microsoft_email',
  'oauth_ms_verifier', 'oauth_ms_state',
  'gtk', 'gexp', 'mtk', 'mexp', 'mver', 'cid', 'mcid',
  'oauth_override_google_cid', 'oauth_override_ms_cid'
];

function purgeLegacyLocalKeys() {
  try {
    LEGACY_LOCAL_KEYS.forEach(k => localStorage.removeItem(k));
  } catch {}
}

// --------------------------------------------------------------------------
// Log de diagnóstico seguro: nunca imprime tokens nem conteúdo pessoal.
// --------------------------------------------------------------------------
const REDACT_RE = /(ya29\.[\w.-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+|bearer\s+[\w.-]+|access_token["'\s:=]+[\w.-]+)/gi;

export function redact(text) {
  return String(text ?? '').replace(REDACT_RE, '[redigido]');
}

function b64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function nonce() {
  try {
    return b64url(crypto.getRandomValues(new Uint8Array(12)));
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export class OAuthService {
  constructor() {
    this.redirectUri = getRedirectUri();
    this._msal = null;
    this._msalApp = null;
    purgeLegacyLocalKeys();
  }

  // ------------------------------------------------------------------
  // Diagnóstico
  // ------------------------------------------------------------------
  _diag(...parts) {
    try {
      console.warn('[oauth]', ...parts.map(redact));
    } catch {}
  }

  // ------------------------------------------------------------------
  // Estado e token
  // ------------------------------------------------------------------
  /**
   * @returns {{status:'nao_conectado'|'conectado'|'expirado', email:string|null}}
   */
  getStatus(provider) {
    if (provider === 'microsoft') {
      const account = STORAGE.get('microsoft_account');
      const email = STORAGE.get('microsoft_email');
      if (!account && !email) return { status: 'nao_conectado', email: null };
      // A renovação é feita pela MSAL (acquireTokenSilent), portanto a simples
      // existência da conta conectada já representa uma sessão utilizável.
      return { status: 'conectado', email: email || null };
    }

    const token = STORAGE.get(provider + '_token');
    if (!token) return { status: 'nao_conectado', email: null };
    const exp = +(STORAGE.get(provider + '_exp') || 0);
    if (exp && Date.now() > exp) {
      return { status: 'expirado', email: STORAGE.get(provider + '_email') || null };
    }
    return { status: 'conectado', email: STORAGE.get(provider + '_email') || null };
  }

  /** Token de acesso do Google (ou null se ausente/expirado). */
  getToken(provider) {
    if (provider !== 'google') return null;
    const token = STORAGE.get('google_token');
    const exp = +(STORAGE.get('google_exp') || 0);
    if (token && exp && Date.now() > exp) return null;
    return token;
  }

  isGoogleConfigured() {
    return OAUTH_CONFIG.google.isConfigured();
  }

  isMicrosoftConfigured() {
    return OAUTH_CONFIG.microsoft.isConfigured();
  }

  // ==================================================================
  // GOOGLE — Google Identity Services (via página ponte) + Gmail API
  // ==================================================================

  /**
   * Inicia o fluxo oficial do Google. O popup do GIS é aberto pela página
   * ponte (oauth.html), servida sem COOP, e o resultado retorna por
   * BroadcastChannel. Assim o OPFS/COOP do aplicativo principal é preservado.
   */
  async startGoogleAuth() {
    if (!this.isGoogleConfigured()) throw new OAuthError(MSG.adminNotConfigured, 'google_client_id_missing');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OAuthError(MSG.offline, 'offline');
    if (typeof BroadcastChannel === 'undefined') throw new OAuthError(MSG.generic, 'broadcastchannel_unavailable');

    const n = nonce();
    const url = new URL('oauth.html', window.location.href);
    url.hash = `provider=google&nonce=${n}`;

    return new Promise((resolve, reject) => {
      let settled = false;
      let ready = false;
      let timer = null;
      let blockedTimer = null;
      const ch = new BroadcastChannel(RELAY_CHANNEL);

      const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(blockedTimer);
        try { ch.close(); } catch {}
      };
      const finish = err => {
        if (settled) return;
        settled = true;
        cleanup();
        err ? reject(err) : resolve();
      };

      ch.onmessage = async ev => {
        const d = ev?.data;
        if (!d || d.channel !== RELAY_CHANNEL || d.provider !== 'google') return;
        if (d.nonce && d.nonce !== n) return; // ignora mensagens de outra sessão
        if (d.type === 'ready') {
          // A ponte abriu corretamente: não se trata de popup bloqueado.
          ready = true;
          clearTimeout(blockedTimer);
          return;
        }
        if (!d.ok) {
          const reason = d.reason || 'unknown_error';
          return finish(reason === 'cancelled'
            ? new OAuthError(MSG.cancelled, reason)
            : new OAuthError(MSG.generic, reason));
        }
        try {
          await this._storeGoogleToken(d.token, d.expiresIn);
          finish(null);
        } catch (e) {
          finish(e instanceof OAuthError ? e : new OAuthError(MSG.interrupted, 'store_failed', e));
        }
      };

      // A janela ponte é servida sem COOP; por isso ela "aparece fechada" para o
      // aplicativo (severing). A comunicação se dá exclusivamente por BroadcastChannel,
      // e a abertura é confirmada pela mensagem "ready" enviada pela própria ponte.
      const win = window.open(url.toString(), 'rateio-oauth', 'popup=yes,width=480,height=680');
      if (!win) return finish(new OAuthError(MSG.interrupted, 'popup_blocked'));

      blockedTimer = setTimeout(() => {
        if (!ready) finish(new OAuthError(MSG.interrupted, 'popup_blocked'));
      }, 6000);
      timer = setTimeout(() => finish(new OAuthError(MSG.interrupted, 'timeout')), 5 * 60 * 1000);
    });
  }

  /** Guarda o token do Google e busca o e-mail conectado. */
  async _storeGoogleToken(accessToken, expiresIn) {
    if (!accessToken) throw new OAuthError(MSG.generic, 'empty_token');
    const expTime = Date.now() + (parseInt(expiresIn, 10) || 3600) * 1000;
    STORAGE.set('google_token', accessToken);
    STORAGE.set('google_exp', String(expTime));
    try {
      const profile = await this.getGoogleProfile(accessToken);
      if (profile?.emailAddress) STORAGE.set('google_email', profile.emailAddress);
    } catch (e) {
      this._diag('perfil do Google indisponível:', e?.message);
    }
  }

  async getGoogleProfile(tokenOverride) {
    const token = tokenOverride || this.getToken('google');
    if (!token) throw new OAuthError(MSG.notConnected, 'no_token');
    const res = await this._fetchWithRetry(OAUTH_CONFIG.google.profileEndpoint, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw this._httpError(res, 'google');
    return res.json();
  }

  async disconnectGoogle() {
    const token = STORAGE.get('google_token');
    if (token) {
      try {
        await fetch(`${OAUTH_CONFIG.google.tokenRevokeEndpoint}?token=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
      } catch (e) {
        this._diag('falha ao revogar token do Google:', e?.message);
      }
    }
    ['google_token', 'google_exp', 'google_email', 'google_state'].forEach(k => STORAGE.remove(k));
  }

  async searchGmail(query, maxResults = 12, pageToken = '') {
    const token = this.getToken('google');
    if (!token) throw new OAuthError(MSG.expired, 'google_no_token');

    const url = new URL(`${OAUTH_CONFIG.google.apiBase}/messages`);
    url.searchParams.set('q', query || OAUTH_CONFIG.google.defaultQuery);
    url.searchParams.set('maxResults', String(maxResults));
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await this._fetchWithRetry(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw this._httpError(res, 'google');

    const data = await res.json();
    const ids = data.messages || [];

    const detailed = await Promise.all(ids.map(async m => {
      try {
        return await this.getGmailMessage(m.id);
      } catch (e) {
        this._diag('mensagem ignorada:', e?.message);
        return null;
      }
    }));

    return {
      messages: detailed.filter(Boolean),
      nextPage: data.nextPageToken || null,
      estimate: data.resultSizeEstimate || ids.length
    };
  }

  async getGmailMessage(id) {
    const token = this.getToken('google');
    const res = await this._fetchWithRetry(`${OAUTH_CONFIG.google.apiBase}/messages/${id}?format=full`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw this._httpError(res, 'google');
    const d = await res.json();

    const headers = d.payload?.headers || [];
    const h = n => headers.find(x => x.name?.toLowerCase() === n.toLowerCase())?.value || '';

    const raw = [];
    const walk = p => {
      if (!p) return;
      if (p.filename && (p.body?.attachmentId || p.body?.data)) {
        raw.push({
          id: p.body.attachmentId || null,
          name: p.filename,
          size: p.body.size || 0,
          mimeType: p.mimeType,
          download: async () => {
            if (p.body.data) return this._decodeBase64(p.body.data);
            const r = await this._fetchWithRetry(
              `${OAUTH_CONFIG.google.apiBase}/messages/${id}/attachments/${p.body.attachmentId}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!r.ok) throw this._httpError(r, 'google');
            return this._decodeBase64((await r.json()).data);
          }
        });
      }
      if (p.parts) p.parts.forEach(walk);
    };
    walk(d.payload);

    return this._normalize('google', {
      id: d.id,
      subject: h('Subject'),
      from: h('From'),
      date: h('Date'),
      snippet: d.snippet,
      body: this._extractGmailBody(d.payload),
      attachments: raw
    });
  }

  // ==================================================================
  // MICROSOFT — MSAL Browser (Authorization Code + PKCE) + Graph
  // ==================================================================

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined') return reject(new Error('no_dom'));
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('script_load_failed:' + src));
      document.head.appendChild(s);
    });
  }

  async _loadMsal() {
    if (typeof window !== 'undefined' && window.msal) return window.msal;
    await this._loadScript(OAUTH_CONFIG.microsoft.msalScriptUrl);
    if (!window.msal) throw new OAuthError(MSG.generic, 'msal_unavailable');
    return window.msal;
  }

  async _getMsalApp() {
    if (this._msalApp) return this._msalApp;
    const msal = await this._loadMsal();
    this._msal = msal;
    this._msalApp = new msal.PublicClientApplication({
      auth: {
        clientId: OAUTH_CONFIG.microsoft.clientId,
        authority: OAUTH_CONFIG.microsoft.authority,
        redirectUri: this.redirectUri
      },
      // Tokens permanecem no sessionStorage da aba; nada em localStorage.
      cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false }
    });
    return this._msalApp;
  }

  /**
   * Processa o retorno do redirect do Microsoft (se houver) e restaura o
   * estado da conta. Deve ser chamado uma vez na inicialização do aplicativo.
   * @returns {Promise<{email:string|null, redirect:boolean}|null>}
   */
  async initMicrosoft() {
    if (!this.isMicrosoftConfigured()) return null;
    try {
      const app = await this._getMsalApp();
      const resp = await app.handleRedirectPromise();
      const account = resp?.account || app.getAllAccounts()[0] || null;
      if (account) {
        await this._rememberMsAccount(account);
        // `redirect` indica que esta página é o retorno de um login interativo.
        return { email: account.username || null, redirect: !!resp };
      }
      return null;
    } catch (e) {
      this._diag('falha ao processar retorno da Microsoft:', e?.message);
      return null;
    }
  }

  async startMicrosoftAuth() {
    if (!this.isMicrosoftConfigured()) throw new OAuthError(MSG.adminNotConfigured, 'microsoft_client_id_missing');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OAuthError(MSG.offline, 'offline');
    try {
      const app = await this._getMsalApp();
      await app.handleRedirectPromise().catch(() => {});
      await app.loginRedirect({ scopes: OAUTH_CONFIG.microsoft.scopes, prompt: 'select_account' });
    } catch (e) {
      if (e && e.errorCode === 'interaction_in_progress') throw new OAuthError(MSG.interrupted, 'interaction_in_progress', e);
      throw new OAuthError(MSG.generic, e?.errorCode || e?.message, e);
    }
  }

  async _rememberMsAccount(account) {
    STORAGE.set('microsoft_account', account.homeAccountId || account.localAccountId || 'conectado');
    if (account.username) STORAGE.set('microsoft_email', account.username);
  }

  /** Obtém um token do Graph renovando silenciosamente quando necessário. */
  async _getMsToken() {
    let app;
    try {
      app = await this._getMsalApp();
    } catch (e) {
      if (e instanceof OAuthError) throw e;
      this._diag('Microsoft indisponivel:', e?.message);
      throw new OAuthError(MSG.interrupted, 'msal_unavailable', e);
    }
    const account = app?.getAllAccounts?.()[0];
    if (!account) throw new OAuthError(MSG.expired, 'microsoft_no_account');
    try {
      const r = await app.acquireTokenSilent({
        scopes: OAUTH_CONFIG.microsoft.scopes,
        account
      });
      if (r?.expiresOn) STORAGE.set('microsoft_exp', String(new Date(r.expiresOn).getTime()));
      return r.accessToken;
    } catch (e) {
      const msal = this._msal;
      if (msal?.InteractionRequiredAuthError && e instanceof msal.InteractionRequiredAuthError) {
        this._clearMsStorage();
        throw new OAuthError(MSG.expired, 'interaction_required', e);
      }
      this._diag('falha ao renovar token da Microsoft:', e?.errorCode || e?.message);
      throw new OAuthError(MSG.interrupted, e?.errorCode || 'silent_failed', e);
    }
  }

  _clearMsStorage() {
    ['microsoft_account', 'microsoft_email', 'microsoft_exp'].forEach(k => STORAGE.remove(k));
  }

  async getMicrosoftProfile() {
    const token = await this._getMsToken();
    const res = await this._fetchWithRetry(OAUTH_CONFIG.microsoft.meEndpoint, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw this._httpError(res, 'microsoft');
    return res.json();
  }

  async disconnectMicrosoft() {
    try {
      if (this._msalApp) this._msalApp.clearCache();
    } catch (e) {
      this._diag('falha ao limpar cache da Microsoft:', e?.message);
    }
    this._clearMsStorage();
  }

  async searchOutlook(query, top = 12, nextLink = '') {
    const token = await this._getMsToken();

    let url = nextLink;
    if (!url) {
      const u = new URL(OAUTH_CONFIG.microsoft.messagesEndpoint);
      u.searchParams.set('$top', String(top));
      u.searchParams.set('$select', 'id,subject,from,bodyPreview,body,hasAttachments,receivedDateTime');
      u.searchParams.set('$search', `"${query || OAUTH_CONFIG.microsoft.defaultQuery}"`);
      url = u.toString();
    }

    const res = await this._fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw this._httpError(res, 'microsoft');

    const data = await res.json();
    const items = data.value || [];

    return {
      messages: items.map(m => this._normalize('microsoft', {
        id: m.id,
        subject: m.subject,
        from: m.from?.emailAddress?.address || m.from?.emailAddress?.name || '',
        date: m.receivedDateTime,
        snippet: m.bodyPreview,
        body: m.body?.content || '',
        attachments: m.hasAttachments ? () => this._outlookAttachments(m.id) : null
      })),
      nextPage: data['@odata.nextLink'] || null
    };
  }

  async _outlookAttachments(id) {
    const token = await this._getMsToken();
    const res = await this._fetchWithRetry(
      `${OAUTH_CONFIG.microsoft.graphBase}/me/messages/${id}/attachments?$select=id,name,size,contentType`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw this._httpError(res, 'microsoft');
    const d = await res.json();
    return (d.value || []).map(a => ({
      id: a.id,
      name: a.name,
      size: a.size || 0,
      mimeType: a.contentType,
      download: async () => {
        const t = await this._getMsToken();
        const r = await this._fetchWithRetry(
          `${OAUTH_CONFIG.microsoft.graphBase}/me/messages/${id}/attachments/${a.id}`,
          { headers: { Authorization: `Bearer ${t}` } }
        );
        if (!r.ok) throw this._httpError(r, 'microsoft');
        return this._decodeBase64((await r.json()).contentBytes);
      }
    }));
  }

  // ==================================================================
  // CAMADA DE NORMALIZAÇÃO (Seção 6 do enunciado)
  // ==================================================================
  /**
   * Converte mensagens do Gmail e do Outlook em um formato único, para que o
   * restante do aplicativo (o único parser de faturas) não precise conhecer as
   * diferenças entre as duas APIs.
   */
  _normalize(provider, m) {
    const loader = typeof m.attachments === 'function' ? m.attachments : async () => (m.attachments || []);
    let cached = null;
    return {
      provider,
      key: `${provider}:${m.id}`,
      id: m.id,
      subject: m.subject || '(sem assunto)',
      from: m.from || '',
      date: m.date || '',
      snippet: m.snippet || '',
      body: m.body || '',
      get hasAttachments() {
        return !!(m.attachments && (typeof m.attachments === 'function' || m.attachments.length));
      },
      /** Lista somente anexos que os parsers locais sabem ler (PDF/HTML/TXT). */
      listAttachments: async () => {
        if (!cached) {
          const all = (await loader()) || [];
          cached = all.filter(a => /\.(pdf|html?|txt)$/i.test(a.name || ''));
        }
        return cached;
      }
    };
  }

  // ==================================================================
  // PREVENÇÃO DE DUPLICIDADE (Seção 6 do enunciado)
  // ==================================================================
  /** @returns {Set<string>} chaves de mensagens já importadas */
  _importedSet() {
    try {
      const raw = JSON.parse(localStorage.getItem(IMPORTED_KEY) || '[]');
      return new Set(Array.isArray(raw) ? raw : []);
    } catch {
      return new Set();
    }
  }

  isImported(key) {
    if (!key) return false;
    return this._importedSet().has(key);
  }

  markImported(key) {
    if (!key) return;
    try {
      const set = this._importedSet();
      set.add(key);
      const arr = [...set].slice(-MAX_IMPORTED_KEYS);
      localStorage.setItem(IMPORTED_KEY, JSON.stringify(arr));
    } catch {}
  }

  // ==================================================================
  // Helpers internos
  // ==================================================================
  _httpError(res, provider) {
    const name = provider === 'google' ? 'Gmail' : 'Outlook';
    if (res.status === 401) {
      if (provider === 'google') {
        STORAGE.remove('google_token');
        STORAGE.remove('google_exp');
      } else {
        this._clearMsStorage();
      }
      return new OAuthError(MSG.expired, `${name}_401`);
    }
    if (res.status === 403) return new OAuthError(MSG.forbidden, `${name}_403`);
    if (res.status === 429) return new OAuthError(MSG.rateLimited, `${name}_429`);
    return new OAuthError(MSG.interrupted, `${name}_${res.status}`);
  }

  async _fetchWithRetry(url, options, retries = 2) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (e) {
      throw new OAuthError(MSG.interrupted, 'network_error', e);
    }
    if (res.status === 429 && retries > 0) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '2', 10);
      const delay = Math.min(Math.max(retryAfter, 1), 10) * 1000;
      await new Promise(r => setTimeout(r, delay));
      return this._fetchWithRetry(url, options, retries - 1);
    }
    return res;
  }

  _decodeBase64(str) {
    if (!str) return new Uint8Array(0);
    const clean = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(clean);
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  }

  _extractGmailBody(payload) {
    let html = '', text = '';
    const walk = p => {
      if (!p) return;
      if (p.mimeType === 'text/html' && p.body?.data) {
        html = new TextDecoder().decode(this._decodeBase64(p.body.data));
      } else if (p.mimeType === 'text/plain' && p.body?.data) {
        text = new TextDecoder().decode(this._decodeBase64(p.body.data));
      }
      if (p.parts) p.parts.forEach(walk);
    };
    walk(payload);
    return html || text;
  }
}

// Instância única usada em todo o aplicativo.
export const oauthService = new OAuthService();
