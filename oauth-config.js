// ==========================================================================
// Rateio de Faturas — Configurações Centralizadas de OAuth 2.0
// Provedores: Google Identity Services (Gmail) & Microsoft Identity (Outlook)
// ==========================================================================

/**
 * Configuração centralizada para os provedores de e-mail.
 * Os Client IDs são públicos por natureza em aplicações SPA no navegador.
 * Para publicar no GitHub Pages (ex: https://devopsmarcu.github.io/), o
 * mantenedor preenche os Client IDs abaixo registrados nas respectivas consoles.
 * Também é permitido sobrescrever localmente via localStorage para testes em outros domínios.
 */

// Client IDs padrão da aplicação (preenchíveis pelo mantenedor)
const DEFAULT_GOOGLE_CLIENT_ID = 'SEU_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const DEFAULT_MICROSOFT_CLIENT_ID = 'SEU_MICROSOFT_CLIENT_ID';

// Obter Redirect URI dinamicamente respeitando subdiretórios no GitHub Pages ou domínio próprio
export function getRedirectUri() {
  // Exemplo: https://devopsmarcu.github.io/rateio/ ou http://localhost:8080/
  const url = new URL(window.location.href);
  // Remove hash e search params para ter uma redirect URI canônica
  return `${url.origin}${url.pathname}`;
}

export const OAUTH_CONFIG = {
  // Google OAuth 2.0 / Gmail
  google: {
    // Permite override pelo usuário/desenvolvedor em Ajustes se auto-hospedado
    getClientId: () => localStorage.getItem('oauth_override_google_cid') || localStorage.getItem('cid') || DEFAULT_GOOGLE_CLIENT_ID,
    isConfigured: () => {
      const cid = localStorage.getItem('oauth_override_google_cid') || localStorage.getItem('cid') || DEFAULT_GOOGLE_CLIENT_ID;
      return cid && !cid.startsWith('SEU_');
    },
    authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenRevokeEndpoint: 'https://oauth2.googleapis.com/revoke',
    apiBase: 'https://gmail.googleapis.com/gmail/v1/users/me',
    profileEndpoint: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    /**
     * Escopos mínimos necessários:
     * - gmail.readonly: necessário para buscar mensagens por query, ler o corpo (texto/html)
     *   e baixar anexos (PDFs de faturas). A API de perfil (users.getProfile) também é coberta
     *   por este escopo para exibir o email conectado sem pedir escopos de perfil adicionais!
     */
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly'
    ],
    defaultQuery: 'fatura OR boleto newer_than:90d'
  },

  // Microsoft Identity Platform / Microsoft Graph (Outlook)
  microsoft: {
    getClientId: () => localStorage.getItem('oauth_override_ms_cid') || localStorage.getItem('mcid') || DEFAULT_MICROSOFT_CLIENT_ID,
    isConfigured: () => {
      const cid = localStorage.getItem('oauth_override_ms_cid') || localStorage.getItem('mcid') || DEFAULT_MICROSOFT_CLIENT_ID;
      return cid && !cid.startsWith('SEU_');
    },
    // /common suporta tanto contas pessoais (Outlook.com, Hotmail, Live) quanto corporativas/educacionais (M365)
    authEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    graphBase: 'https://graph.microsoft.com/v1.0',
    meEndpoint: 'https://graph.microsoft.com/v1.0/me',
    messagesEndpoint: 'https://graph.microsoft.com/v1.0/me/messages',
    /**
     * Escopos delegados mínimos necessários:
     * - User.Read: para obter o email/nome da conta conectada
     * - Mail.Read: para pesquisar mensagens na caixa de entrada e obter faturas/anexos
     */
    scopes: [
      'User.Read',
      'Mail.Read'
    ],
    defaultQuery: 'fatura'
  }
};
