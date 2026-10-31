/**
 * test_oauth.mjs — Suite de testes para oauth-service.js
 * Execução: node test_oauth.mjs
 */
import { webcrypto } from 'node:crypto';
// Node v22+ expõe globalThis.crypto nativamente; só sobrescrevemos se não existir
try { if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, writable: true }); }
catch { /* ja existe — ok */ }

class MemStorage {
  constructor() { this._d = {}; }
  getItem(k)    { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; }
  setItem(k, v) { this._d[k] = String(v); }
  removeItem(k) { delete this._d[k]; }
  clear()       { this._d = {}; }
  get length()  { return Object.keys(this._d).length; }
  key(i)        { return Object.keys(this._d)[i] ?? null; }
}
function defineGlobal(k, v) {
  try { globalThis[k] = v; } catch {
    try { Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true }); } catch {}
  }
}
defineGlobal('localStorage',   new MemStorage());
defineGlobal('sessionStorage', new MemStorage());
const _loc = { href: 'http://localhost:8080/', origin: 'http://localhost:8080', pathname: '/' };
defineGlobal('window',   { location: _loc });
defineGlobal('location', _loc);
defineGlobal('navigator', { onLine: true });

let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2705 ${name}`);
    passed++;
  } catch (e) {
    console.error(`  \u274c ${name}\n     ${e.message}`);
    failed++;
  }
}

function assert(cond, msg = 'Assertion failed') {
  if (!cond) throw new Error(msg);
}
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function resetStorage() {
  localStorage.clear();
  sessionStorage.clear();
}

let _fetchMock = null;
globalThis.fetch = async (url, opts) => {
  if (_fetchMock) return _fetchMock(url, opts);
  throw new Error('fetch nao mockado');
};
function mockFetchOnce(resp) { _fetchMock = async () => resp; }
function mockFetch(impl) { _fetchMock = impl; }
function mockFetchSequence(resps) {
  let i = 0;
  _fetchMock = async () => {
    if (i >= resps.length) throw new Error('fetch chamado mais vezes que o esperado');
    return resps[i++];
  };
}
function makeFetchResp(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

const { OAUTH_CONFIG, getRedirectUri, ADMIN_NOT_CONFIGURED_MSG } = await import('./oauth-config.js');
const { OAuthService, OAuthError, redact }                     = await import('./oauth-service.js');

// ---------------------------------------------------------------------------
// Grupo 1: Utilitarios e Configuracao
// ---------------------------------------------------------------------------
console.log('\n\ud83d\udce6 Grupo 1: Utilitarios e Configuracao');

await test('getRedirectUri retorna string http', () => {
  const uri = getRedirectUri();
  assert(typeof uri === 'string' && uri.startsWith('http'), `URI invalida: ${uri}`);
});

await test('OAUTH_CONFIG.google aponta para GIS e Gmail API', () => {
  assert(OAUTH_CONFIG.google.gisScriptUrl.includes('accounts.google.com'), 'Deve usar o script oficial do GIS');
  assert(OAUTH_CONFIG.google.apiBase.includes('gmail.googleapis.com'));
  assert(OAUTH_CONFIG.google.scopes.every(s => s.includes('gmail.readonly')), 'Somente leitura do Gmail');
});

await test('OAUTH_CONFIG.microsoft aponta para MSAL e Graph', () => {
  assert(OAUTH_CONFIG.microsoft.msalScriptUrl.includes('msal-browser'), 'Deve usar o MSAL Browser');
  assert(OAUTH_CONFIG.microsoft.graphBase.includes('graph.microsoft.com'));
  assert(OAUTH_CONFIG.microsoft.scopes.includes('Mail.Read'));
  assert(OAUTH_CONFIG.microsoft.scopes.includes('User.Read'));
});

await test('escopos nao solicitam envio/exclusao de mensagens', () => {
  const all = [...OAUTH_CONFIG.google.scopes, ...OAUTH_CONFIG.microsoft.scopes].join(' ');
  assert(!/send|compose|modify|mail\.send|readwrite/i.test(all), `Escopos amplos detectados: ${all}`);
});

await test('mensagem administrativa nao expoe termos tecnicos', () => {
  assert(!/client\s*id|oauth|pkce|redirect|escopo|scope/i.test(ADMIN_NOT_CONFIGURED_MSG),
    `Mensagem nao deve conter jargao tecnico: ${ADMIN_NOT_CONFIGURED_MSG}`);
});

// ---------------------------------------------------------------------------
// Grupo 2: Estado e Token
// ---------------------------------------------------------------------------
console.log('\n\ud83d\udce6 Grupo 2: Estado e Token');

await test('getStatus nao_conectado sem token', () => {
  resetStorage();
  const svc = new OAuthService();
  assertEqual(svc.getStatus('google').status, 'nao_conectado');
});

await test('getStatus expirado com token antigo', () => {
  resetStorage();
  const svc = new OAuthService();
  sessionStorage.setItem('oauth_google_token', 'old_tok');
  sessionStorage.setItem('oauth_google_exp', String(Date.now() - 1000));
  sessionStorage.setItem('oauth_google_email', 'x@gmail.com');
  const s = svc.getStatus('google');
  assertEqual(s.status, 'expirado');
  assertEqual(s.email, 'x@gmail.com');
});

await test('getStatus conectado com token valido', () => {
  resetStorage();
  const svc = new OAuthService();
  sessionStorage.setItem('oauth_google_token', 'valid_tok');
  sessionStorage.setItem('oauth_google_exp', String(Date.now() + 3600_000));
  sessionStorage.setItem('oauth_google_email', 'user@gmail.com');
  const s = svc.getStatus('google');
  assertEqual(s.status, 'conectado');
  assertEqual(s.email, 'user@gmail.com');
});

await test('getStatus microsoft conectado com conta salva', () => {
  resetStorage();
  const svc = new OAuthService();
  sessionStorage.setItem('oauth_microsoft_email', 'user@outlook.com');
  const s = svc.getStatus('microsoft');
  assertEqual(s.status, 'conectado');
  assertEqual(s.email, 'user@outlook.com');
});

await test('getToken(microsoft) sempre null (renovacao via MSAL)', () => {
  resetStorage();
  sessionStorage.setItem('oauth_microsoft_token', 'ms_tok');
  const svc = new OAuthService();
  assertEqual(svc.getToken('microsoft'), null);
});

// ---------------------------------------------------------------------------
// Grupo 3: Google — armazenamento de token
// ---------------------------------------------------------------------------
console.log('\n\ud83d\udce6 Grupo 3: Google Auth');

await test('_storeGoogleToken salva token e busca o e-mail', async () => {
  resetStorage();
  mockFetchOnce(makeFetchResp({ emailAddress: 'user@gmail.com' }));
  const svc = new OAuthService();
  await svc._storeGoogleToken('g_tok', '3600');
  assertEqual(sessionStorage.getItem('oauth_google_token'), 'g_tok');
  assertEqual(sessionStorage.getItem('oauth_google_email'), 'user@gmail.com');
  assertEqual(svc.getStatus('google').status, 'conectado');
});

await test('_storeGoogleToken sem token lanca OAuthError', async () => {
  resetStorage();
  const svc = new OAuthService();
  let err = null;
  try { await svc._storeGoogleToken('', '3600'); } catch (e) { err = e; }
  assert(err instanceof OAuthError, 'Deve ser OAuthError');
  assert(!/undefined|empty_token/i.test(err.message), 'Mensagem deve ser amigavel');
});

await test('_storeGoogleToken nao falha se o perfil estiver indisponivel', async () => {
  resetStorage();
  mockFetchOnce(makeFetchResp({}, 500));
  const svc = new OAuthService();
  await svc._storeGoogleToken('g_tok2', '3600');
  assertEqual(sessionStorage.getItem('oauth_google_token'), 'g_tok2');
  assertEqual(svc.getStatus('google').status, 'conectado');
});

// ---------------------------------------------------------------------------
// Grupo 4: Busca Gmail
// ---------------------------------------------------------------------------
console.log('\n\ud83d\udce6 Grupo 4: Busca Gmail');

function seedGoogle() {
  sessionStorage.setItem('oauth_google_token', 'g_tok');
  sessionStorage.setItem('oauth_google_exp', String(Date.now() + 3600_000));
}

await test('searchGmail lanca erro amigavel sem token', async () => {
  resetStorage();
  const svc = new OAuthService();
  let err = null;
  try { await svc.searchGmail('fatura'); } catch (e) { err = e; }
  assert(err instanceof OAuthError, 'Deve ser OAuthError');
  assert(/expirou/i.test(err.message), `Mensagem amigavel esperada, veio: ${err.message}`);
});

await test('searchGmail retorna mensagens, nextPage e estimate', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedGoogle();
  const encBody = btoa('Fatura R$ 500').replace(/\+/g, '-').replace(/\//g, '_');
  mockFetchSequence([
    makeFetchResp({ messages: [{ id: 'm1' }], nextPageToken: 'pg2', resultSizeEstimate: 7 }),
    makeFetchResp({
      id: 'm1', threadId: 't1', snippet: 'Fatura',
      payload: {
        headers: [
          { name: 'Subject', value: 'Fatura Nubank' },
          { name: 'From', value: 'noreply@nubank.com.br' },
          { name: 'Date', value: 'Mon, 01 Jan 2024 10:00:00 +0000' }
        ],
        mimeType: 'text/plain',
        body: { data: encBody }
      }
    })
  ]);
  const result = await svc.searchGmail('fatura', 12);
  assertEqual(result.messages.length, 1);
  assertEqual(result.nextPage, 'pg2');
  assertEqual(result.estimate, 7);
  assertEqual(result.messages[0].subject, 'Fatura Nubank');
  assertEqual(result.messages[0].provider, 'google');
  assertEqual(result.messages[0].key, 'google:m1');
});

await test('searchGmail inclui pageToken na URL na segunda pagina', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedGoogle();
  let capturedUrl = '';
  mockFetch(async (url) => {
    capturedUrl = url;
    return makeFetchResp({ messages: [], resultSizeEstimate: 0 });
  });
  await svc.searchGmail('fatura', 12, 'pagetoken_xyz');
  assert(capturedUrl.includes('pageToken=pagetoken_xyz'), `URL deve conter pageToken, foi: ${capturedUrl}`);
});

await test('searchGmail mensagem invalida nao derruba a busca', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedGoogle();
  mockFetchSequence([
    makeFetchResp({ messages: [{ id: 'm1' }, { id: 'm2' }], resultSizeEstimate: 2 }),
    makeFetchResp({}, 404),
    makeFetchResp({ id: 'm2', snippet: 'ok', payload: { headers: [{ name: 'Subject', value: 'Boa' }] } })
  ]);
  const r = await svc.searchGmail('fatura');
  assertEqual(r.messages.length, 1, 'Apenas a mensagem valida deve permanecer');
  assertEqual(r.messages[0].subject, 'Boa');
});

// ---------------------------------------------------------------------------
// Grupo 5: Busca Outlook
// ---------------------------------------------------------------------------
console.log('\n\ud83d\udce6 Grupo 5: Busca Outlook');

function seedMsMock(svc, token = 'ms_tok') {
  sessionStorage.setItem('oauth_microsoft_account', 'acc1');
  sessionStorage.setItem('oauth_microsoft_email', 'user@outlook.com');
  svc._getMsToken = async () => token;
}

await test('searchOutlook retorna mensagens normalizadas e nextPage', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedMsMock(svc);
  mockFetchOnce(makeFetchResp({
    value: [{
      id: 'out1', subject: 'Fatura Nubank',
      from: { emailAddress: { address: 'noreply@nubank.com.br' } },
      body: { content: '<p>Fatura</p>', contentType: 'html' },
      bodyPreview: 'Fatura',
      hasAttachments: false,
      receivedDateTime: '2024-01-01T00:00:00Z'
    }],
    '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skip=12'
  }));
  const result = await svc.searchOutlook('fatura', 12);
  assertEqual(result.messages.length, 1);
  assertEqual(result.messages[0].subject, 'Fatura Nubank');
  assertEqual(result.messages[0].from, 'noreply@nubank.com.br');
  assertEqual(result.messages[0].key, 'microsoft:out1');
  assertEqual(result.messages[0].hasAttachments, false);
  assert(result.nextPage?.includes('skip=12'), 'Deve expor o nextLink como nextPage');
});

await test('searchOutlook usa nextPage sem montar nova query', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedMsMock(svc);
  let capturedUrl = '';
  mockFetch(async (url) => {
    capturedUrl = url;
    return makeFetchResp({ value: [] });
  });
  await svc.searchOutlook('fatura', 12, 'https://graph.microsoft.com/v1.0/me/messages?$skip=24');
  assertEqual(capturedUrl, 'https://graph.microsoft.com/v1.0/me/messages?$skip=24');
});

await test('searchOutlook sem conta lanca erro amigavel', async () => {
  resetStorage();
  const svc = new OAuthService();
  let err = null;
  try { await svc.searchOutlook('fatura'); } catch (e) { err = e; }
  assert(err instanceof OAuthError, 'Deve ser OAuthError');
  assert(!/msal|iframe|token/i.test(err.message), `Mensagem deve ser amigavel: ${err.message}`);
});

await test('searchOutlook com anexos expoe listAttachments sob demanda', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedMsMock(svc);
  mockFetchSequence([
    makeFetchResp({
      value: [{
        id: 'o2', subject: 'Com anexo',
        from: { emailAddress: { address: 'a@b.com' } },
        body: { content: '<p>x</p>' }, bodyPreview: 'x',
        hasAttachments: true, receivedDateTime: '2024-01-01T00:00:00Z'
      }]
    }),
    makeFetchResp({ value: [
      { id: 'a1', name: 'fatura.pdf', size: 10, contentType: 'application/pdf' },
      { id: 'a2', name: 'foto.png', size: 10, contentType: 'image/png' }
    ] })
  ]);
  const r = await svc.searchOutlook('fatura');
  const m = r.messages[0];
  assertEqual(m.hasAttachments, true);
  const atts = await m.listAttachments();
  assertEqual(atts.length, 1, 'Somente anexos legiveis pelos parsers locais');
  assertEqual(atts[0].name, 'fatura.pdf');
  assert(typeof atts[0].download === 'function', 'Anexo deve expor download()');
});

// ---------------------------------------------------------------------------
// Grupo 6: Camada de Normalizacao
// ---------------------------------------------------------------------------
console.log('\n\ud83d\udce6 Grupo 6: Normalizacao');

await test('_normalize padroniza campos e filtra anexos', async () => {
  const svc = new OAuthService();
  const m = svc._normalize('google', {
    id: 'x1', subject: 'Fatura', from: 'a@b', date: '2024-01-01', snippet: 's', body: '<p>',
    attachments: [{ name: 'fatura.pdf' }, { name: 'imagem.png' }, { name: 'pagina.html' }]
  });
  assertEqual(m.provider, 'google');
  assertEqual(m.key, 'google:x1');
  assertEqual(m.subject, 'Fatura');
  assertEqual(m.hasAttachments, true);
  const atts = await m.listAttachments();
  assertEqual(atts.length, 2, 'PDF e HTML sao suportados; PNG nao');
});

await test('_normalize aplica assunto padrao e sem anexos', async () => {
  const svc = new OAuthService();
  const m = svc._normalize('microsoft', { id: 'y1', attachments: null });
  assertEqual(m.subject, '(sem assunto)');
  assertEqual(m.hasAttachments, false);
  assertEqual((await m.listAttachments()).length, 0);
});

// ---------------------------------------------------------------------------
// Grupo 7: HTTP 429 / erros / rede
// ---------------------------------------------------------------------------
console.log('\n\ud83d\udce6 Grupo 7: Backoff e erros HTTP');

await test('_fetchWithRetry retenta apos 429 com Retry-After', async () => {
  const svc = new OAuthService();
  let callCount = 0;
  mockFetch(async () => {
    callCount++;
    if (callCount === 1) return {
      ok: false, status: 429,
      headers: { get: (k) => k === 'retry-after' ? '1' : null },
      json: async () => ({})
    };
    return makeFetchResp({ ok_data: true });
  });
  const start = Date.now();
  const resp = await svc._fetchWithRetry('https://example.com', {});
  assert(Date.now() - start >= 900, 'Deve ter aguardado ~1s');
  assertEqual(callCount, 2, 'Deve ter feito 2 chamadas');
  assert(resp.ok, 'Resposta final deve ser ok');
});

await test('_fetchWithRetry com retries=0 nao retenta', async () => {
  const svc = new OAuthService();
  let callCount = 0;
  mockFetch(async () => {
    callCount++;
    return { ok: false, status: 429, headers: { get: () => '1' }, json: async () => ({}) };
  });
  const resp = await svc._fetchWithRetry('https://example.com', {}, 0);
  assertEqual(resp.status, 429);
  assertEqual(callCount, 1);
});

await test('searchGmail 401 limpa o token e pede reconexao', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedGoogle();
  mockFetchOnce(makeFetchResp({}, 401));
  let err = null;
  try { await svc.searchGmail('fatura'); } catch (e) { err = e; }
  assert(/expirou/i.test(err.message), `Esperava erro de expiracao, veio: ${err.message}`);
  assertEqual(svc.getStatus('google').status, 'nao_conectado', 'Token invalido deve ser descartado');
});

await test('searchGmail 403 lanca erro de permissoes', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedGoogle();
  mockFetchOnce(makeFetchResp({}, 403));
  let err = null;
  try { await svc.searchGmail('fatura'); } catch (e) { err = e; }
  assert(/permiss/i.test(err.message), `Esperava erro de permissoes, veio: ${err.message}`);
});

await test('searchGmail 429 lanca erro de limite amigavel', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedGoogle();
  mockFetch(async () => ({ ok: false, status: 429, headers: { get: () => '1' }, json: async () => ({}) }));
  let err = null;
  try { await svc.searchGmail('fatura'); } catch (e) { err = e; }
  assert(/instantes/i.test(err.message), `Esperava mensagem de limite, veio: ${err.message}`);
});

await test('searchGmail propaga falha de rede como OAuthError', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedGoogle();
  mockFetch(async () => { throw new Error('network down'); });
  let err = null;
  try { await svc.searchGmail('fatura'); } catch (e) { err = e; }
  assert(err instanceof OAuthError, 'Deve ser OAuthError');
  assert(!/network down/i.test(err.message), 'Nao deve vazar detalhe tecnico ao usuario');
});

// ---------------------------------------------------------------------------
// Grupo 8: Desconexao
// ---------------------------------------------------------------------------
console.log('\n\ud83d\udce6 Grupo 8: Desconexao');

await test('disconnectGoogle limpa todo o estado', async () => {
  resetStorage();
  sessionStorage.setItem('oauth_google_token', 'tok');
  sessionStorage.setItem('oauth_google_exp', String(Date.now() + 3600_000));
  sessionStorage.setItem('oauth_google_email', 'x@gmail.com');
  mockFetchOnce(makeFetchResp({}, 200));
  const svc = new OAuthService();
  await svc.disconnectGoogle();
  assertEqual(sessionStorage.getItem('oauth_google_token'), null, 'Token deve ser removido');
  assertEqual(svc.getStatus('google').status, 'nao_conectado');
});

await test('disconnectMicrosoft limpa todo o estado', async () => {
  resetStorage();
  sessionStorage.setItem('oauth_microsoft_account', 'acc1');
  sessionStorage.setItem('oauth_microsoft_email', 'a@outlook.com');
  const svc = new OAuthService();
  await svc.disconnectMicrosoft();
  assertEqual(sessionStorage.getItem('oauth_microsoft_account'), null);
  assertEqual(svc.getStatus('microsoft').status, 'nao_conectado');
});

// ---------------------------------------------------------------------------
// Grupo 9: Utilitarios internos
// ---------------------------------------------------------------------------
console.log('\n\ud83d\udce6 Grupo 9: Utilitarios internos');

await test('_decodeBase64 decodifica base64url', () => {
  const svc = new OAuthService();
  const orig = 'Rateio v2.0';
  const enc = btoa(orig).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assertEqual(new TextDecoder().decode(svc._decodeBase64(enc)), orig);
});

await test('_extractGmailBody prefere HTML sobre texto', () => {
  const svc = new OAuthService();
  const enc = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_');
  const payload = {
    mimeType: 'multipart/alternative',
    parts: [
      { mimeType: 'text/plain', body: { data: enc('texto simples') } },
      { mimeType: 'text/html',  body: { data: enc('<p>html</p>') } }
    ]
  };
  assertEqual(svc._extractGmailBody(payload), '<p>html</p>');
});

// ---------------------------------------------------------------------------
// Grupo 10: Configuracao administrativa
// ---------------------------------------------------------------------------
console.log('\n\ud83d\udce6 Grupo 10: Configuracao administrativa');

await test('isConfigured retorna booleano e nao depende do localStorage', () => {
  resetStorage();
  localStorage.setItem('cid', '123456.apps.googleusercontent.com');
  localStorage.setItem('mcid', 'aaaa-bbbb-cccc-dddd');
  const svc = new OAuthService();
  assertEqual(typeof svc.isGoogleConfigured(), 'boolean');
  assertEqual(typeof svc.isMicrosoftConfigured(), 'boolean');
  assertEqual(svc.isGoogleConfigured(), OAUTH_CONFIG.google.isConfigured());
});

// ---------------------------------------------------------------------------
// Grupo 11: Client ID ausente
// ---------------------------------------------------------------------------
console.log('\n\ud83e\udded Grupo 11: Client ID ausente');

await test('startGoogleAuth lanca erro administrativo claro', async () => {
  resetStorage();
  const svc = new OAuthService();
  if (svc.isGoogleConfigured()) return; // so testa o cenario de placeholder
  const err = await svc.startGoogleAuth().then(() => null, e => e);
  assert(err instanceof OAuthError, 'Deve ser OAuthError');
  assertEqual(err.message, ADMIN_NOT_CONFIGURED_MSG);
});

await test('startMicrosoftAuth lanca erro administrativo claro', async () => {
  resetStorage();
  const svc = new OAuthService();
  if (svc.isMicrosoftConfigured()) return;
  const err = await svc.startMicrosoftAuth().then(() => null, e => e);
  assert(err instanceof OAuthError, 'Deve ser OAuthError');
  assertEqual(err.message, ADMIN_NOT_CONFIGURED_MSG);
});

// ---------------------------------------------------------------------------
// Grupo 12: Prevencao de duplicidade
// ---------------------------------------------------------------------------
console.log('\n\ud83d\udce6 Grupo 12: Prevencao de duplicidade');

await test('isImported/markImported registram e consultam chaves', () => {
  resetStorage();
  const svc = new OAuthService();
  assertEqual(svc.isImported('google:abc'), false);
  svc.markImported('google:abc');
  assertEqual(svc.isImported('google:abc'), true);
  assertEqual(svc.isImported('microsoft:abc'), false);
});

await test('markImported limita o historico a 300 chaves', () => {
  resetStorage();
  const svc = new OAuthService();
  for (let i = 0; i < 320; i++) svc.markImported('m:' + i);
  const saved = JSON.parse(localStorage.getItem('rateio_imported_msgs'));
  assertEqual(saved.length, 300);
  assertEqual(saved[0], 'm:20');
});

// ---------------------------------------------------------------------------
// Grupo 13: Ausencia de tokens em logs (Secao 12)
// ---------------------------------------------------------------------------
console.log('\n\ud83d\udce6 Grupo 13: Logs sem tokens');

await test('redact mascara tokens e conteudo sensivel', () => {
  const out = redact('Bearer abc.def.ghi ya29.SECRET access_token=segredo');
  assert(!/ya29\./.test(out), 'Token do Google nao pode aparecer');
  assert(!/abc\.def\.ghi/.test(out), 'Token Bearer nao pode aparecer');
  assert(!/segredo/.test(out), 'access_token nao pode aparecer');
  assert(/redigido/.test(out), 'Deve indicar a redacao');
});

await test('logs de diagnostico nunca expoem tokens', () => {
  const svc = new OAuthService();
  const seen = [];
  const orig = console.warn;
  console.warn = (...a) => seen.push(a.map(String).join(' '));
  try {
    svc._diag('falha ao renovar com ya29.SECRET123', 'jwt eyJhbGciOiJIUzI1Ni.JJJJ.SIG');
  } finally {
    console.warn = orig;
  }
  const out = seen.join('\n');
  assert(!/ya29\./.test(out), 'Token do Google nao deve ser registrado');
  assert(!/eyJ[\w-]+\.[\w-]+\.[\w-]+/.test(out), 'JWT nao deve ser registrado');
  assert(/redigido/.test(out), 'Valores sensiveis devem ser substituidos');
});

// ---------------------------------------------------------------------------
// Grupo 14: Tokens nunca em localStorage
// ---------------------------------------------------------------------------
console.log('\n\ud83d\udce6 Grupo 14: Tokens apenas em sessionStorage');

await test('_storeGoogleToken nao grava tokens em localStorage', async () => {
  resetStorage();
  mockFetchOnce(makeFetchResp({ emailAddress: 'u@gmail.com' }));
  const svc = new OAuthService();
  await svc._storeGoogleToken('tok', '3600');
  assertEqual(localStorage.getItem('oauth_google_token'), null, 'Token nao deve ir para localStorage');
  assertEqual(localStorage.getItem('oauth_google_email'), null, 'Email nao deve ir para localStorage');
  assertEqual(sessionStorage.getItem('oauth_google_token'), 'tok', 'Token deve estar em sessionStorage');
});

await test('construtor remove tokens legados do localStorage', () => {
  resetStorage();
  localStorage.setItem('oauth_google_token', 'legacy_tok');
  localStorage.setItem('oauth_google_exp', String(Date.now() + 1000));
  localStorage.setItem('cid', 'legacy_cid');
  new OAuthService();
  assertEqual(localStorage.getItem('oauth_google_token'), null, 'Token legado deve ser removido');
  assertEqual(localStorage.getItem('cid'), null, 'Client ID legado do usuario deve ser removido');
});

await test('disconnectGoogle nao deixa token em nenhum storage', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedGoogle();
  localStorage.setItem('oauth_google_token', 'legacy_tok');
  mockFetchOnce(makeFetchResp({}, 200));
  await svc.disconnectGoogle();
  assertEqual(sessionStorage.getItem('oauth_google_token'), null);
  assertEqual(localStorage.getItem('oauth_google_token'), null);
});

// --- Resultado ---
await new Promise(r => setTimeout(r, 50));
const total = passed + failed;
console.log(`\n${'─'.repeat(50)}`);
console.log(`Resultado: ${passed}/${total} passaram`);
if (failed > 0) { console.log(`           ${failed} falharam \u274c`); process.exit(1); }
else { console.log('           Todos os testes passaram \u2705'); }
