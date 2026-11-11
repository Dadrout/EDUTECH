# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Curriculum methodologists who evaluate textbooks and plan teaching hours from student test results.
First audience for the redesign: the Zhambyl Hub hackathon jury, who judge it in a short live demo and on screenshots (confirmed 2026-11-11). Primary viewing context: a laptop at a desk (confirmed).

## Product Purpose

Move textbook choice and teaching-hour planning from opinion to measurement. Every conclusion comes from reproducible formulas over test results: topic success with 95% confidence intervals, difficult-topic detection, textbook comparison on shared tasks only, and a deterministic hours-reallocation heuristic that respects the budget and minimums.

## Positioning

Honest statistics for curriculum decisions: sample sizes and intervals are always shown, small samples are flagged instead of judged, and textbook comparisons state "association, not cause".

## Operating Context

Methodologists import CSV/XLSX test results and the curriculum plan, review the overview, drill into topics by class, textbook and task, compare textbooks within one subject and grade, then export the recommended hours as CSV. Data is processed and stored only in the browser (IndexedDB). A synthetic demo dataset (300 students) loads on first run.

## Capabilities and Constraints

- Pages: Overview, Topic Analysis (heatmap, sortable table, topic detail), Textbook Comparison, Teaching Hours, Data and Import, Methodology, Analysis Settings (thresholds).
- Interface in 9 languages (ru source dictionary in `src/i18n/messages/ru.ts`; kk, en, zh, es, fr, de, tr, uz). All UI text goes through the dictionary; data names (subjects, topics, textbooks) are not translated.
- Calculations, thresholds and business logic must not change for design reasons. Analytics modules for skills, what-if scenarios and reports are being built in parallel on `feature/analytics-suite`.
- Stack: Next.js 16.4, React 19, Tailwind CSS 4, Radix UI, Recharts, lucide-react, Onest font.

## Brand Commitments

- Product name: **BilimLens** (decided by the user 2026-11-11; replaces "Data-Driven Curriculum" in the UI; rename not yet applied in code).
- Keep the current logo: bars against a threshold line (`src/app/icon.svg`).

## Evidence on Hand

Synthetic demo data in `public/demo/` (label it synthetic wherever it could be mistaken for real results). No real schools, testimonials or usage figures exist; do not invent them.

## Product Principles

1. Every number carries its reliability: sample size, interval, or an explicit "not enough data".
2. Color signals a verdict (mastery level, textbook identity), never decoration, and is never the only signal.
3. A methodologist should see what needs attention and what to do next without reading the methodology first.
4. Recommendations explain themselves: what changes, by how much, why, and which constraints hold.
