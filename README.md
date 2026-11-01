# Rateio de Faturas

Rateio de Faturas é uma aplicação web pensada para organizar despesas compartilhadas e acompanhar pagamentos entre participantes de forma simples, local e privada.

A ideia central do projeto é reunir faturas de diferentes fontes, identificar despesas, definir como cada item será rateado e manter o controle do que cada pessoa deve e o que já foi pago.

O aplicativo foi concebido para funcionar diretamente no navegador, mantendo os dados financeiros no dispositivo do usuário, sem depender de um servidor próprio para armazenar as informações do cadastro financeiro.

## Visão geral

Em muitos lares e grupos de amigos, as despesas são divididas entre pessoas com cartões, contas e faturas diferentes. Isso gera dificuldade para:

- reunir todas as faturas em um só lugar;
- identificar compras compartilhadas;
- calcular cada participação corretamente;
- registrar pagamentos pendentes e concluídos;
- manter o controle mensal sem usar planilhas manuais.

O projeto resolve esse problema oferecendo uma base para:

1. importar faturas e informações de compras;
2. organizar despesas por participante;
3. definir divisão por valor ou percentual;
4. acompanhar pagamentos e saldos;
5. manter a organização financeira local no navegador.

## Problema que o projeto resolve

Imagine uma casa ou grupo de pessoas com cartões e contas diferentes. Algumas compras são compartilhadas, outras são exclusivas, e há despesas recorrentes que precisam ser distribuídas mensalmente.

Sem uma ferramenta centralizada, é comum que cada pessoa:

- abra cada fatura separadamente;
- identifique manualmente os itens compartilhados;
- calcule valores em planilha;
- acompanhe quem já pagou e quem ainda deve;
- repita o processo a cada mês.

O Rateio de Faturas busca automatizar esse processo e transformar a informação dispersa em um panorama financeiro organizado.

## Funcionalidades principais

### 1. Centralização de faturas

O sistema pode receber faturas e dados financeiros de diferentes fontes, como:

- Gmail;
- Outlook;
- arquivos PDF;
- arquivos HTML;
- texto copiado de faturas.

A ideia é permitir que o usuário importe o conteúdo de forma simples e revisável.

### 2. Extração e validação de dados

Depois de importar uma fatura, o aplicativo pode:

- identificar valores;
- localizar descrições de compras;
- reconhecer datas e vencimentos;
- detectar parcelas e compras recorrentes;
- separar o total da fatura do valor das despesas individuais.

Antes de registrar as informações, o usuário pode revisar o que foi extraído para reduzir erros.

### 3. Rateio de despesas

O principal núcleo do sistema é a divisão correta dos custos entre os participantes.

#### Rateio por valor

O usuário define quanto cada pessoa deve pagar em um item, e o sistema valida se o total bate com a despesa.

#### Rateio por percentual

Uma despesa pode ser dividida em porcentagens, e o sistema calcula automaticamente os valores correspondentes.

#### Parcelamentos

O projeto contempla o tratamento de compras parceladas, permitindo distinguir:

- valor total da compra;
- número de parcelas;
- valor de cada parcela;
- parcelas já importadas;
- responsabilidade financeira da compra.

#### Despesas recorrentes

Regras de rateio podem ser reaproveitadas em meses seguintes para simplificar o acompanhamento de assinaturas e contas rotineiras.

### 4. Controle de pagamentos

O sistema também pode acompanhar:

- valores devidos;
- pagamentos pendentes;
- pagamentos concluídos;
- saldo final de cada participante.

Essa funcionalidade é essencial para transformar a divisão em uma visão financeira realmente útil.

### 5. Backups e exportação

Como os dados ficam no navegador, a exportação do banco local é vital. A proposta inclui:

- exportar o banco SQLite para um arquivo de backup;
- preservar as informações fora do navegador;
- permitir recuperação em caso de perda de dados localmente.

## Arquitetura proposta

A arquitetura do projeto foi pensada para reduzir dependência de backend e maximizar privacidade.

### Fluxo conceitual

```text
Usuário
  |
  v
Interface web (HTML + CSS + JavaScript)
  |
  v
Importação de faturas e dados
  |
  v
Extração e validação
  |
  v
SQLite local no navegador
  |
  v
Pessoas / Faturas / Despesas / Rateios
  |
  v
Resumo financeiro e pagamentos
```

### Componentes principais

#### Frontend

A interface pode ser implementada com:

- HTML para estrutura;
- CSS para layout e responsividade;
- JavaScript para regras de negócio e interações.

A proposta também inclui uma abordagem PWA para permitir:

- instalação como aplicativo no dispositivo;
- uso em tela inicial;
- melhor experiência móvel;
- funcionamento parcial offline.

#### Banco local

O projeto foi pensado para usar SQLite diretamente no navegador. Isso permite manter dados estruturados sem depender de um servidor de banco de dados próprio.

O fluxo básico é:

```text
Navegador
  |
  v
JavaScript
  |
  v
SQLite via WebAssembly
  |
  v
OPFS (Origin Private File System)
```

Esse modelo favorece a autonomia do usuário e reduz a necessidade de infraestrutura central.

#### Web Worker

Operações de banco podem ser executadas em um Web Worker para não bloquear a interface principal. Isso ajuda a manter a aplicação responsiva mesmo com consultas e gravações mais pesadas.

## Integrações com e-mail

O projeto contempla a possibilidade de importar faturas do Gmail e do Outlook, com autorização do usuário.

### Gmail

A integração pode usar OAuth 2.0 para permitir que a aplicação leia apenas as mensagens necessárias.

Fluxo conceitual:

```text
Usuário -> Rateio de Faturas -> Google -> Autorização -> Gmail API
```

### Outlook

A integração com Outlook pode usar a Microsoft Identity Platform e o Microsoft Graph para buscar mensagens autorizadas pelo usuário.

Fluxo conceitual:

```text
Usuário -> Rateio de Faturas -> Microsoft -> Autorização -> Microsoft Graph
```

Essas integrações devem solicitar apenas permissões mínimas e respeitar princípios de segurança e privacidade.

## Conexão com Gmail e Outlook

O aplicativo permite que **qualquer usuário** conecte a **própria** conta de e-mail (Gmail ou Outlook)
e importe faturas diretamente. O usuário **não** precisa criar projetos no Google Cloud ou no
Microsoft Entra, informar Client IDs, configurar APIs ou executar qualquer procedimento técnico.

Toda a configuração é feita **uma única vez** pelo responsável pelo aplicativo, em
[oauth-config.js](oauth-config.js). Não existe — e não deve existir — nenhuma tela de configuração de
credenciais para o usuário comum.

### Como funciona para o usuário

1. Em **Faturas → Importar**, escolher **Gmail** ou **Outlook**.
2. Autorizar o acesso na janela oficial do provedor (Google ou Microsoft).
3. Pesquisar as mensagens, escolher a fatura e importar.

Os detalhes técnicos (OAuth, PKCE, Client ID, escopos, Redirect URI) ficam totalmente escondidos do
usuário. Se a integração ainda não tiver sido configurada pelo responsável, o aplicativo exibe apenas
um aviso administrativo, sem instruções técnicas.

### Configuração administrativa (responsável pelo aplicativo)

Os Client IDs reais são definidos **somente no código**, editando [oauth-config.js](oauth-config.js).
Consulte os comentários de [oauth-config.example.js](oauth-config.example.js). Enquanto os valores
permanecerem como `SEU_*`, as conexões ficam indisponíveis e o usuário vê o aviso administrativo.

> Nunca inclua *Client Secret* no frontend — uma SPA pública não possui segredo. Os Client IDs são
> públicos por natureza em aplicações executadas no navegador.

A **Redirect URI** é derivada automaticamente da página atual (origem + caminho). O mesmo valor
precisa ser cadastrado nos dois consoles. Para o GitHub Pages em subdiretório, por exemplo:
`https://devopsmarcu.github.io/rateio/`.

#### Google Cloud (Gmail)

1. Criar/selecionar um projeto no [Google Cloud Console](https://console.cloud.google.com/).
2. Ativar a **Gmail API**.
3. Configurar a **Tela de consentimento OAuth** (tipo Externo) e cadastrar os usuários de teste
   enquanto o app não estiver verificado.
4. Criar um **ID do cliente OAuth** do tipo **Aplicativo da Web**.
5. Em **Origens JavaScript autorizadas**, incluir a origem de publicação, por exemplo
   `https://devopsmarcu.github.io`.
6. Em **URIs de redirecionamento autorizados**, incluir a URL do app, por exemplo
   `https://devopsmarcu.github.io/rateio/`.
7. Escopo utilizado: `https://www.googleapis.com/auth/gmail.readonly` (somente leitura de mensagens).

A implementação usa o **Google Identity Services (GIS)** com o escopo mínimo `gmail.readonly`
(pesquisar mensagens, ler o corpo e baixar anexos). Nenhuma permissão de envio, exclusão ou
modificação é solicitada.

> **Verificação obrigatória:** `gmail.readonly` é um escopo restrito. Para uso **público**, o Google
> exige um processo de verificação/avaliação de segurança. Enquanto isso não é concluído, apenas
> contas de teste cadastradas conseguem autorizar. Um Client ID válido **não** dispensa essa exigência.

#### Microsoft Entra (Outlook / Hotmail / Microsoft 365)

1. Acessar o [Microsoft Entra](https://entra.microsoft.com/) (ou o portal do Azure).
2. **Registros de aplicativo → Novo registro**.
3. Tipos de conta: *Contas em qualquer diretório organizacional e contas pessoais da Microsoft*.
4. Em **Autenticação**, habilitar a plataforma **Single-page application (SPA)** e cadastrar a
   Redirect URI (`https://devopsmarcu.github.io/rateio/`). O fluxo usa **Authorization Code + PKCE**.
5. Permissões de API delegadas do **Microsoft Graph**: `User.Read` e `Mail.Read` (somente leitura).
6. Se a organização exigir, conceder **consentimento administrativo**.

A implementação usa o **MSAL Browser** com `loginRedirect` (Authorization Code + PKCE) e o
**Microsoft Graph** para pesquisar e ler mensagens e anexos.

### Notas de arquitetura

O aplicativo é servido com `Cross-Origin-Opener-Policy: same-origin` e
`Cross-Origin-Embedder-Policy: require-corp`, necessários para o `SharedArrayBuffer`/OPFS do SQLite.
Como o COOP secciona janelas de popup, o fluxo do Google (que depende de popup) é executado na página
ponte [oauth.html](oauth.html), servida **sem** esses cabeçalhos, e o resultado volta por
`BroadcastChannel`. O Outlook usa redirect, portanto não depende de popup. Nenhuma dessas etapas
aparece para o usuário.

### Segurança

- os tokens de acesso ficam **apenas em `sessionStorage`** (efêmeros, por aba) — nunca em `localStorage`;
- nenhuma senha e nenhum *Client Secret* são usados ou armazenados;
- tokens e conteúdo de mensagens **nunca são escritos em logs** (a função `redact` mascara dados sensíveis);
- ao desconectar, todo o estado (tokens, e-mail e cache) é removido.

### Como testar

```bash
node test_oauth.mjs
```

A suíte usa *mocks* das APIs externas, não requer credenciais reais e verifica, entre outros, que
tokens nunca aparecem em logs e que os tokens ficam apenas em `sessionStorage`.

> Funcionar com a conta do desenvolvedor **não** significa que a integração está pronta para uso
> público: o processo de verificação, consentimento e políticas dos dois provedores ainda é necessário.

## Segurança e privacidade

Este projeto lida com informações financeiras sensíveis, portanto a privacidade é um ponto crítico.

### Principais considerações

- os dados financeiros ficam no dispositivo do usuário;
- o acesso a contas de e-mail depende de autorização explícita;
- tokens de acesso devem ser tratados com cuidado;
- os dados armazenados localmente devem ser protegidos e respaldados;
- o projeto não deve assumir que o navegador ou o dispositivo são infalíveis;
- a aplicação deve tratar explicitamente a possibilidade de perda de dados e recuperar informações por backup.

## GitHub Pages e publicação

O projeto foi pensado para ser publicado em páginas estáticas, como GitHub Pages.

Isso combina com a proposta de aplicação web local e sem backend próprio, pois a interface pode ser distribuída como um site estático.

No entanto, vale lembrar que:

- hospedar no GitHub Pages não torna o site privado automaticamente;
- recursos de armazenamento local dependem do navegador e do ambiente;
- a compatibilidade com mobile, especialmente Safari no iPhone, precisa ser validada.

## Requisitos e desafios

A arquitetura do Rateio de Faturas é interessante, mas apresenta desafios importantes:

- perda de dados locais;
- ausência de sincroniza��ão entre dispositivos;
- dependência da compatibilidade do navegador;
- necessidade de validação de integrações OAuth;
- desafios de extração de dados em PDFs e e-mails com formatos diferentes;
- risco de importação duplicada;
- arredondamento de valores financeiros;
- importação e restauração de backups.

## Prioridades de desenvolvimento

Com base na arquitetura proposta, o desenvolvimento ideal costuma seguir esta ordem:

1. garantir o cálculo correto de rateios e parcelas;
2. validar persistência do banco local;
3. testar as integrações Gmail e Outlook;
4. melhorar a extração e a revisão manual dos dados;
5. implementar robustez em backups e restauração;
6. validar experiência em dispositivos móveis;
7. preparar a aplicação para uso real com documentação e segurança.

## Futuras evoluções

O projeto pode crescer com melhorias futuras como:

- reconhecimento inteligente de faturas;
- regras reutilizáveis de rateio;
- histórico financeiro por mês;
- relatórios e resumos automáticos;
- backup automático;
- sincronização entre dispositivos.

Essas evoluções podem manter a filosofia de privacidade e processamento local, ou ampliar a arquitetura em direção a uma solução mais sofisticada quando necessário.

## Conformidade com Apple HIG (Human Interface Guidelines)

O aplicativo foi desenvolvido seguindo as diretrizes do **Apple Human Interface Guidelines** para oferecer uma experiência nativa de qualidade no iOS, iPadOS e macOS (via Safari/Standalone PWA).

### Principais pontos de conformidade implementados

#### Safe Areas (Áreas Seguras)
- Suporte completo a `env(safe-area-inset-*)` para notch, Dynamic Island e home indicator
- Tabbar com padding horizontal e inferior respeitando safe areas
- Bottom sheets com padding lateral dinâmico
- Viewport `viewport-fit=cover` sem desabilitar zoom do usuário

#### Touch Targets (Alvos de Toque)
- **Mínimo de 44pt** (CSS `var(--touch)`) para todos os elementos interativos
- Botões da tabbar, células, botões de ação, inputs, checkboxes, radio buttons
- Exceções documentadas para elementos decorativos (badges, ícones, dots)

#### Tab Bar (Barra de Abas)
- Altura **49pt** conforme especificação HIG
- Blur backdrop com `backdrop-filter: saturate(180%) blur(20px)`
- Ícones SF Symbols estilo outline (24pt → 25pt)
- Estado ativo com cor de acento do sistema (`--accent`)
- Feedback visual `:active` e `:focus-visible` para acessibilidade

#### Bottom Sheets (Modais Inferiores)
- Grabber (barra de arraste) visível no topo
- Swipe-to-dismiss via CSS (`.sheet-root.dragging`)
- `touch-action: pan-y` para scroll nativo
- Border-radius 20px nos cantos superiores
- Max-height 90dvh com scroll interno
- Safe-area padding inferior

#### Tipografia Semântica (Dynamic Type Ready)
- Escala completa iOS 17: Large Title (34px) → Caption2 (11px)
- Pesos semânticos: Regular (400) → Bold (700)
- Variáveis CSS para fácil manutenção e suporte futuro a Dynamic Type
- `font-variant-numeric: tabular-nums lining-nums` para valores monetários

#### Sistema de Movimento
- Curvas de easing padronizadas: `--motion-ease` (cubic-bezier(0.16, 1, 0.3, 1))
- Durações: fast (150ms), normal (250ms), slow (350ms)
- **Respeita `prefers-reduced-motion: reduce`** — desabilita todas as animações
- Transições consistentes em todos os componentes

#### Modo Escuro (Dark Mode)
- Paleta True OLED Black (`#000000` background)
- Cores de sistema iOS adaptadas (accent `#0A84FF`, etc.)
- `color-scheme: dark` no seletor `[data-theme="dark"]`
- Sombras desabilitadas no modo escuro (conforme HIG)

#### Alto Contraste
- Suporte a `prefers-contrast: more`
- Separações e preenchimentos mais opacos
- Funciona em ambos os temas (light/dark)

#### Acessibilidade (a11y)
- `:focus-visible` em todos os elementos interativos
- `role="dialog"`, `aria-modal="true"` nas sheets
- `aria-live="polite"` para toasts
- `aria-label` na tabbar
- Textos com contraste adequado (WCAG AA)
- Sem `user-scalable=no` — zoom por pinch permitido

#### Cores do Sistema iOS
- `--accent: #007AFF` (light) / `#0A84FF` (dark)
- `--ok: #34C759` / `#30D158`
- `--warn: #FF9500` / `#FFD60A`
- `--bad: #FF3B30` / `#FF453A`
- `--fill`, `--fill-secondary`, `--fill-tertiary` para backgrounds hierárquicos
- `--separator` / `--hairline` para divisórias (0.5px via rgba)

### Variáveis CSS Principais (Design Tokens)

```css
:root {
  /* Touch */
  --touch: 44px;
  
  /* Safe Areas */
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  
  /* Typography */
  --text-large-title: 34px;
  --text-title1: 28px;
  --text-title2: 22px;
  --text-title3: 20px;
  --text-headline: 17px;
  --text-body: 17px;
  --text-callout: 16px;
  --text-subheadline: 15px;
  --text-footnote: 13px;
  --text-caption1: 12px;
  --text-caption2: 11px;
  
  /* Weights */
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  
  /* Motion */
  --motion-ease: cubic-bezier(0.16, 1, 0.3, 1);
  --motion-ease-out: cubic-bezier(0, 0, 0.2, 1);
  --motion-duration-fast: 150ms;
  --motion-duration-normal: 250ms;
  --motion-duration-slow: 350ms;
}
```

### Validação no Dispositivo

Para testar a conformidade no iPhone/iPad:

1. **Instale como PWA** (Compartilhar → "Adicionar à Tela de Início")
2. Verifique:
   - Tabbar não coberta pelo home indicator
   - Sheets não cobertas pelo notch/Dynamic Island
   - Toque em qualquer botão — área mínima 44×44pt
   - Pinch-to-zoom funciona (acessibilidade)
   - Modo escuro automático (Configurações → Aparência)
   - Reduzir movimento (Ajustes → Acessibilidade → Movimento)
   - Alto contraste (Ajustes → Acessibilidade → Tela e Tamanho do Texto)
   - VoiceOver — navegação por foco visível

---

> **Nota**: Esta implementação é puramente CSS/HTML/comportamental. Não houve alterações na lógica de negócio, SQL, Web Workers ou estrutura do `app.js`.

## Resumo executivo

Rateio de Faturas é um aplicativo para centralizar faturas, organizar despesas compartilhadas, calcular rateios e acompanhar pagamentos entre participantes.

Sua proposta principal é combinar:

- interface web simples;
- importação de faturas de diferentes fontes;
- lógica de rateio por valor e percentual;
- armazenamento local em SQLite;
- processamento no navegador;
- privacidade e autonomia do usuário.

Em uma frase: o projeto transforma faturas dispersas em um controle financeiro local, organizado e automatizado para pessoas que dividem despesas.

## Observação

Esta documentação foi elaborada com base na arquitetura e no contexto descrito para o projeto. Ela serve como guia de visão geral, arquitetura e objetivos do aplicativo, e pode ser ajustada conforme a implementação real do repositório evoluir.

## Licença

A licença do projeto deve ser definida conforme a política do repositório. Se ainda não houver uma licença formal, o ideal é incluir uma opção adequada, como MIT, para facilitar uso, adaptação e contribuição.

---

Se quiser, posso também gerar uma versão mais curta e comercial do README, uma versão para GitHub com badges e instruções de instalação, ou até uma documentação técnica mais detalhada com diagramas e estrutura de pastas.
