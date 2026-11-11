"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/common/blocks";
import { SettingsDialog } from "@/components/common/settings-dialog";
import { useI18n } from "@/i18n/provider";
import { Rich } from "@/i18n/rich";
import { defaultHoursConfig } from "@/lib/config/analysis-config";
import { formatPercentValue } from "@/lib/format";
import { useData } from "@/providers/data-provider";

function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <details id={id} className="detail-disclosure group scroll-mt-20 border-t" open={id === "data" || undefined}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-3 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">{title}<ChevronDown className="size-4 shrink-0 group-open:rotate-180" aria-hidden /></summary>
      <div className="grid max-w-3xl gap-3 pb-5 text-sm leading-relaxed text-muted-foreground [&_b]:font-medium [&_b]:text-foreground [&_li]:pl-1 [&_ol]:grid [&_ol]:list-decimal [&_ol]:gap-1.5 [&_ol]:pl-5 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1.5 [&_ul]:pl-5">{children}</div>
    </details>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border bg-muted/40 px-4 py-2.5 font-mono text-[13px] text-foreground">{children}</div>;
}

const TOC = ["data", "rate", "levels", "textbooks", "hours", "limits"] as const;

export function MethodologyView() {
  const { config } = useData();
  const { m, t } = useI18n();
  React.useEffect(() => {
    const openHash = () => {
      const target = document.getElementById(window.location.hash.slice(1));
      if (target instanceof HTMLDetailsElement) { target.open = true; target.scrollIntoView({ block: "start" }); }
    };
    openHash();
    window.addEventListener("hashchange", openHash);
    return () => window.removeEventListener("hashchange", openHash);
  }, []);
  const mm = m.methodology;
  const h = defaultHoursConfig(config);
  const pct = (v: number) => formatPercentValue(v);
  const th = { high: pct(config.thresholds.high), medium: pct(config.thresholds.medium) };

  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader title={mm.title} description={mm.description} actions={<SettingsDialog />} />

      <nav aria-label={mm.toc} className="-mx-2 flex flex-wrap gap-x-1 gap-y-0.5">
        {TOC.map((id) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-md px-2 py-1 text-[13px] font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            {mm.tocItems[id]}
          </a>
        ))}
      </nav>

      <Block id="data" title={mm.dataTitle}>
        <p>
          <Rich text={mm.data1} />
        </p>
        <p>
          <Rich text={mm.data2} />
        </p>
        <p>{mm.data3}</p>
      </Block>

      <Block id="rate" title={mm.rateTitle}>
        <p>
          <Rich text={mm.rate1} />
        </p>
        <Formula>{mm.rateFormula}</Formula>
        <p>{mm.rate2}</p>
        <p>
          <Rich text={mm.rate3} />
        </p>
        <Formula>Var(p) ≈ Σ (cⱼ − p·nⱼ)² / (k·(k − 1)·n̄²)</Formula>
        <p>{mm.rate4}</p>
      </Block>

      <Block id="levels" title={mm.levelsTitle}>
        <p>{mm.levels1}</p>
        <ul>
          <li>
            <Rich text={t(mm.levelHigh, th)} />
          </li>
          <li>
            <Rich text={t(mm.levelMedium, th)} />
          </li>
          <li>
            <Rich text={t(mm.levelLow, th)} />
          </li>
        </ul>
        <p>
          <Rich text={t(mm.levels2, th)} />
        </p>
        <p>
          <Rich text={t(mm.levels3, { students: config.minStudentsPerTopic, answers: config.minAnswersPerTopic, cell: config.minStudentsPerCell })} />
        </p>
      </Block>

      <Block id="textbooks" title={mm.textbooksTitle}>
        <p>{mm.textbooks1}</p>
        <ol>
          {mm.textbooksRules.map((rule) => (
            <li key={rule}>
              <Rich text={t(rule, { questions: config.minCommonQuestions, students: config.minStudentsPerGroup })} />
            </li>
          ))}
        </ol>
        <p>{mm.textbooks2}</p>
        <ul>
          {mm.textbooksLevels.map((level) => (
            <li key={level}>
              <Rich text={level} />
            </li>
          ))}
        </ul>
        <p>
          <Rich text={mm.textbooks3} />
        </p>
      </Block>

      <Block id="hours" title={mm.hoursTitle}>
        <p>{mm.hours1}</p>
        <ol>
          {mm.hoursSteps.map((step) => (
            <li key={step}>
              <Rich text={t(step, { target: pct(h.targetPct) })} />
            </li>
          ))}
        </ol>
        <Formula>{mm.priorityFormula}</Formula>
        <Formula>{t(mm.demandFormula, { increase: pct(Math.round(h.maxIncreaseShare * 100)) })}</Formula>
        <ol start={mm.hoursSteps.length + 1}>
          {mm.hoursSteps2.map((step) => (
            <li key={step}>
              <Rich text={t(step, { decrease: pct(Math.round(h.maxDecreaseShare * 100)) })} />
            </li>
          ))}
        </ol>
        <p>{mm.hoursExample}</p>
        <p>{mm.hours2}</p>
      </Block>

      <Block id="limits" title={mm.limitsTitle}>
        <ul>
          {mm.limits.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Block>
    </div>
  );
}
