/**
 * test_oauth.mjs — Suite de testes para oauth-service.js
 * Execução: node test_oauth.mjs  (copiar para c:\temp\rateio\)
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

const { OAUTH_CONFIG, getRedirectUri } = await import('./oauth-config.js');
const { OAuthService }                 = await import('./oauth-service.js');

// --- Grupo 1: Utilitarios ---
console.log('\n\ud83d\udce6 Grupo 1: Utilitarios e Configuracao');

await test('getRedirectUri retorna string http', () => {
  const uri = getRedirectUri();
  assert(typeof uri === 'string' && uri.startsWith('http'), `URI invalida: ${uri}`);
});

await test('OAUTH_CONFIG.google tem endpoints corretos', () => {
  assert(OAUTH_CONFIG.google.authEndpoint.includes('accounts.google.com'));
  assert(OAUTH_CONFIG.google.scopes.some(s => s.includes('gmail.readonly')));
});

await test('OAUTH_CONFIG.microsoft tem escopos corretos', () => {
  assert(OAUTH_CONFIG.microsoft.scopes.includes('Mail.Read'));
  assert(OAUTH_CONFIG.microsoft.scopes.includes('User.Read'));
});

// --- Grupo 2: Estado e Token ---
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
  assertEqual(svc.getStatus('google').status, 'expirado');
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

// --- Grupo 3: Google Auth ---
console.log('\n\ud83d\udce6 Grupo 3: Google Auth');

await test('completeGoogleAuth salva token e email', async () => {
  resetStorage();
  sessionStorage.setItem('oauth_google_state', 'g_abc');
  mockFetchOnce(makeFetchResp({ emailAddress: 'user@gmail.com' }));
  const svc = new OAuthService();
  await svc.completeGoogleAuth('g_tok', '3600', 'g_abc');
  const token = sessionStorage.getItem('oauth_google_token') || localStorage.getItem('oauth_google_token');
  assertEqual(token, 'g_tok');
  const email = sessionStorage.getItem('oauth_google_email') || localStorage.getItem('oauth_google_email');
  assertEqual(email, 'user@gmail.com');
});

// --- Grupo 4: Microsoft Auth ---
console.log('\n\ud83d\udce6 Grupo 4: Microsoft Auth (PKCE)');

await test('completeMicrosoftAuth salva token MS e email', async () => {
  resetStorage();
  localStorage.setItem('mcid', 'test-ms-cid');
  sessionStorage.setItem('oauth_ms_verifier', 'fake_verifier_1234567890');
  sessionStorage.setItem('oauth_ms_state', 'ms_xyz');
  mockFetchSequence([
    makeFetchResp({ access_token: 'ms_tok', expires_in: 3600 }),
    makeFetchResp({ mail: 'user@outlook.com' })
  ]);
  const svc = new OAuthService();
  await svc.completeMicrosoftAuth('auth_code', 'ms_xyz');
  const token = sessionStorage.getItem('oauth_microsoft_token') || localStorage.getItem('oauth_microsoft_token');
  assertEqual(token, 'ms_tok');
  const email = sessionStorage.getItem('oauth_microsoft_email') || localStorage.getItem('oauth_microsoft_email');
  assertEqual(email, 'user@outlook.com');
});

// --- Grupo 5: Busca Gmail ---
console.log('\n\ud83d\udce6 Grupo 5: Busca Gmail');

await test('searchGmail lanca erro sem token', async () => {
  resetStorage();
  const svc = new OAuthService();
  let threw = false;
  try { await svc.searchGmail('fatura'); } catch { threw = true; }
  assert(threw, 'Deve lancar erro sem token');
});

await test('searchGmail retorna mensagens e nextPageToken', async () => {
  resetStorage();
  const svc = new OAuthService();
  sessionStorage.setItem('oauth_google_token', 'g_tok');
  sessionStorage.setItem('oauth_google_exp', String(Date.now() + 3600_000));
  const encBody = btoa('Fatura R$ 500').replace(/\+/g, '-').replace(/\//g, '_');
  mockFetchSequence([
    makeFetchResp({ messages: [{ id: 'm1' }], nextPageToken: 'pg2', resultSizeEstimate: 1 }),
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
  assert(Array.isArray(result.messages) && result.messages.length === 1, 'Deve retornar 1 mensagem');
  assertEqual(result.nextPageToken, 'pg2', 'Deve ter nextPageToken');
  assertEqual(result.messages[0].subject, 'Fatura Nubank');
});

await test('searchGmail inclui pageToken na URL na segunda pagina', async () => {
  resetStorage();
  const svc = new OAuthService();
  sessionStorage.setItem('oauth_google_token', 'g_tok');
  sessionStorage.setItem('oauth_google_exp', String(Date.now() + 3600_000));
  let capturedUrl = '';
  mockFetch(async (url) => {
    capturedUrl = url;
    return makeFetchResp({ messages: [], resultSizeEstimate: 0 });
  });
  await svc.searchGmail('fatura', 12, 'pagetoken_xyz');
  assert(capturedUrl.includes('pageToken=pagetoken_xyz'), `URL deve conter pageToken, foi: ${capturedUrl}`);
});

// --- Grupo 6: Busca Outlook ---
console.log('\n\ud83d\udce6 Grupo 6: Busca Outlook');

await test('searchOutlook lanca erro sem token', async () => {
  resetStorage();
  const svc = new OAuthService();
  let threw = false;
  try { await svc.searchOutlook('fatura'); } catch { threw = true; }
  assert(threw);
});

await test('searchOutlook retorna mensagens com nextLink', async () => {
  resetStorage();
  const svc = new OAuthService();
  sessionStorage.setItem('oauth_microsoft_token', 'ms_tok');
  sessionStorage.setItem('oauth_microsoft_exp', String(Date.now() + 3600_000));
  mockFetchOnce(makeFetchResp({
    value: [{
      id: 'out1', subject: 'Fatura Nubank',
      from: { emailAddress: { address: 'noreply@nubank.com.br' } },
      body: { content: '<p>Fatura</p>', contentType: 'html' },
      hasAttachments: false,
      receivedDateTime: '2024-01-01T00:00:00Z'
    }],
    '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skip=12'
  }));
  const result = await svc.searchOutlook('fatura', 12);
  assertEqual(result.messages.length, 1);
  assert(result.nextLink?.includes('skip=12'));
});

// --- Grupo 7: HTTP 429 ---
console.log('\n\ud83d\udce6 Grupo 7: HTTP 429 Backoff');

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

// --- Grupo 8: Desconexao ---
console.log('\n\ud83d\udce6 Grupo 8: Desconexao');

await test('disconnectGoogle limpa todos os dados', async () => {
  resetStorage();
  sessionStorage.setItem('oauth_google_token', 'tok');
  sessionStorage.setItem('oauth_google_exp', String(Date.now() + 3600_000));
  sessionStorage.setItem('oauth_google_email', 'x@gmail.com');
  mockFetchOnce(makeFetchResp({}, 200));
  const svc = new OAuthService();
  await svc.disconnectGoogle();
  assert(!sessionStorage.getItem('oauth_google_token'), 'Token deve ser removido');
  assertEqual(svc.getStatus('google').status, 'nao_conectado');
});

await test('disconnectMicrosoft limpa todos os dados', async () => {
  resetStorage();
  sessionStorage.setItem('oauth_microsoft_token', 'ms_tok');
  sessionStorage.setItem('oauth_microsoft_exp', String(Date.now() + 3600_000));
  const svc = new OAuthService();
  await svc.disconnectMicrosoft();
  assert(!sessionStorage.getItem('oauth_microsoft_token'));
  assertEqual(svc.getStatus('microsoft').status, 'nao_conectado');
});

// --- Grupo 9: Utilitarios Internos ---
console.log('\n\ud83d\udce6 Grupo 9: Utilitarios Internos');

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

// --- Grupo 10: isConfigured ---
console.log('\n\ud83d\udce6 Grupo 10: isConfigured');

await test('isGoogleConfigured false com placeholder', () => {
  resetStorage();
  const svc = new OAuthService();
  assert(svc.isGoogleConfigured() === false);
});

await test('isGoogleConfigured true com Client ID real', () => {
  resetStorage();
  localStorage.setItem('cid', '123456.apps.googleusercontent.com');
  const svc = new OAuthService();
  assert(svc.isGoogleConfigured() === true);
});

await test('isMicrosoftConfigured true com Client ID real', () => {
  resetStorage();
  localStorage.setItem('mcid', 'aaaa-bbbb-cccc-dddd');
  const svc = new OAuthService();
  assert(svc.isMicrosoftConfigured() === true);
});

// --- Grupo 11: Erros HTTP (401/403) e falha de rede ---
console.log('\n\ud83d\udce6 Grupo 11: Erros HTTP e falha de rede');

function seedGoogle() {
  sessionStorage.setItem('oauth_google_token', 'g_tok');
  sessionStorage.setItem('oauth_google_exp', String(Date.now() + 3600_000));
}
function seedMicrosoft() {
  sessionStorage.setItem('oauth_microsoft_token', 'ms_tok');
  sessionStorage.setItem('oauth_microsoft_exp', String(Date.now() + 3600_000));
}

await test('searchGmail 401 lanca erro de sessao expirada', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedGoogle();
  mockFetchOnce(makeFetchResp({}, 401));
  let msg = '';
  try { await svc.searchGmail('fatura'); } catch (e) { msg = e.message; }
  assert(/expirada/i.test(msg), `Esperava erro de sessao expirada, veio: ${msg}`);
});

await test('searchGmail 403 lanca erro de permissoes', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedGoogle();
  mockFetchOnce(makeFetchResp({}, 403));
  let msg = '';
  try { await svc.searchGmail('fatura'); } catch (e) { msg = e.message; }
  assert(/permiss/i.test(msg), `Esperava erro de permissoes, veio: ${msg}`);
});

await test('searchGmail propaga falha de rede sem travar', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedGoogle();
  mockFetch(async () => { throw new Error('network down'); });
  let threw = false;
  try { await svc.searchGmail('fatura'); } catch { threw = true; }
  assert(threw, 'Falha de rede deve propagar como erro');
});

await test('searchOutlook 401 lanca erro de sessao expirada', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedMicrosoft();
  mockFetchOnce(makeFetchResp({}, 401));
  let msg = '';
  try { await svc.searchOutlook('fatura'); } catch (e) { msg = e.message; }
  assert(/expirada/i.test(msg), `Esperava erro de sessao expirada, veio: ${msg}`);
});

await test('searchOutlook 403 lanca erro de permissoes', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedMicrosoft();
  mockFetchOnce(makeFetchResp({}, 403));
  let msg = '';
  try { await svc.searchOutlook('fatura'); } catch (e) { msg = e.message; }
  assert(/permiss/i.test(msg), `Esperava erro de permissoes, veio: ${msg}`);
});

// --- Grupo 12: Resultados vazios e anexos ---
console.log('\n\ud83d\udce6 Grupo 12: Resultados vazios e anexos');

await test('searchGmail sem mensagens retorna lista vazia', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedGoogle();
  mockFetchOnce(makeFetchResp({ resultSizeEstimate: 0 }));
  const r = await svc.searchGmail('fatura');
  assertEqual(r.messages.length, 0);
  assertEqual(r.nextPageToken, null);
});

await test('searchOutlook sem mensagens retorna lista vazia', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedMicrosoft();
  mockFetchOnce(makeFetchResp({ value: [] }));
  const r = await svc.searchOutlook('fatura');
  assertEqual(r.messages.length, 0);
  assertEqual(r.nextLink, null);
});

await test('getGmailMessage filtra anexos de tipo nao suportado', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedGoogle();
  mockFetchOnce(makeFetchResp({
    id: 'm9', threadId: 't9', snippet: 'x',
    payload: {
      headers: [{ name: 'Subject', value: 'Teste' }],
      mimeType: 'multipart/mixed',
      parts: [
        { filename: 'fatura.pdf', mimeType: 'application/pdf', body: { attachmentId: 'a1', size: 10 } },
        { filename: 'malware.exe', mimeType: 'application/octet-stream', body: { attachmentId: 'a2', size: 10 } }
      ]
    }
  }));
  const m = await svc.getGmailMessage('m9');
  assertEqual(m.attachments.length, 1, 'Apenas anexos suportados devem permanecer');
  assertEqual(m.attachments[0].name, 'fatura.pdf');
});

await test('searchOutlook mensagens sem anexos permanecem validas', async () => {
  resetStorage();
  const svc = new OAuthService();
  seedMicrosoft();
  mockFetchOnce(makeFetchResp({
    value: [{
      id: 'o1', subject: 'Sem anexo',
      from: { emailAddress: { address: 'a@b.com' } },
      body: { content: '<p>x</p>' }, hasAttachments: false,
      receivedDateTime: '2024-01-01T00:00:00Z'
    }]
  }));
  const r = await svc.searchOutlook('fatura');
  assertEqual(r.messages.length, 1);
  assertEqual(r.messages[0].atts, null);
});

// --- Grupo 13: Client ID ausente/invalido ---
console.log('\n\ud83d\udce6 Grupo 13: Client ID ausente ou invalido');

await test('startGoogleAuth lanca sem Client ID configurado', async () => {
  resetStorage();
  const svc = new OAuthService();
  let msg = '';
  try { await svc.startGoogleAuth(); } catch (e) { msg = e.message; }
  assert(/não configurado/i.test(msg), `Esperava erro de configuracao, veio: ${msg}`);
});

await test('startMicrosoftAuth lanca sem Client ID configurado', async () => {
  resetStorage();
  const svc = new OAuthService();
  let msg = '';
  try { await svc.startMicrosoftAuth(); } catch (e) { msg = e.message; }
  assert(/não configurado/i.test(msg), `Esperava erro de configuracao, veio: ${msg}`);
});

// --- Grupo 14: Cancelamento / PKCE ausente ---
console.log('\n\ud83d\udce6 Grupo 14: Cancelamento e PKCE ausente');

await test('completeMicrosoftAuth sem verifier lanca erro (cancelamento/fluxo invalido)', async () => {
  resetStorage();
  const svc = new OAuthService();
  sessionStorage.setItem('oauth_ms_state', 'ms_xyz');
  let threw = false;
  try { await svc.completeMicrosoftAuth('auth_code', 'ms_xyz'); } catch { threw = true; }
  assert(threw, 'Deve lancar quando o code_verifier do PKCE esta ausente');
});

// --- Grupo 15: Ausencia de persistencia indevida de tokens ---
console.log('\n\ud83d\udce6 Grupo 15: Sem persistencia indevida de tokens');

await test('completeGoogleAuth nao grava tokens em localStorage', async () => {
  resetStorage();
  sessionStorage.setItem('oauth_google_state', 'g_abc');
  mockFetchOnce(makeFetchResp({ emailAddress: 'u@gmail.com' }));
  const svc = new OAuthService();
  await svc.completeGoogleAuth('tok', '3600', 'g_abc');
  assertEqual(localStorage.getItem('oauth_google_token'), null, 'Token nao deve ir para localStorage');
  assertEqual(localStorage.getItem('oauth_google_email'), null, 'Email nao deve ir para localStorage');
  assertEqual(sessionStorage.getItem('oauth_google_token'), 'tok', 'Token deve estar em sessionStorage');
});

await test('construtor remove tokens legados do localStorage', () => {
  resetStorage();
  localStorage.setItem('oauth_google_token', 'legacy_tok');
  localStorage.setItem('oauth_google_exp', String(Date.now() + 1000));
  const svc = new OAuthService();
  assertEqual(localStorage.getItem('oauth_google_token'), null, 'Token legado deve ser removido');
  assertEqual(svc.getStatus('google').status, 'nao_conectado');
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
