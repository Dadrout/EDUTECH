---
name: BilimLens
description: A precise workspace for evidence-based curriculum decisions
colors:
  primary: "#17763b"
  canvas: "#f3f5f4"
  surface: "#ffffff"
  ink: "#121a16"
  muted-ink: "#5c6862"
  border: "#e3e8e5"
  sidebar: "#ffffff"
  sidebar-active: "#e5f3e9"
  sidebar-active-ink: "#0e5a2b"
typography:
  display:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  finding:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  metric:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1
  title:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  dense:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  annotation:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  micro:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.35
  axis:
    fontFamily: "Geologica Variable, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.2
rounded:
  bar-end: "4px"
  control: "10px"
  card: "14px"
  section: "18px"
spacing:
  unit: "4px"
  section-padding: "20px"
  page-gap: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "36px"
  analytical-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
---

## Overview

Operate mode. Methodologists move from observations to topic-level decisions, textbook comparisons and hour allocations; the first audience is a hackathon jury judging a short live demo on a laptop. Data and uncertainty come before decoration. Use the official user-supplied BilimLens logo (magnifying glass, book and bars) with its original wordmark; the symbol serves as the browser icon.

`src/app/globals.css` is authoritative; this file records the decisions behind it. Browser QA (desktop, tablet, phone, nine languages) runs through `npm run test:e2e` against a production server.

## Colors

Light theme only, by decision: the use scene is a lit room and a projector during the demo, and print/PDF share the same ink. Logo green is the single accent for primary actions, the active navigation item and focus. Neutral canvas and white cards keep charts legible.

Color carries a verdict and nothing else. Mastery levels use red/amber/green with labels or icons beside them; a KPI value takes its level color, and no tile is brand-filled. Hour changes use one neutral direction pair everywhere (blue = hours gained, orange = hours given), never mastery red/green, always with a +/− sign. Textbook colors stay consistent across charts; error categories keep their own stable mapping. "No difference" and "insufficient data" verdicts are neutral, "preliminary" is amber, only a low-mastery finding is red.

## Typography

Self-hosted Geologica Variable for everything (Cyrillic, Kazakh and Latin-script Uzbek covered; Chinese falls back to the system CJK face on screen and Noto Sans CJK in PDF). Ramp: 34 / 28 page headings, 24 leading finding, 22 metric numerals, 15 section titles, 14 body, 13 dense tables and controls, 12 annotation, 11 micro labels and chart legends, 10 chart axis ticks. Numbers use tabular lining numerals. Monospace only for real identifiers.

## Layout

Desktop: 248px white navigation rail at 1024px and above, content capped at 1480px. A sticky toolbar toggle hides the rail; while it is hidden, the toolbar keeps the AI methodologist, analysis settings and language switch. Below 1024px: 56px mobile header with the AI button and an accessible drawer; 16px gutters, 24px from 640px. Page grids use `minmax(0, 1fr)` columns so wide content (tab rows, tables) scrolls inside its own container instead of widening the page. Editing tables become stacked rows on phones.

## Elevation & Depth

Cards: one border plus a soft, offset shadow (`--card-shadow`). Radix popovers and dialogs keep their elevation and focus rings. No decorative gradients, glass or entrance animation.

## Shapes

Cards 14px, sections 18px, controls 10px, bar ends 4px. Horizontal chart geometry encodes observed rates on a single 0–100% scale shared by marks and axis labels; confidence intervals are drawn, not only listed in tooltips. Hatching is reserved for insufficient samples; a dashed outline marks "not final" (likely difficult, synthetic data).

## Components

`AppShell` owns navigation and the skip link. `PageHeader` owns the page heading; `Finding` states the page's one conclusion (with its reliability) and its next action. `Section`, `Disclosure`, `KpiTile`, `RateBar` and the charts share tokens. Disclosures carry the title once; their content sits in a plain card without a repeated heading. Pagination appears only when there is more than one page. Interactive charts expose every row as a focusable button.

AI surfaces (methodologist panel, one compact insight per analytics page, the report section and its two labelled PDF pages) are secondary: they explain computed values and never replace them. The insight strip hides when AI is not configured or there is nothing to explain.

Reports use a pdf-lib text/vector document: five A4 landscape summary pages (+2 when AI insights are included) and a separately paginated appendix.

## Do's and Don'ts

- Show students and answer observations separately, including uncertainty and insufficient samples.
- Translate interface copy through the one typed dictionary system; preserve imported names. No developer jargon (MVP, IDs) in user copy.
- Explain that class rates are descriptive when assignments differ, textbook association does not prove causality, and hour allocations do not predict attainment.
- Keep synthetic data visibly identified with the shared notice. Never add fictional skills, forecasts, endorsements or school statistics.
