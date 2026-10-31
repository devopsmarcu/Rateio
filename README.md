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

## Configuração OAuth (Gmail e Outlook)

A autenticação é configurada **uma única vez** pelo responsável pelo aplicativo (Client IDs públicos).
Cada usuário autoriza a **própria** conta ao usar a aplicação — ninguém precisa criar um projeto no
Google Cloud ou no Azure.

### Onde preencher os Client IDs

Os valores reais podem ser definidos de duas formas:

1. **Em tempo de execução**, na própria aplicação: *Ajustes → Gerenciar credenciais OAuth* (gravados em `localStorage`).
2. **No código**, editando [oauth-config.js](oauth-config.js) (constantes `DEFAULT_GOOGLE_CLIENT_ID` e
   `DEFAULT_MICROSOFT_CLIENT_ID`). Consulte o arquivo de exemplo comentado em
   [oauth-config.example.js](oauth-config.example.js).

Nunca inclua *Client Secret* no frontend — uma SPA pública não possui segredo. Os Client IDs são
públicos por natureza em aplicações executadas no navegador.

### Google Cloud (Gmail)

1. Criar/selecionar um projeto no [Google Cloud Console](https://console.cloud.google.com/).
2. Ativar a **Gmail API**.
3. Configurar a **Tela de consentimento OAuth** (tipo Externo) e cadastrar os usuários de teste
   enquanto o app não estiver verificado.
4. Criar um **ID do cliente OAuth** do tipo **Aplicativo da Web**.
5. Em **Origens JavaScript autorizadas**, incluir a origem de publicação, por exemplo
   `https://devopsmarcu.github.io`.
6. Em **URIs de redirecionamento autorizados**, incluir `https://devopsmarcu.github.io/rateio/`
   (ou a raiz, conforme o diretório do projeto).
7. Escopos utilizados: `https://www.googleapis.com/auth/gmail.readonly` (somente leitura de mensagens).

> **Verificação obrigatória:** `gmail.readonly` é um escopo restrito. Para uso **público**, o Google
> exige um processo de verificação/avaliação de segurança. Enquanto isso não é concluído, apenas
> contas de teste cadastradas conseguem autorizar. Um Client ID válido **não** dispensa essa exigência.

### Microsoft Entra (Outlook / Hotmail / Microsoft 365)

1. Acessar o [Microsoft Entra](https://entra.microsoft.com/) (ou o portal do Azure).
2. **Registros de aplicativo → Novo registro**.
3. Tipos de conta: *Contas em qualquer diretório organizacional e contas pessoais da Microsoft*.
4. Em **Autenticação**, habilitar a plataforma **Single-page application (SPA)** e cadastrar o
   redirect URI (`https://devopsmarcu.github.io/rateio/`). O fluxo usa **Authorization Code + PKCE**.
5. Permissões de API delegadas do **Microsoft Graph**: `User.Read` e `Mail.Read` (somente leitura).
6. Se a organização exigir, conceder **consentimento administrativo**.

### Como testar

```bash
node test_oauth.mjs
```

A suíte usa *mocks* das APIs externas e não requer credenciais reais.

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
