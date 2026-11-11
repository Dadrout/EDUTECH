"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_ANALYSIS_CONFIG, validateAnalysisConfig, type AnalysisConfig } from "@/lib/config/analysis-config";
import { useData } from "@/providers/data-provider";
import { useI18n } from "@/i18n/provider";

type NumericKey = Exclude<keyof AnalysisConfig, "thresholds" | "confidenceZ">;

const SAMPLE_FIELDS: { key: NumericKey }[] = [
  { key: "minStudentsPerTopic" },
  { key: "minAnswersPerTopic" },
  { key: "minStudentsPerCell" },
  { key: "minStudentsPerGroup" },
  { key: "minCommonQuestions" },
  { key: "minAnswersPerStudent" },
];

function toNumber(value: string): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

export function SettingsDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { config, setConfig } = useData();
  const { m } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, string>>({});

  const init = React.useCallback(() => {
    const d: Record<string, string> = { high: String(config.thresholds.high), medium: String(config.thresholds.medium) };
    for (const f of SAMPLE_FIELDS) d[f.key] = String(config[f.key]);
    setDraft(d);
  }, [config]);

  const candidate: AnalysisConfig = {
    ...config,
    thresholds: { high: toNumber(draft.high ?? ""), medium: toNumber(draft.medium ?? "") },
    ...Object.fromEntries(SAMPLE_FIELDS.map((f) => [f.key, toNumber(draft[f.key] ?? "")])),
  };
  const errors = open ? validateAnalysisConfig(candidate) : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) init();
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <SlidersHorizontal aria-hidden />
            {m.settings.title}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{m.settings.title}</DialogTitle>
          <DialogDescription>{m.settings.description}</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (errors.length === 0) {
              setConfig(candidate);
              setOpen(false);
            }
          }}
        >
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-[13px] font-semibold">{m.settings.levelsLegend}</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="th-high">{m.settings.highFrom}</Label>
                <Input id="th-high" inputMode="numeric" value={draft.high ?? ""} onChange={(e) => setDraft({ ...draft, high: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="th-medium">{m.settings.mediumFrom}</Label>
                <Input id="th-medium" inputMode="numeric" value={draft.medium ?? ""} onChange={(e) => setDraft({ ...draft, medium: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{m.settings.belowMedium}</p>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="mb-1 text-[13px] font-semibold">{m.settings.sampleLegend}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {SAMPLE_FIELDS.map((f) => (
                <div key={f.key} className="grid gap-1.5">
                  <Label htmlFor={`cfg-${f.key}`}>{m.settings.fields[f.key].label}</Label>
                  <Input id={`cfg-${f.key}`} inputMode="numeric" value={draft[f.key] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                  <span className="text-[11px] text-muted-foreground">{m.settings.fields[f.key].hint}</span>
                </div>
              ))}
            </div>
          </fieldset>

          {errors.length > 0 ? (
            <Alert variant="destructive">
              <AlertDescription>
                {errors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const d: Record<string, string> = {
                  high: String(DEFAULT_ANALYSIS_CONFIG.thresholds.high),
                  medium: String(DEFAULT_ANALYSIS_CONFIG.thresholds.medium),
                };
                for (const f of SAMPLE_FIELDS) d[f.key] = String(DEFAULT_ANALYSIS_CONFIG[f.key]);
                setDraft(d);
              }}
            >
              {m.settings.defaults}
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {m.common.cancel}
              </Button>
              <Button type="submit" disabled={errors.length > 0}>
                {m.common.apply}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
