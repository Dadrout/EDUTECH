# Codex task 1 — Smart Error Analysis: data model + analytics

You are working in a git worktree of a Next.js 16 / TypeScript project (Data-Driven Curriculum, EdTech analytics for school curriculum specialists). Read `AGENTS.md`, `README.md` and `src/lib/analytics/{stats,topics}.ts` first to follow existing conventions (pure functions, clustered proportions by student, `config` thresholds, Russian code comments).

## Goal
Answers already exist per question. Add optional per-answer **skill** and **error category** metadata and implement the skill / question analytics behind the fixed contract in `src/lib/analytics/skills.ts`.

## Files you own (edit only these)
1. `src/lib/analytics/skills.ts` — implement every function. **Do not change exported types or signatures** (the UI is built against them). You may add private helpers.
2. `src/lib/data/schema.ts` — add two optional result columns to `RESULT_COLUMNS` (and `ResultColumnKey`): `skill` (key `skill`, aliases e.g. `навык`, `умение`, `skill name`, localAliases like other columns) and `error_type` (key `errorType`, aliases e.g. `тип ошибки`, `ошибка`, `error`, `error category`). Both `required: false`.
3. `src/lib/data/validate-results.ts` — parse them: trim; empty → `null`; `skill` kept for every answer; `errorType` kept only for incorrect answers (ignore it on correct answers, no error). Old files without these columns must import exactly as before. Preview rows should include the new columns. Do **not** add new user-facing message strings (all UI text lives in `src/i18n`, owned by someone else); reuse existing issue messages or none.
4. `scripts/generate-demo-data.ts` and the regenerated `public/demo/results.csv` — add `skill` and `error_type` columns to the synthetic demo:
   - Every topic gets 2–3 realistic skill names in Russian (the demo is Russian: e.g. «Алгебраические дроби» → «Сокращение дробей», «Приведение к общему знаменателю», «Сложение и вычитание дробей»). Each of the 6 questions maps to one skill (2–3 questions per skill). Make skills differ in difficulty: e.g. sort a topic's questions by their generated difficulty and group neighbours, so the hardest skill is visibly weaker.
   - Every incorrect answer gets an `error_type` code from `ERROR_TYPES` (`calculation`, `sign`, `concept`, `procedure`, `formula`, `units`, `reading`, `no_answer`) drawn from a skill-specific distribution (physics topics may use `units`; algebra mostly not). Leave ~5% of incorrect answers without a category to exercise partial coverage.
   - **Critical:** the existing columns must stay byte-identical (same `is_correct` values, same rows, same order). Use a *separate* PRNG stream (new seed) for error types; assign skills deterministically. Verify with: `cut -d, -f1-12` of old vs new `results.csv` — must be identical (watch out for quoted cells containing commas; compare by parsing if needed). Existing tests and the e2e smoke test depend on these numbers.
   - Regenerate with `/home/dadrout/data-driven-curriculum/node_modules/.bin/tsx scripts/generate-demo-data.ts`. `curriculum.csv` must not change.
5. `tests/skills.test.ts` (new) and, if useful, additions to `tests/import.test.ts` / `tests/helpers.ts` (only add, don't change existing expectations).

## Analytics requirements (`analyzeSkills`, `computeSkillDetail`)
- Input records are already filtered by the caller. Group skills by `topicKey` (`topicKeyOf`) + skill name (`makeSkillKey`). Records with `skill` null/undefined/empty are excluded from `skills` but counted in `coverage`.
- `estimate`: `clusteredProportion` with one `ClusterCount` per student, z = `config.confidenceZ`. `sufficient`: `students >= config.minStudentsPerTopic && answers >= config.minAnswersPerTopic`. `level`: `classifyLevel(rate, config.thresholds)` when sufficient, else `"insufficient"`.
- `topicRate` = success rate of the whole topic over the same records; `deltaFromTopic = rate − topicRate`.
- Errors: `normalizeErrorType` — trim; empty → null; case-insensitive match to a known code returns the code; otherwise the trimmed original text (unknown categories are kept, `known: false`). Count only incorrect answers; `share` = count / incorrect answers *with* a category. Sort errors by count desc, then code.
- `skills` order: sufficient first, then by rate asc, ties by topic then skill name (deterministic).
- `questions`: one row per question (`questionKeyOf`) per topic, all records, sorted by rate asc (nulls last), ties by testId/questionId. `skill` = most frequent non-null skill of that question (or null). `testDate` = earliest date.
- `computeSkillDetail`: byClass (label = classId) and byTextbook (label = textbookName) with `sufficient = students >= config.minStudentsPerCell` (classes) / `config.minStudentsPerGroup` (textbooks); questions of that skill only. Return `null` when the key is not present.
- No NaN/Infinity anywhere; empty input → empty analysis with zero coverage.
- Performance: one pass grouping; the demo has ~24k records.

## Tests (must add)
Small deterministic fixtures (see `tests/helpers.ts`): rates/counts per skill, clustered CI present, sufficiency thresholds, `deltaFromTopic`, error shares with unknown text + missing categories, case-insensitive codes, no-skill data (`hasSkills=false`, `skills=[]`, questions still present), partial coverage numbers, detail breakdown, CSV import with and without the new columns (backward compatibility), and a check that the regenerated demo still has the same `is_correct` totals per topic as before.

## Done when
- `/home/dadrout/data-driven-curriculum/node_modules/.bin/tsc --noEmit` passes
- `/home/dadrout/data-driven-curriculum/node_modules/.bin/vitest run` passes (all old + new tests)
- `/home/dadrout/data-driven-curriculum/node_modules/.bin/eslint src tests scripts` passes
- Do not commit (the sandbox can't write the git dir); leave changes in the working tree.
- Final message: list of changed files, key design decisions, test results, any edge cases or concerns.
