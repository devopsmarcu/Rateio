# Design QA — Dashboard Início “Saldo e ação”

## Evidence

- Source visual truth: `C:\Users\marcola\.codex\generated_images\01a1febd-8049-7023-ad77-bf8f5b2ad721\exec-5285477d-2d87-4e79-b320-af1bc6a5f5a8.png`
- Implementation screenshot: `C:\temp\rateio\screenshots\dashboard-option-1.png`
- Small-screen screenshot: `C:\temp\rateio\screenshots\dashboard-option-1-small.png`
- Light-theme screenshot: `C:\temp\rateio\screenshots\dashboard-option-1-light.png`
- Side-by-side comparison: `C:\temp\rateio\screenshots\dashboard-design-comparison.png`
- Source pixels: 852 × 1846, normalized at 50% to 426 × 923 CSS-equivalent pixels.
- Implementation pixels/CSS viewport: 430 × 932 at device scale factor 1.
- Additional responsive viewport: 360 × 800 at device scale factor 1.
- State: populated November 2026 dashboard, dark theme for the fidelity comparison.

## Full-view comparison

The side-by-side evidence confirms the selected hierarchy: month header, paired “A pagar/A receber” summary, useful paid/total progress, primary import action, prioritized issues, bank summary and people summary. The implementation preserves the same OLED iOS language, grouped surfaces, semantic urgency colors and bottom navigation.

The implementation intentionally keeps 44 px touch targets and readable 13–17 px product text. Consequently, lower sections continue below the first viewport instead of compressing every row into the frame as the generated reference does. This is an accessibility and production constraint, not unresolved visual drift.

## Focused comparison

The hero and priority regions are readable in the combined evidence, so separate crops were not required. Typography, dividers, monetary alignment, blue CTA, blue progress indicator, bank badges and action pills can be compared directly at normalized scale.

## Fidelity surfaces

- Fonts and typography: passed. System/SF Pro stack, tabular currency numerals and hierarchy match the reference closely; no clipping at 430 px or 360 px.
- Spacing and layout rhythm: passed. The summary, CTA and priority order match the selected direction. Production spacing is slightly more generous to retain touch targets.
- Colors and tokens: passed. OLED background, iOS blue, semantic warning states and light-theme equivalents use the existing design-system tokens.
- Image and asset fidelity: passed. The reference contains no raster imagery; implementation reuses the app’s existing icon and bank-badge system without placeholders.
- Copy and content: passed. All requested indicators are present with Brazilian currency formatting; “Resolver agora”, “Por banco” and the limited people list retain concise labels.

## Interaction verification

- “A pagar” opens Faturas with `pendentes` selected.
- “A receber” opens Cobranças.
- A bank row opens Faturas filtered by that bank.
- “Ver todas” opens Pessoas.
- Every navigation check preserved `S.mes = 2026-11`.
- Browser console on the final clean-profile run: no errors.

## Comparison history

### Iteration 1

- P2: Import CTA appeared after priorities instead of immediately below the summary.
- P2: A divergence was ordered before a bill due today.
- Fixes: moved CTA directly below the summary; added “Vence hoje” priority ahead of divergence.
- Post-fix evidence: `screenshots/dashboard-option-1.png`.

### Iteration 2

- P2: Progress used success green instead of the reference’s iOS blue.
- P2: Priority actions were plain links rather than strong quick-action pills.
- Fixes: switched progress to `--accent`; styled “Revisar/Ratear” as blue pills; restored the vertical divider between balance columns.
- Post-fix evidence: `screenshots/dashboard-design-comparison.png`.

## Findings

No actionable P0, P1 or P2 findings remain.

P3 follow-up: the generated reference shows only two priority rows while the implementation shows the three real priority categories from the requested product scope. This is an intentional content difference and improves coverage without changing calculations.

## Final result

final result: passed
