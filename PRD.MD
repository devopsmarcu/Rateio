# PRD — Rateio de Faturas

## 1. Visão do produto

**Rateio de Faturas** é uma aplicação web progressiva (PWA), voltada a grupos que compartilham despesas registradas em faturas de cartões ou contas. O produto centraliza faturas de diferentes bancos, permite dividir cada lançamento entre participantes e acompanha o que cada pessoa ainda deve pagar.

O funcionamento é local ao dispositivo: os dados são mantidos em um banco SQLite no navegador. O produto não requer servidor próprio para registrar faturas, pessoas ou rateios.

## 2. Problema resolvido

Famílias, casais e grupos de amigos frequentemente têm despesas compartilhadas em cartões diferentes. A conciliação manual dificulta saber quais compras pertencem a cada pessoa, quanto cada participante deve e quais valores já foram pagos.

O sistema organiza essas informações por fatura e banco, calcula a parcela atribuída a cada pessoa e oferece uma cobrança pronta para compartilhamento.

## 3. Público-alvo

- Pessoas que dividem despesas recorrentes ou pontuais.
- Responsáveis por consolidar faturas de mais de um banco/cartão.
- Pequenos grupos que precisam controlar repasses via Pix.

## 4. Objetivos do produto

- Centralizar faturas e seus lançamentos em uma única visão mensal.
- Distribuir lançamentos entre pessoas por valor, percentual ou partes iguais.
- Dar transparência ao saldo pendente de cada participante.
- Facilitar a cobrança e o recebimento por Pix.
- Preservar os dados localmente e disponibilizar backup/restauração.

## 5. Escopo funcional atual

### 5.1 Painel inicial

O painel exibe o resumo do mês selecionado, incluindo:

- total das faturas;
- total já rateado;
- valores pendentes por pessoa;
- alertas de faturas vencidas, próximas do vencimento ou com divergência entre lançamentos e total;
- atalhos para abrir faturas, pessoas e iniciar uma importação.

### 5.2 Faturas

O sistema permite:

- visualizar faturas por mês e filtrar por estado (todas, pendentes, pagas ou com divergência);
- identificar banco, valor, vencimento e estado de conferência;
- abrir a fatura para consultar lançamentos e resumo por participante;
- editar valor total e data de vencimento;
- marcar a fatura como paga ou pendente;
- excluir uma fatura, seus lançamentos e rateios associados;
- conferir se a soma dos lançamentos corresponde ao valor total informado.

Cada fatura pertence a um banco e a um mês de referência. O cadastro alerta quando já existe uma fatura para a mesma combinação de banco e mês.

### 5.3 Importação de faturas

As faturas podem ser importadas a partir de:

- texto colado manualmente;
- arquivo, incluindo PDF quando suportado pelo navegador;
- mensagens do Gmail;
- mensagens do Outlook.

Durante a importação, o sistema extrai ou permite corrigir banco, mês, vencimento, valor total e lançamentos. Antes de salvar, a pessoa usuária revisa os dados e pode editar ou remover itens. O sistema também busca rateios anteriores do mesmo banco para sugerir reaproveitamento e reconhece lançamentos recorrentes/parcelados.

O acesso ao Gmail e Outlook depende de configuração OAuth e autorização explícita do usuário.

### 5.4 Rateio de lançamentos

Cada lançamento de uma fatura pode ser distribuído entre participantes:

- por valores definidos manualmente;
- por porcentagens;
- em partes iguais;
- reaproveitando um rateio anterior compatível.

O lançamento pode ser marcado como recorrente. Compras parceladas e recorrências aparecem na área de **Parcelas**, que projeta os meses seguintes e informa se a fatura correspondente já foi importada.

### 5.5 Pessoas e pagamentos

É possível cadastrar, editar e excluir participantes, com nome e chave Pix opcional. Para cada pessoa, o sistema apresenta no mês escolhido:

- total devido;
- total pago;
- saldo pendente;
- lançamentos atribuídos, banco de origem e estado de pagamento.

Cada fração de rateio pode ser marcada individualmente como paga. Marcar uma fatura como paga não altera automaticamente os pagamentos individuais dos participantes.

### 5.6 Cobrança via Pix

Na tela de uma pessoa, o produto gera um texto de cobrança para copiar ou compartilhar. A cobrança atual:

- considera somente lançamentos ainda não pagos;
- agrupa as cobranças em seções separadas por banco;
- informa o vencimento de cada seção, os lançamentos, os subtotais por banco e o total geral;
- inclui a chave Pix quando cadastrada;
- gera um código Pix copia e cola (BR Code EMV) quando a chave Pix estiver disponível.

O nome e a cidade do recebedor usados no Pix podem ser configurados nos ajustes.

### 5.7 Ajustes, privacidade e backup

Os ajustes disponíveis incluem tema visual, configuração de dados do recebedor Pix e conexão/desconexão de contas Google e Microsoft.

O sistema permite exportar o banco SQLite como backup e restaurar um backup previamente exportado. A restauração substitui todos os dados locais atuais após confirmação.

## 6. Fluxo principal

1. Cadastrar participantes e, opcionalmente, suas chaves Pix.
2. Importar ou cadastrar uma fatura, revisando banco, vencimento, total e lançamentos.
3. Definir o rateio de cada lançamento.
4. Consultar o saldo mensal de cada participante.
5. Copiar ou compartilhar a cobrança agrupada por banco.
6. Marcar as frações recebidas como pagas.
7. Exportar backup periodicamente.

## 7. Regras de negócio relevantes

- O valor devido por uma pessoa é a soma das frações de rateio não pagas no mês selecionado.
- A conferência de uma fatura considera divergente uma diferença superior a R$ 0,05 entre o total da fatura e a soma dos lançamentos.
- A cobrança não inclui rateios já marcados como pagos.
- O total geral da cobrança é a soma de todos os subtotais pendentes por banco.
- Bancos diferentes nunca são misturados na mesma seção da mensagem de cobrança.
- O vencimento é informado em cada seção de banco; quando ausente, a mensagem indica que não foi informado.
- A exclusão de fatura remove seus lançamentos e rateios associados.

## 8. Dados armazenados

O banco local contém, principalmente, as seguintes entidades:

| Entidade | Responsabilidade |
| --- | --- |
| Pessoas | Participantes, nome e chave Pix |
| Bancos | Instituições financeiras vinculadas às faturas |
| Faturas | Banco, mês de referência, valor total, vencimento e estado de pagamento |
| Lançamentos | Compras/despesas de cada fatura, inclusive dados de parcela e recorrência |
| Rateios | Fração de cada lançamento atribuída a uma pessoa e seu estado de pagamento |

## 9. Requisitos não funcionais

- Interface responsiva, pensada para uso móvel e inspirada em padrões visuais do iOS.
- Funcionamento como PWA, com cache de arquivos essenciais para uso recorrente.
- Persistência local via SQLite/OPFS no navegador compatível.
- Dados financeiros não são enviados a um servidor próprio.
- Integrações externas são limitadas à leitura autorizada de e-mails no Gmail e Outlook.

## 10. Limitações atuais

- Os dados ficam vinculados ao navegador/dispositivo; a exportação de backup é essencial antes de trocar ou limpar o aparelho.
- A leitura de PDFs e a extração de dados variam conforme o formato da fatura.
- As integrações de e-mail exigem credenciais OAuth configuradas para o ambiente em uso.
- O produto não executa transferências financeiras: ele gera cobrança e código Pix, mas o pagamento ocorre fora do aplicativo.

## 11. Indicadores de sucesso sugeridos

- percentual de faturas importadas que são salvas após revisão;
- percentual de lançamentos que recebem rateio;
- tempo médio entre importar a fatura e gerar a cobrança;
- percentual de cobranças liquidadas por participante no mês;
- frequência de exportação de backup.

## 12. Próximas oportunidades

- Relatórios históricos por pessoa, banco e categoria.
- Notificações de vencimento e pendências de pagamento.
- Categorias e regras automáticas de classificação de lançamentos.
- Sincronização opcional e segura entre dispositivos.
- Exportação de resumos em PDF ou planilha.

