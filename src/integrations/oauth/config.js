// ==========================================================================
// Rateio de Faturas — Configuração centralizada das integrações de e-mail
// Gmail (Google Identity Services) e Outlook (Microsoft Identity / MSAL)
// ==========================================================================
//
// ARQUIVO ADMINISTRATIVO. Preenchido UMA VEZ pelo responsável pelo projeto.
// Os valores abaixo NÃO são segredos: em uma SPA tudo que vai ao navegador é
// público. Mesmo assim, o usuário comum nunca deve ver nem preencher estes
// campos — por isso não existe nenhuma tela de configuração de credenciais
// no aplicativo.
//
// Para liberar as integrações, substitua os valores "SEU_*" pelos IDs reais
// registrados nos consoles (ver README.md, seção "Configuração administrativa").
// Enquanto permanecerem como "SEU_*", o aplicativo exibe um aviso administrativo
// e as conexões ficam indisponíveis.

// --------------------------------------------------------------------------
// Client IDs (obrigatórios para liberar cada integração)
// --------------------------------------------------------------------------

// Google Cloud Console -> APIs e serviços -> Credenciais -> ID do cliente OAuth
// (tipo "Aplicativo da Web"). Ex.: 123456789012-abc....apps.googleusercontent.com
const GOOGLE_CLIENT_ID = 'SEU_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

// Microsoft Entra -> Registros de aplicativo -> Application (client) ID.
// Ex.: 00000000-0000-0000-0000-000000000000
const MICROSOFT_CLIENT_ID = 'SEU_MICROSOFT_CLIENT_ID';

// Texto exibido ao usuário comum quando a integração ainda não foi configurada.
export const ADMIN_NOT_CONFIGURED_MSG =
  'Esta integração ainda não está configurada. Entre em contato com o responsável pelo aplicativo.';

// --------------------------------------------------------------------------
// URL de redirecionamento
// --------------------------------------------------------------------------

/**
 * Redirect URI derivada da página atual (origem + caminho).
 * Funciona tanto em subdiretórios do GitHub Pages (ex.:
 * https://usuario.github.io/rateio/) quanto em domínio próprio.
 * O mesmo valor precisa estar cadastrado nos consoles do Google e da Microsoft.
 */
export function getRedirectUri() {
  const url = new URL(window.location.href);
  return `${url.origin}${url.pathname}`;
}

// --------------------------------------------------------------------------
// Configuração dos provedores
// --------------------------------------------------------------------------

const isPlaceholder = v => !v || /^SEU_/i.test(String(v));

export const OAUTH_CONFIG = {
  // Google Identity Services (GIS) + Gmail API
  google: {
    clientId: GOOGLE_CLIENT_ID,
    isConfigured() {
      return !isPlaceholder(this.clientId);
    },
    // Biblioteca oficial do Google (deve ser carregada de accounts.google.com).
    gisScriptUrl: 'https://accounts.google.com/gsi/client',
    apiBase: 'https://gmail.googleapis.com/gmail/v1/users/me',
    profileEndpoint: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    tokenRevokeEndpoint: 'https://oauth2.googleapis.com/revoke',
    /**
     * Escopo mínimo necessário: gmail.readonly permite pesquisar mensagens,
     * ler o corpo (texto/html) e baixar anexos (PDFs de faturas) e também
     * cobre users.getProfile (usado apenas para exibir o e-mail conectado).
     * Nenhuma permissão de envio, exclusão ou modificação é solicitada.
     * É um escopo restrito e exige verificação do Google para uso público.
     */
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    defaultQuery: 'fatura OR boleto newer_than:90d'
  },

  // Microsoft Identity Platform (MSAL Browser) + Microsoft Graph
  microsoft: {
    clientId: MICROSOFT_CLIENT_ID,
    isConfigured() {
      return !isPlaceholder(this.clientId);
    },
    // Biblioteca oficial (MSAL Browser). Servida com CORP: cross-origin, o que
    // a mantém compatível com o COEP exigido pelo OPFS.
    msalScriptUrl: 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.27.0/lib/msal-browser.min.js',
    // /common atende contas pessoais (Outlook.com, Hotmail, Live) e
    // corporativas/educacionais (Microsoft 365), conforme o registro da aplicação.
    authority: 'https://login.microsoftonline.com/common',
    graphBase: 'https://graph.microsoft.com/v1.0',
    meEndpoint: 'https://graph.microsoft.com/v1.0/me',
    messagesEndpoint: 'https://graph.microsoft.com/v1.0/me/messages',
    /**
     * Permissões delegadas mínimas:
     * - User.Read: exibir o e-mail/nome da conta conectada.
     * - Mail.Read: pesquisar e ler mensagens e anexos.
     * Nenhuma permissão de envio, exclusão ou modificação é solicitada.
     */
    scopes: ['User.Read', 'Mail.Read'],
    defaultQuery: 'fatura'
  }
};
