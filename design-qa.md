# Design QA — Faturas / Fila por urgência

## Evidências

- Fonte visual: `C:\Users\marcola\.codex\generated_images\01a1febd-8049-7023-ad77-bf8f5b2ad721\exec-f4e983b7-85f1-4862-b27d-bdf1558c414a.png`
- Implementação em tema escuro: `C:\temp\rateio\screenshots\faturas-option-2-dark.png`
- Implementação em tema claro: `C:\temp\rateio\screenshots\faturas-option-2-light.png`
- Comparação normalizada: `C:\temp\rateio\screenshots\faturas-option-2-comparison.png`
- Viewport CSS: `390 x 844`, `deviceScaleFactor: 1`.
- Fonte: `852 x 1846` pixels, reduzida proporcionalmente para `390 x 844` na comparação.
- Implementação: `390 x 844` pixels.
- Estado: novembro de 2026, lista populada, tema escuro; tema claro capturado separadamente.

## Comparação visual

A comparação completa normalizada foi aberta com a referência e a implementação lado a lado. A hierarquia principal corresponde à direção escolhida: título/importação, competência e total, pesquisa, status com contagens, filtros combináveis, bloco de atenção, lista cronológica compacta e navegação persistente.

Não foi necessário recorte adicional: no comparativo em escala CSS 1:1, tipografia, estados, valores, datas, ações e separadores permaneceram legíveis. As capturas individuais foram abertas para confirmar contraste e wrapping.

## Superfícies de fidelidade

- Tipografia: família do sistema preservada; pesos e tamanhos distinguem banco, valor, vencimento e metadados sem truncamento.
- Espaçamento e ritmo: linhas compactadas após a primeira comparação; duas urgências e parte da lista restante aparecem acima da navegação, sem cards excessivamente altos.
- Cores e tokens: usa tokens existentes para fundo, superfícies, texto, azul, sucesso, atenção e erro; claro e escuro mantêm contraste.
- Imagens e ícones: não há imagens raster necessárias. Avatares por sigla e ícones do sistema existente foram preservados, sem ativos aproximados novos.
- Texto e conteúdo: pagamento, vencimento e recebimentos são apresentados separadamente; valores usam Real brasileiro.

## Interações verificadas

- Busca por instituição (`Santander`) e texto relativo de vencimento.
- Filtro de status e banco combinados.
- Ordenação por maior valor.
- Estado vazio específico de divergências.
- Abertura de detalhes e atalho `Ratear` até os lançamentos.
- Importação permanece visível no cabeçalho.
- Console verificado: nenhuma falha da aplicação; apenas `favicon.ico` ausente no servidor local, sem impacto funcional.

## Histórico de comparação

1. Primeira passagem: `Importar` era cortado em largura estreita e as linhas exibiam densidade menor que a referência.
   - Correções: grade do cabeçalho ampliada; pagamento, recebimento e ação de rateio compactados; cópia redundante removida.
   - Evidência posterior: `faturas-option-2-comparison.png` mostra o cabeçalho completo e lista mais densa.
2. Segunda passagem: faturas próximas em até sete dias entravam indevidamente no bloco de ação imediata, e uma vencida repetia o estado de prazo no badge de pagamento.
   - Correções: somente vencidas e com vencimento hoje ficam em `Exigem atenção`; próximas continuam destacadas na lista normal; badge agora diz `Fatura pendente`.
   - Evidência posterior: captura final mostra `2 exigem atenção` e prazo/status separados.

## Achados

Nenhum achado P0, P1 ou P2 permanece.

### Follow-up P3

- A referência usa chips ilustrados para banco/período/ordenação; a implementação mantém seletores nativos do design system para melhor acessibilidade e coerência com o produto existente.
- A quantidade de resultados difere porque a base temporária de QA contém cinco faturas, enquanto a composição visual usa seis.

## Resultado

final result: passed
