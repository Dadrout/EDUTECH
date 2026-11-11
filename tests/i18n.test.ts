import { describe, expect, it } from "vitest";
import { createI18n } from "@/i18n/core";
import { LOCALES } from "@/i18n/locales";
import type { Messages } from "@/i18n/messages/ru";
import { ru } from "@/i18n/messages/ru";

// Все словари из src/i18n/messages (ключ — имя файла без расширения).
const modules = import.meta.glob<Record<string, Messages>>("../src/i18n/messages/*.ts", { eager: true });
const dictionaries = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => {
    const code = path.split("/").pop()!.replace(/\.ts$/, "");
    return [code, mod[code]];
  }),
) as Record<string, Messages>;

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const boldBalanced = (s: string) => (s.match(/<b>/g)?.length ?? 0) === (s.match(/<\/b>/g)?.length ?? 0);

/** Сравнивает словарь с русским: структура, параметры, разметка, формы множественного числа. */
function compare(reference: unknown, target: unknown, path: string, problems: string[]): void {
  if (typeof reference === "string") {
    if (typeof target !== "string") return void problems.push(`${path}: expected a string`);
    if (placeholders(reference).join() !== placeholders(target).join()) problems.push(`${path}: placeholders ${placeholders(target)} ≠ ${placeholders(reference)}`);
    if (!boldBalanced(target)) problems.push(`${path}: unbalanced <b>`);
    if (target.trim() === "") problems.push(`${path}: empty`);
    return;
  }
  if (Array.isArray(reference)) {
    if (!Array.isArray(target) || target.length !== reference.length) return void problems.push(`${path}: list length differs`);
    reference.forEach((r, i) => compare(r, target[i], `${path}[${i}]`, problems));
    return;
  }
  if (reference && typeof reference === "object") {
    const ref = reference as Record<string, unknown>;
    const tgt = (target ?? {}) as Record<string, unknown>;
    if (ref.kind === "plural") {
      if (tgt.kind !== "plural" || typeof tgt.other !== "string") return void problems.push(`${path}: expected a plural with "other"`);
      const expected = placeholders(ref.other as string).join();
      for (const form of ["zero", "one", "two", "few", "many", "other"]) {
        const value = tgt[form];
        if (typeof value === "string" && placeholders(value).join() !== expected) problems.push(`${path}.${form}: placeholders differ`);
      }
      return;
    }
    for (const key of Object.keys(ref)) compare(ref[key], tgt[key], path ? `${path}.${key}` : key, problems);
    for (const key of Object.keys(tgt)) if (!(key in ref)) problems.push(`${path}.${key}: unknown key`);
  }
}

describe("словари", () => {
  it("есть для каждого языка интерфейса", () => {
    expect(Object.keys(dictionaries).sort()).toEqual(LOCALES.map((l) => l.code).sort());
  });

  it("название продукта и новые разделы доступны на всех языках", () => {
    for (const dict of Object.values(dictionaries)) {
      expect(dict.common.appName).toBe("BilimLens");
      expect(dict.skills.title.trim()).not.toBe("");
      expect(dict.scenario.title.trim()).not.toBe("");
      expect(dict.reports.title.trim()).not.toBe("");
    }
  });

  for (const [code, dict] of Object.entries(dictionaries)) {
    if (code === "ru") continue;
    it(`${code}: совпадает с русским по ключам, параметрам и разметке`, () => {
      const problems: string[] = [];
      compare(ru, dict, "", problems);
      expect(problems).toEqual([]);
    });
  }
});

describe("форматирование по языку", () => {
  it("выбирает формы множественного числа по правилам языка", () => {
    const en = createI18n("en", dictionaries.en);
    expect(en.plural(en.m.counts.students, 1)).toBe("1 student");
    expect(en.plural(en.m.counts.students, 2)).toBe("2 students");
    const r = createI18n("ru", ru);
    expect(r.plural(r.m.counts.students, 21)).toBe("21 ученик");
    expect(r.plural(r.m.counts.students, 22)).toBe("22 ученика");
    expect(r.plural(r.m.counts.students, 1235)).toBe("1\u00a0235 учеников");
  });

  it("форматирует числа в параметрах", () => {
    const de = createI18n("de", dictionaries.de);
    expect(de.t("{n}", { n: 24252 })).toBe("24.252");
    const en = createI18n("en", dictionaries.en);
    expect(en.t("{n}", { n: 0.49 })).toBe("0.49");
  });
});
