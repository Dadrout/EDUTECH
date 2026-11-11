# Codex task 3 — Explainable report: assemble verified analytics

You are working in a git worktree of a Next.js 16 / TypeScript project (Data-Driven Curriculum). Read `AGENTS.md`, then `src/lib/analytics/*.ts` (topics, overview, insights, textbooks, hours, skills) and `src/lib/config/analysis-config.ts`.

## Goal
Implement `buildReport` behind the fixed contract in `src/lib/report/report.ts`. The report is a **structured data object** assembled exclusively from the existing analytics engine — the UI turns it into localized text and a printable PDF. Every number in the report must be exactly what the platform pages show for the same scope. No new formulas, no invented indicators, no ranking of textbooks beyond the engine's own verdicts.

## Files you own (edit only these)
- `src/lib/report/report.ts` — implement `buildReport`. **Do not change exported types or signatures.** Private helpers are fine.
- `tests/report.test.ts` (new).
No user-facing strings (UI text lives in `src/i18n`, owned by someone else).

## Requirements
- Scope: records filtered by `scope.subject` / `scope.grade` only (use `filterRecords(dataset.records, { ...EMPTY_FILTERS, subject, grade }, ["subject", "grade"])`). Curriculum entries filtered the same way.
- `sample`: counts over scoped records (students, classes, subjects, topics = topic keys, textbooks, tests, answers, date range — reuse `summarizeRecords` from `src/lib/data/validate-results.ts` if it fits), `datasetName`/`isSynthetic`/`excludedResultRows`/`removedDuplicates` from `dataset.meta`, `curriculumTopics` = scoped curriculum entries.
- `performance`: `computeTopicStats` → `computeOverview` (estimate = overview.kpis.estimate), `statusCounts` for all five `DifficultyStatus` values.
- `problemTopics`: topic stats with `isProblemStatus`, sorted by rate asc. `insufficientTopics`: `!sufficient`.
- `insights`: `computeInsights(records, topicStats, config)`.
- `skills`: `analyzeSkills(records, config)` when `coverage.hasSkills`, else `null`.
- `textbooks`: for every course (`listCourses`) in scope with ≥ 2 textbooks: `compareTextbooks({ records: courseRecords, textbookIds: all course textbooks sorted by name with naturalCompare, topicKey: null, referenceId: first of them, config })` — the same defaults the textbooks page uses. `textbookNames` id → name.
- `hours`: for every course in scope that has curriculum entries: `buildHoursInputs(dataset.curriculum, topicStatsOfCourse, subject, grade)`, then `recommendHours(inputs, { ...defaultHoursConfig(config), budgetHours: planTotal(...), mediumPct: config.thresholds.medium })` — identical to the hours page defaults. `unplannedTopics` = `unplanned.length`. Skip courses where `inputs` is empty.
- `quality` (include an item only when count > 0, except `synthetic` which is count 1 when `isSynthetic`): `synthetic`, `excluded_rows` (meta.excludedResultRows), `duplicates_removed`, `insufficient_topics`, `no_curriculum` (scope has results but no curriculum entries: count = number of courses), `courses_without_plan` (courses with results but without plan, only when some plan exists), `no_skill_data` (count = answers, when `!hasSkills`), `partial_skill_data` (answers without skill when hasSkills but not full), `single_class_textbooks` (textbook groups used in exactly one class across the report's textbook comparisons).
- `generatedAt = now.toISOString()`; everything else deterministic.
- Empty scope (no records) must not throw: zeros, empty arrays, `estimate` null.

## Tests (must add)
- Every number cross-checks the engine: estimate equals `computeOverview(...).kpis.estimate`; problem topics equal `computeTopicStats` filtered; hours plan equals a direct `recommendHours` call with the same params; textbook verdicts equal a direct `compareTextbooks` call.
- Scope filtering (subject only / subject+grade / all).
- Quality items on crafted fixtures (synthetic flag, excluded rows, no curriculum, partial skills, single-class textbook).
- Empty dataset → no throw; no NaN/Infinity anywhere (`findNonFinite` in tests/helpers.ts).
- Demo dataset smoke test: `datasetFromDemoCsv` on `public/demo/*.csv` builds a report for Алгебра 8 with a consistent textbook verdict and an ok hours plan whose recommendedTotal + reserveHours equals the budget.

## Done when
- `/home/dadrout/data-driven-curriculum/node_modules/.bin/tsc --noEmit` passes (ignore errors that are only in `src/i18n/messages/{kk,zh,es,fr,de,tr,uz}.ts` — missing translations are handled separately)
- `/home/dadrout/data-driven-curriculum/node_modules/.bin/vitest run` passes
- `/home/dadrout/data-driven-curriculum/node_modules/.bin/eslint src tests` passes
- Do not commit; leave changes in the working tree. Keep disk usage low (no large temp files outside the repo).
- Final message: changed files, decisions, test results, concerns.
