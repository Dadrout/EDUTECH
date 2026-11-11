# BilimLens integration and release plan

**Goal:** Finish the recovered analytics suite and integrate BilimLens branding and a consistent interface without losing previous work.
**Architecture:** Preserve the Next.js App Router, browser-only dataset provider, typed nine-language dictionaries and pure analytics modules. Reports compose existing engine outputs; scenarios describe allocations, never predict attainment.
**Spec:** User takeover brief and `PRODUCT.md`; existing contracts in `docs/tasks/`.

## Recovery evidence

- Base: `feature/analytics-suite`, f7b8823, includes i18n d886112.
- Design source: `design/unslop-v2`, d4c5727; only PRODUCT.md differs.
- Uncommitted F1 source: `codex-skills`; F2 source: `codex-scenario`.
- Original worktrees remain untouched. Integration workspace: `/home/dadrout/bilimlens-integration`, branch `integration/bilimlens`.
- Baseline: 62 passing, 7 failing tests (new translations missing); TypeScript fails for the same missing keys. Existing F1/F2/F3 engine contracts throw.
- Disk initially 4.7 GB available; dependencies reused with filesystem reflinks, no installation.
- Local HTTP listening and Chromium launch fail with EPERM in this sandbox. No valid before screenshots captured. Committed screenshots describe the incumbent only.

## Work and verification

- [x] Recover F1/F2 implementations and tests; check optional metadata import, repeated attempts, class counts, nonfinite scenario inputs, minimum and budget violations.
- [x] Implement `buildReport` and cross-check its values against engine calls, empty scopes and synthetic CSV.
- [x] Complete nine-language key/placeholder parity and BilimLens branding.
- [x] Add report route and print/PDF layout, all engine sections and honest limitations; add discoverable simulator navigation.
- [x] Apply shared design tokens, navigation, page and table hierarchy across all routes. Retain existing logo and functional semantics.
- [x] Extend browser checks for new features, print, all locales and desktop/tablet/mobile. Execute when the environment permits; record blocked checks without claiming success.
- [x] Run TypeScript, ESLint, unit tests and production build; independent review; fix actionable findings.
- [x] Update README and release evidence; prepare integration commit and deployment instructions. Publishing and deployment require final user approval under the global working rules.

## Design direction

Operate mode: a precise methodologist workspace, compact persistent navigation, warm neutral canvas, white analytical surfaces, deep teal brand accent, consistent semantic red/amber/green. Onest remains the sole UI font; measured values use aligned numerals. Tables and charts lead, annotations carry uncertainty. No new logo, visual assets or dependencies.

## Review focus

Missing metadata must remain absent; small samples must not become verdicts. Scenario controls must reset when plan inputs change. Reports must show their true scope and distinguish defaults from edited plans. Data-dependent strings must render in the selected locale. PDF printing must not clip wide tables or include navigation.

## Outcome

139 tests, TypeScript, warning-free lint and production Webpack build pass. All three functional review findings were fixed and regression-tested. Browser/visual/responsive/accessibility/PDF release gates remain open due sandbox EPERM. GitHub DNS and Vercel team authorization also block external publication. Detailed evidence and recovery steps: `docs/RELEASE.md`.
