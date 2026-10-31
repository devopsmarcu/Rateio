// ==========================================================================
// Rateio de Faturas — Ponte de autorização do Google (Google Identity Services)
// ==========================================================================
//
// Esta página existe por um motivo técnico específico e não aparece para o
// usuário comum como parte do aplicativo:
//
// O aplicativo principal é servido com Cross-Origin-Opener-Policy "same-origin"
// porque precisa de SharedArrayBuffer/OPFS (SQLite). Esse mesmo cabeçalho
// SEVERA janelas de popup, e a biblioteca oficial do Google (GIS) depende de um
// popup para devolver o resultado. Assim, o fluxo do Google é executado aqui,
// em uma página do mesmo domínio servida SEM COOP, e o resultado é transmitido
// de volta ao aplicativo por BroadcastChannel.
//
// Nenhuma credencial, senha ou dado de fatura é processado aqui.

import { OAUTH_CONFIG, ADMIN_NOT_CONFIGURED_MSG } from './oauth-config.js';

const RELAY_CHANNEL = 'rateio-oauth';

const params = new URLSearchParams(location.hash.slice(1));
const provider = params.get('provider') || 'google';
const nonce = params.get('nonce') || '';

const $go = document.getElementById('go');
const $err = document.getElementById('err');
const $spinner = document.getElementById('spinner');

let channel = null;
let done = false;

function getChannel() {
  if (channel) return channel;
  try {
    channel = new BroadcastChannel(RELAY_CHANNEL);
  } catch {
    channel = null;
  }
  return channel;
}

// Envia o resultado ao aplicativo e encerra esta janela.
function finish(payload) {
  if (done) return;
  done = true;
  payload.channel = RELAY_CHANNEL;
  payload.nonce = nonce;
  payload.provider = provider;
  try {
    getChannel()?.postMessage(payload);
  } catch { /* canal indisponível */ }
  // Pequeno atraso para garantir a entrega da mensagem antes de fechar.
  setTimeout(() => { try { window.close(); } catch {} }, 120);
}

function fail(reason) {
  finish({ ok: false, reason });
}

function busy(on) {
  $spinner.hidden = !on;
  $go.disabled = on;
  if (!on) $go.textContent = 'Continuar com o Google';
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('script_load_failed'));
    document.head.appendChild(s);
  });
}

let tokenClient = null;

function buildTokenClient() {
  return window.google.accounts.oauth2.initTokenClient({
    client_id: OAUTH_CONFIG.google.clientId,
    scope: OAUTH_CONFIG.google.scopes.join(' '),
    callback: resp => {
      if (resp && resp.access_token) {
        finish({
          ok: true,
          token: resp.access_token,
          expiresIn: resp.expires_in,
          scope: resp.scope
        });
      } else {
        fail((resp && resp.error) || 'unknown_error');
      }
    },
    error_callback: err => {
      busy(false);
      const type = (err && err.type) || 'unknown_error';
      // Cancelamentos comuns: o usuário fechou o popup ou negou o acesso.
      if (type === 'popup_closed' || type === 'popup_closed_by_user' || type === 'access_denied') {
        fail('cancelled');
      } else {
        $err.textContent = 'Não foi possível conectar sua conta. Tente novamente.';
        fail(type);
      }
    }
  });
}

async function authorize() {
  if (!OAUTH_CONFIG.google.isConfigured()) {
    $err.textContent = ADMIN_NOT_CONFIGURED_MSG;
    $go.disabled = true;
    fail('not_configured');
    return;
  }
  busy(true);
  $err.textContent = '';
  try {
    if (!window.google?.accounts?.oauth2) {
      await loadScript(OAUTH_CONFIG.google.gisScriptUrl);
    }
    if (!window.google?.accounts?.oauth2) throw new Error('gis_unavailable');
    tokenClient ||= buildTokenClient();
    tokenClient.requestAccessToken();
  } catch (e) {
    busy(false);
    $err.textContent = 'Não foi possível iniciar a autorização. Tente novamente.';
    fail(String(e && e.message) || 'unknown_error');
  }
}

$go.addEventListener('click', authorize);

// Sinaliza ao aplicativo que esta janela abriu corretamente. Isso permite ao
// aplicativo diferenciar "popup bloqueado" (nenhum sinal) de "janela aberta
// aguardando o usuário".
try {
  getChannel()?.postMessage({ channel: RELAY_CHANNEL, type: 'ready', provider, nonce });
} catch { /* canal indisponível */ }

// Se o usuário fechar esta janela sem concluir, avisa o aplicativo.
window.addEventListener('pagehide', () => {
  if (!done) finish({ ok: false, reason: 'cancelled' });
});

// Tentativa automática: como esta janela foi aberta por um toque do usuário,
// o navegador costuma permitir o popup do Google sem um novo toque. Se for
// bloqueado, o botão permanece para o usuário continuar manualmente.
if (provider === 'google') {
  setTimeout(() => { if (!done && !$go.disabled) authorize(); }, 250);
}
