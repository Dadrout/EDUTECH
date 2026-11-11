"use client";

import * as React from "react";
import { Languages } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOCALES, isLocale } from "@/i18n/locales";
import { useI18n } from "@/i18n/provider";

/** Выбор языка интерфейса; названия языков — на самих языках. */
export function LanguageSwitcher() {
  const { locale, setLocale, m } = useI18n();
  return (
    <Select value={locale} onValueChange={(v) => (isLocale(v) ? void setLocale(v) : undefined)}>
      <SelectTrigger
        size="sm"
        aria-label={m.nav.language}
        className="h-8 w-full justify-start gap-2.5 border-transparent bg-transparent px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground [&>svg:last-child]:ml-auto"
      >
        <Languages className="size-4" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LOCALES.map((l) => (
          <SelectItem key={l.code} value={l.code} lang={l.code}>
            {l.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
