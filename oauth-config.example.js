// ==========================================================================
// Rateio de Faturas — Arquivo de Exemplo de Configuração OAuth 2.0
// Copie ou configure os valores reais em oauth-config.js
// ==========================================================================

export const OAUTH_EXAMPLE_CONFIG = {
  // Google Cloud Console:
  // 1. Acesse https://console.cloud.google.com/
  // 2. Crie um projeto e ative a "Gmail API"
  // 3. Em "Tela de consentimento OAuth", configure escopo "https://www.googleapis.com/auth/gmail.readonly"
  // 4. Em "Credenciais", crie "ID do cliente OAuth" -> Tipo: "Aplicativo da Web"
  // 5. Origens JavaScript autorizadas: https://devopsmarcu.github.io
  // 6. URIs de redirecionamento autorizados: https://devopsmarcu.github.io/
  GOOGLE_CLIENT_ID: '123456789012-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com',

  // Microsoft Entra (Azure Portal):
  // 1. Acesse https://entra.microsoft.com/ ou https://portal.azure.com/
  // 2. "Registros de aplicativo" -> "Novo registro"
  // 3. Tipos de conta: "Contas em qualquer diretório organizacional e contas pessoais da Microsoft (ex: Skype, Xbox, Outlook.com)"
  // 4. URI de Redirecionamento: Plataforma "SPA" (Single-page application) -> https://devopsmarcu.github.io/
  // 5. Permissões de API delegadas: Microsoft Graph -> "User.Read", "Mail.Read"
  MICROSOFT_CLIENT_ID: '00000000-0000-0000-0000-000000000000'
};
