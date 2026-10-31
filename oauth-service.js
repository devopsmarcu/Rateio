// ==========================================================================
// Rateio de Faturas — Serviço Unificado de Autenticação OAuth 2.0
// Provedores: Google (Gmail API) e Microsoft (Microsoft Graph / Outlook)
// ==========================================================================

import { OAUTH_CONFIG, getRedirectUri } from './oauth-config.js';

// Utilitários de codificação Base64URL para PKCE
function b64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Armazenamento de sessão seguro (sessionStorage para tokens de curta duração)
const STORAGE = {
  get: k => {
    try {
      return sessionStorage.getItem('oauth_' + k) || localStorage.getItem('oauth_' + k);
    } catch {
      return null;
    }
  },
  set: (k, v, persist = false) => {
    try {
      sessionStorage.setItem('oauth_' + k, v);
      // Para manter a sessão após redirects em navegadores móveis, salvamos metadados de sessão
      if (persist) localStorage.setItem('oauth_' + k, v);
    } catch {}
  },
  remove: k => {
    try {
      sessionStorage.removeItem('oauth_' + k);
      localStorage.removeItem('oauth_' + k);
    } catch {}
  }
};

export class OAuthService {
  constructor() {
    this.redirectUri = getRedirectUri();
  }

  // ------------------------------------------------------------------------
  // Gerenciamento de Estado de Conexão
  // ------------------------------------------------------------------------

  /**
   * Retorna o estado do provedor ('google' | 'microsoft')
   * Estados possíveis: 'nao_conectado', 'conectado', 'expirado', 'erro'
   */
  getStatus(provider) {
    const token = this.getToken(provider);
    if (!token) return { status: 'nao_conectado', email: null };

    const exp = +(STORAGE.get(provider + '_exp') || 0);
    if (exp && Date.now() > exp) {
      return {
        status: 'expirado',
        email: STORAGE.get(provider + '_email'),
        error: 'Sessão expirada. Toque para reconectar.'
      };
    }

    return {
      status: 'conectado',
      email: STORAGE.get(provider + '_email'),
      expiresAt: exp
    };
  }

  getToken(provider) {
    const token = STORAGE.get(provider + '_token');
    const exp = +(STORAGE.get(provider + '_exp') || 0);
    if (token && exp && Date.now() > exp) {
      return null; // Token expirado
    }
    return token;
  }

  // ------------------------------------------------------------------------
  // Fluxo Google Identity / Gmail OAuth 2.0
  // ------------------------------------------------------------------------

  isGoogleConfigured() {
    return OAUTH_CONFIG.google.isConfigured();
  }

  async startGoogleAuth() {
    const cid = OAUTH_CONFIG.google.getClientId();
    if (!cid || cid.startsWith('SEU_')) {
      throw new Error('Client ID do Google não configurado. Defina em Ajustes ou em oauth-config.js.');
    }

    if (!navigator.onLine) {
      throw new Error('A conexão com o Gmail requer acesso à internet.');
    }

    // Salva estado da sessão antes do redirecionamento
    const state = 'g_' + Math.random().toString(36).substring(2, 10);
    STORAGE.set('google_state', state, true);

    const params = new URLSearchParams({
      client_id: cid,
      redirect_uri: this.redirectUri,
      response_type: 'token',
      scope: OAUTH_CONFIG.google.scopes.join(' '),
      include_granted_scopes: 'true',
      state: state,
      prompt: 'consent'
    });

    window.location.href = `${OAUTH_CONFIG.google.authEndpoint}?${params.toString()}`;
  }

  async completeGoogleAuth(accessToken, expiresIn, state) {
    const savedState = STORAGE.get('google_state');
    // Validação de state CSRF
    if (savedState && state && state !== savedState && !state.startsWith('g')) {
      console.warn('OAuth state mismatch:', state, savedState);
    }
    STORAGE.remove('google_state');

    const expTime = Date.now() + (parseInt(expiresIn, 10) || 3600) * 1000;
    STORAGE.set('google_token', accessToken, true);
    STORAGE.set('google_exp', String(expTime), true);

    // Buscar perfil para exibir o email conectado
    try {
      const profile = await this.getGoogleProfile(accessToken);
      if (profile?.emailAddress) {
        STORAGE.set('google_email', profile.emailAddress, true);
      }
    } catch (e) {
      console.warn('Erro ao obter perfil do Google:', e);
      STORAGE.set('google_email', 'Conta Google Conectada', true);
    }
  }

  async getGoogleProfile(tokenOverride) {
    const token = tokenOverride || this.getToken('google');
    if (!token) throw new Error('Não autenticado no Google.');

    const res = await fetch(OAUTH_CONFIG.google.profileEndpoint, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      if (res.status === 401) {
        STORAGE.remove('google_token');
        throw new Error('Sessão expirada. Reconecte o Gmail.');
      }
      throw new Error(`Erro ao consultar perfil Gmail (${res.status}).`);
    }

    return res.json();
  }

  async disconnectGoogle() {
    const token = STORAGE.get('google_token');
    if (token) {
      try {
        // Revogação de token na API do Google
        await fetch(`${OAUTH_CONFIG.google.tokenRevokeEndpoint}?token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
      } catch (e) {
        console.warn('Erro ao revogar token Google:', e);
      }
    }

    STORAGE.remove('google_token');
    STORAGE.remove('google_exp');
    STORAGE.remove('google_email');
    STORAGE.remove('google_state');
    localStorage.removeItem('gtk');
    localStorage.removeItem('gexp');
  }

  async searchGmail(query, maxResults = 12, pageToken = '') {
    const token = this.getToken('google');
    if (!token) throw new Error('Conta Gmail não conectada ou sessão expirada.');

    const q = query || OAUTH_CONFIG.google.defaultQuery;
    const url = new URL(`${OAUTH_CONFIG.google.apiBase}/messages`);
    url.searchParams.set('q', q);
    url.searchParams.set('maxResults', String(maxResults));
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await this._fetchWithRetry(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Sessão do Gmail expirada. Reconecte a conta.');
      }
      if (res.status === 403) {
        throw new Error('Permissões insuficientes no Gmail. Verifique o consentimento.');
      }
      if (res.status === 429) {
        throw new Error('Limite de requisições excedido no Google. Aguarde alguns instantes.');
      }
      throw new Error(`Erro ao buscar mensagens no Gmail (${res.status}).`);
    }

    const data = await res.json();
    const messages = data.messages || [];

    // Detalhar cada mensagem retornada
    const detailed = await Promise.all(
      messages.map(async m => {
        try {
          return await this.getGmailMessage(m.id);
        } catch {
          return null;
        }
      })
    );

    return {
      messages: detailed.filter(Boolean),
      nextPageToken: data.nextPageToken || null,
      resultSizeEstimate: data.resultSizeEstimate || messages.length
    };
  }

  async getGmailMessage(id) {
    const token = this.getToken('google');
    const res = await fetch(`${OAUTH_CONFIG.google.apiBase}/messages/${id}?format=full`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`Falha ao obter mensagem ${id}`);
    const d = await res.json();

    const headers = d.payload?.headers || [];
    const getHeader = n => headers.find(h => h.name?.toLowerCase() === n.toLowerCase())?.value || '';

    // Extrair anexos e corpo
    const attachments = [];
    const extractParts = p => {
      if (!p) return;
      if (p.filename && (p.body?.attachmentId || p.body?.data)) {
        attachments.push({
          id: p.body.attachmentId,
          name: p.filename,
          size: p.body.size || 0,
          mimeType: p.mimeType,
          get: async () => {
            if (p.body.data) return this._decodeBase64(p.body.data);
            const attRes = await fetch(`${OAUTH_CONFIG.google.apiBase}/messages/${id}/attachments/${p.body.attachmentId}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!attRes.ok) throw new Error('Falha ao baixar anexo do Gmail.');
            const attData = await attRes.json();
            return this._decodeBase64(attData.data);
          }
        });
      }
      if (p.parts) p.parts.forEach(extractParts);
    };
    extractParts(d.payload);

    return {
      id: d.id,
      threadId: d.threadId,
      subject: getHeader('Subject') || '(sem assunto)',
      from: getHeader('From') || '',
      date: getHeader('Date') || '',
      snippet: d.snippet || '',
      body: this._extractGmailBody(d.payload),
      attachments: attachments.filter(a => /\.(pdf|html?|txt)$/i.test(a.name))
    };
  }

  // ------------------------------------------------------------------------
  // Fluxo Microsoft Identity / Outlook (OAuth 2.0 Authorization Code + PKCE)
  // ------------------------------------------------------------------------

  isMicrosoftConfigured() {
    return OAUTH_CONFIG.microsoft.isConfigured();
  }

  async startMicrosoftAuth() {
    const cid = OAUTH_CONFIG.microsoft.getClientId();
    if (!cid || cid.startsWith('SEU_')) {
      throw new Error('Client ID da Microsoft não configurado. Defina em Ajustes ou em oauth-config.js.');
    }

    if (!navigator.onLine) {
      throw new Error('A conexão com o Outlook requer acesso à internet.');
    }

    // Gerar PKCE Verifier (43-128 caracteres) e Challenge
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = b64url(randomBytes);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = b64url(hash);

    STORAGE.set('ms_verifier', verifier, true);
    const state = 'ms_' + Math.random().toString(36).substring(2, 10);
    STORAGE.set('ms_state', state, true);

    const params = new URLSearchParams({
      client_id: cid,
      response_type: 'code',
      response_mode: 'fragment', // Evita perda de parâmetros no roteamento do GitHub Pages
      redirect_uri: this.redirectUri,
      scope: OAUTH_CONFIG.microsoft.scopes.join(' '),
      state: state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account'
    });

    window.location.href = `${OAUTH_CONFIG.microsoft.authEndpoint}?${params.toString()}`;
  }

  async completeMicrosoftAuth(code, state) {
    const savedState = STORAGE.get('ms_state');
    if (savedState && state && state !== savedState && !state.startsWith('ms')) {
      console.warn('OAuth state mismatch Microsoft:', state, savedState);
    }
    STORAGE.remove('ms_state');

    const verifier = STORAGE.get('ms_verifier');
    STORAGE.remove('ms_verifier');

    if (!verifier) {
      throw new Error('Code verifier do PKCE não encontrado. Inicie a autorização novamente.');
    }

    const cid = OAUTH_CONFIG.microsoft.getClientId();
    const tokenRes = await fetch(OAUTH_CONFIG.microsoft.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cid,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.redirectUri,
        code_verifier: verifier,
        scope: OAUTH_CONFIG.microsoft.scopes.join(' ')
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Falha ao trocar código por token no Microsoft Identity.');
    }

    const expTime = Date.now() + (parseInt(tokenData.expires_in, 10) || 3600) * 1000;
    STORAGE.set('microsoft_token', tokenData.access_token, true);
    STORAGE.set('microsoft_exp', String(expTime), true);

    // Buscar perfil do usuário para exibir email conectado
    try {
      const profile = await this.getMicrosoftProfile(tokenData.access_token);
      const email = profile?.mail || profile?.userPrincipalName || 'Conta Microsoft Conectada';
      STORAGE.set('microsoft_email', email, true);
    } catch (e) {
      console.warn('Erro ao obter perfil Microsoft:', e);
      STORAGE.set('microsoft_email', 'Conta Microsoft Conectada', true);
    }
  }

  async getMicrosoftProfile(tokenOverride) {
    const token = tokenOverride || this.getToken('microsoft');
    if (!token) throw new Error('Não autenticado na Microsoft.');

    const res = await fetch(OAUTH_CONFIG.microsoft.meEndpoint, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      if (res.status === 401) {
        STORAGE.remove('microsoft_token');
        throw new Error('Sessão expirada. Reconecte o Outlook.');
      }
      throw new Error(`Erro ao consultar perfil Microsoft (${res.status}).`);
    }

    return res.json();
  }

  async disconnectMicrosoft() {
    STORAGE.remove('microsoft_token');
    STORAGE.remove('microsoft_exp');
    STORAGE.remove('microsoft_email');
    STORAGE.remove('ms_verifier');
    STORAGE.remove('ms_state');
    localStorage.removeItem('mtk');
    localStorage.removeItem('mexp');
    localStorage.removeItem('mver');
  }

  async searchOutlook(query, top = 12, nextLink = '') {
    const token = this.getToken('microsoft');
    if (!token) throw new Error('Conta Outlook não conectada ou sessão expirada.');

    let url = nextLink;
    if (!url) {
      const q = query || OAUTH_CONFIG.microsoft.defaultQuery;
      const u = new URL(OAUTH_CONFIG.microsoft.messagesEndpoint);
      u.searchParams.set('$top', String(top));
      u.searchParams.set('$select', 'id,subject,from,body,hasAttachments,receivedDateTime');
      u.searchParams.set('$search', `"${q}"`);
      url = u.toString();
    }

    const res = await this._fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Sessão do Outlook expirada. Reconecte a conta.');
      }
      if (res.status === 403) {
        throw new Error('Permissões insuficientes no Microsoft Graph.');
      }
      if (res.status === 429) {
        throw new Error('Limite de requisições excedido na Microsoft. Aguarde alguns instantes.');
      }
      throw new Error(`Erro ao buscar mensagens no Outlook (${res.status}).`);
    }

    const data = await res.json();
    const items = data.value || [];

    const messages = items.map(m => ({
      id: m.id,
      subject: m.subject || '(sem assunto)',
      from: m.from?.emailAddress?.address || m.from?.emailAddress?.name || '',
      date: m.receivedDateTime || '',
      body: m.body?.content || '',
      hasAttachments: !!m.hasAttachments,
      atts: m.hasAttachments ? () => this.getOutlookAttachments(m.id) : null
    }));

    return {
      messages,
      nextLink: data['@odata.nextLink'] || null
    };
  }

  async getOutlookAttachments(id) {
    const token = this.getToken('microsoft');
    const res = await fetch(`${OAUTH_CONFIG.microsoft.graphBase}/me/messages/${id}/attachments?$select=id,name,size,contentType`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Falha ao listar anexos do Outlook.');
    const d = await res.json();

    return (d.value || []).map(a => ({
      id: a.id,
      name: a.name,
      size: a.size || 0,
      contentType: a.contentType,
      get: async () => {
        const fullRes = await fetch(`${OAUTH_CONFIG.microsoft.graphBase}/me/messages/${id}/attachments/${a.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!fullRes.ok) throw new Error('Falha ao baixar anexo do Outlook.');
        const fullData = await fullRes.json();
        return this._decodeBase64(fullData.contentBytes);
      }
    })).filter(a => /\.(pdf|html?|txt)$/i.test(a.name));
  }

  // ------------------------------------------------------------------------
  // Métodos Utilitários Internos
  // ------------------------------------------------------------------------

  async _fetchWithRetry(url, options, retries = 2) {
    const res = await fetch(url, options);

    // Tratamento de HTTP 429 Too Many Requests com Retry-After
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

// Instância singleton para uso em todo o aplicativo
export const oauthService = new OAuthService();
