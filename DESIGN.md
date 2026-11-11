---
name: BilimLens
description: A precise workspace for evidence-based curriculum decisions
colors:
  primary: "#176254"
  canvas: "#f5f7f6"
  surface: "#ffffff"
  ink: "#192d2a"
  muted-ink: "#596b65"
  border: "#dce5df"
  sidebar: "#153d35"
  sidebar-ink: "#e6f1ea"
  sidebar-muted: "#b3c9bd"
  sidebar-active: "#d8ebde"
typography:
  headline:
    fontFamily: "Onest Variable, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Onest Variable, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: "Onest Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "10px"
  section: "16px"
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
  analytical-section:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.section}"
---

## Overview

Operate mode. Methodologists move from observations to topic-level decisions, textbook comparisons and hour allocations. The interface places data and uncertainty before decoration. Keep the existing bars-and-threshold logo.

This document records implemented code decisions. Rendering, responsive appearance and PDF pagination have **not** been verified in this sandbox; see `docs/RELEASE.md`. No current screenshots are approved visual references. The direction helper ran without its remote catalogue; the product brief supplied the direction.

## Colors

Deep green anchors navigation; warm neutral surfaces keep charts legible. Status red, amber and green retain labels/icons. Textbook colors remain consistent across charts; error categories retain their own stable mapping. CSS in `src/app/globals.css` is authoritative, including semantic tokens not repeated here.

## Typography

Self-hosted Onest, using the existing dependency. Page headings scale from 25px to 30px; section headings 15px; body 14px, dense tables 13px, annotation 12px. Numeric columns use tabular lining numerals. Monospace is reserved for actual identifiers.

## Layout

Desktop: 232px persistent navigation at 1024px and above, content capped at 1480px with 36px gutters. Below 1024px: 56px mobile header and accessible drawer; 16px gutters, increasing to 24px at 640px. Charts keep their existing narrow-screen behavior. Wide tables scroll inside their own containers.

## Elevation & Depth

Analytical surfaces use a single border. Preserve Radix popover/dialog elevation and focus rings. No decorative gradients, new shadows or entrance animation.

## Shapes

Sections use 16px corners; controls 10px. Horizontal chart geometry communicates observed rates. Hatching is reserved for insufficient samples. No invented visual proof or mock performance values.

## Components

`AppShell` owns navigation and a keyboard skip link. `PageHeader` owns the document title and page heading; `Section`, `KpiTile`, `RateBar` and the existing tables/charts share tokens. Use disabled controls when an action is invalid. Keep loading, error, empty and insufficient-data states in the established data gate.

Reports print to A4 with repeated table headings and hidden navigation/actions. Do not truncate report rows. Allow arbitrary imported identifiers to wrap in print; remove decorative bars from printed table cells. Browser pagination still needs QA.

## Do's and Don'ts

- Show students and answer observations separately, including uncertainty and insufficient samples.
- Translate interface copy through the one typed dictionary system; preserve imported names.
- Explain that class rates are descriptive when assignments differ, textbook association does not prove causality, and hour allocations do not predict attainment.
- Keep synthetic data visibly identified. Never add fictional skills, forecasts, endorsements or school statistics.
