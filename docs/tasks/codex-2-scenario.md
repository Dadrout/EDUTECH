# Codex task 2 — What-if curriculum simulator: constraints and scenario comparison

You are working in a git worktree of a Next.js 16 / TypeScript project (Data-Driven Curriculum). Read `AGENTS.md`, `src/lib/analytics/hours.ts` (the existing recommendation algorithm — note it works in integer half-hour units to avoid float errors) and `tests/hours.test.ts` first.

## Goal
Implement the pure logic behind the fixed contract in `src/lib/analytics/scenario.ts`: a curriculum specialist edits hours per topic by hand; the UI shows remaining budget, constraint violations and a comparison of three plans (current, recommended, custom). **No predictions of learning outcomes** — only hours, constraints and how hours shift relative to the existing priority formula.

## Files you own (edit only these)
- `src/lib/analytics/scenario.ts` — implement every function. **Do not change exported types or signatures.** Private helpers are fine.
- `tests/scenario.test.ts` (new).
Do not edit any other file. No user-facing strings (UI text is translated elsewhere); issues are structured data only.

## Requirements
- Work in integer half-hours internally (like `hours.ts`: `toU = round(h*2)`), return hours as numbers.
- `initialScenario(rows, from)`: `{ [row.key]: row.recommendedHours | row.currentHours }`.
- `snapHours(value, step)`: round to the nearest multiple of `step` (step is a multiple of 0.5; treat non-positive/invalid step as 0.5), never below 0, no float artefacts (0.1+0.2 problems).
- `evaluateScenario(rows, custom, params)`:
  - Missing keys in `custom` fall back to the current hours; unknown keys are ignored.
  - Errors: `negative` (hours < 0), `not_half_hour` (not a multiple of 0.5), `below_minimum` (hours < minHours; limit = minHours), `over_budget` (total > params.budgetHours; hours = total, limit = budget).
  - Warnings: `under_budget` (total < budget; reserve), `above_max_increase` (custom > current × (1 + maxIncreaseShare); limit = that bound), `below_max_decrease` (custom < current and custom < current × (1 − maxDecreaseShare) while still ≥ minHours; limit = that bound), `changed_without_data` (custom ≠ current for a topic with `!sufficient` or `rate === null`).
  - Use a small epsilon / half-hour arithmetic so equality at the boundary is not reported.
  - `rows`: one `ScenarioRow` per input row in input order; `priority` = row.priority.
  - Summaries for current / recommended / custom plans with the same `PlanSummary` definition: `total`, `remaining = budget − total`, `changedTopics` and `movedHours` vs current, `hoursBelowTarget` (topics with `sufficient && rate !== null && rate*100 < params.targetPct`), `shareBelowTarget` (null when total = 0), `priorityShift = Σ pᵢ × (hoursᵢ − currentᵢ)` over below-target topics where `pᵢ = (targetPct − 100·rateᵢ) / targetPct` (identical to the recommender's priority formula). Current plan summary therefore has movedHours = 0 and priorityShift = 0.
  - `valid` = no error issues. Issues ordered: errors first (budget first), then warnings, then by input row order.
- `moveHours(custom, rows, fromKey, toKey, hours, step)`: move `snap(hours)` from → to, limited by `from`'s hours above its minimum (never below min); returns the same object when nothing can move or keys are invalid/equal.

## Tests (must add)
- Budget conservation and `remaining`; float safety (e.g. 0.5 steps summing to exact totals).
- Every issue kind triggers exactly at the right boundary (not at equality).
- Missing/unknown keys behaviour.
- `moveHours` respects minimum and step.
- **Invariant:** for randomized valid inputs (reuse the style of the "сотни случайных планов" test in `tests/hours.test.ts`), take `recommendHours(...)`; when `ok`, `evaluateScenario(plan.rows, initialScenario(plan.rows, "recommended"), params)` has `valid === true`, `custom.total + custom.remaining === budget`, and `custom.total === plan.recommendedTotal`.
- Summary formulas on a hand-computed example (priorityShift, shareBelowTarget).

## Done when
- `/home/dadrout/data-driven-curriculum/node_modules/.bin/tsc --noEmit` passes
- `/home/dadrout/data-driven-curriculum/node_modules/.bin/vitest run` passes
- `/home/dadrout/data-driven-curriculum/node_modules/.bin/eslint src tests` passes
- Do not commit; leave changes in the working tree.
- Final message: changed files, decisions, test results, edge cases or concerns about the contract.
