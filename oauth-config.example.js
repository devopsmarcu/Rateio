// ==========================================================================
// Rateio de Faturas — Exemplo de configuração OAuth (Gmail e Outlook)
// ==========================================================================
//
// Arquivo de REFERÊNCIA para o responsável pelo aplicativo.
// Os valores reais devem ser definidos em oauth-config.js — substituindo as
// constantes GOOGLE_CLIENT_ID e MICROSOFT_CLIENT_ID.
//
// NÃO existem segredos aqui. Em uma SPA tudo que vai ao navegador é público,
// então nunca há Client Secret. Os Client IDs são públicos por natureza.
//
// A Redirect URI é derivada da própria página (origem + caminho). Cadastre
// exatamente o mesmo valor nos dois consoles. Exemplos:
//   - GitHub Pages (projeto): https://devopsmarcu.github.io/rateio/
//   - Domínio próprio:        https://meusite.com/
//
// Enquanto os valores permanecerem como "SEU_*", as integrações ficam
// indisponíveis e o usuário vê apenas o aviso administrativo.

export default {
  // ----------------------------------------------------------------------
  // Google Cloud Console (Gmail)
  // ----------------------------------------------------------------------
  // 1. https://console.cloud.google.com/ -> criar/selecionar um projeto.
  // 2. "APIs e serviços" -> Biblioteca -> ativar a "Gmail API".
  // 3. "Tela de consentimento OAuth" (tipo Externo): preencha os dados e, enquanto o
  //    app não estiver verificado, cadastre os usuários de teste.
  // 4. "Credenciais" -> "Criar credenciais" -> "ID do cliente OAuth"
  //    -> Tipo: "Aplicativo da Web".
  // 5. "Origens JavaScript autorizadas": https://devopsmarcu.github.io
  // 6. "URIs de redirecionamento autorizados": https://devopsmarcu.github.io/rateio/
  // 7. Escopo usado pelo app (somente leitura): https://www.googleapis.com/auth/gmail.readonly
  //
  // ATENÇÃO: gmail.readonly é um escopo RESTRITO. Para uso público, o Google
  // exige verificação/avaliação de segurança. Até concluir, apenas contas de
  // teste autorizam. Um Client ID válido NÃO dispensa essa exigência.
  GOOGLE_CLIENT_ID: '123456789012-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com',

  // ----------------------------------------------------------------------
  // Microsoft Entra (Outlook / Hotmail / Microsoft 365)
  // ----------------------------------------------------------------------
  // 1. https://entra.microsoft.com/ -> "Registros de aplicativo" -> "Novo registro".
  // 2. Tipos de conta: "Contas em qualquer diretório organizacional e contas
  //    pessoais da Microsoft (ex.: Skype, Xbox, Outlook.com)".
  // 3. "Autenticação" -> adicionar plataforma "Aplicativo de página única (SPA)"
  //    -> Redirect URI: https://devopsmarcu.github.io/rateio/
  //    (o fluxo usa Authorization Code + PKCE; não há segredo nem popup).
  // 4. "Permissões de API" -> Microsoft Graph -> permissões delegadas:
  //    "User.Read" e "Mail.Read" (somente leitura).
  // 5. Se a organização exigir, conceder consentimento administrativo.
  MICROSOFT_CLIENT_ID: '00000000-0000-0000-0000-000000000000'
};
