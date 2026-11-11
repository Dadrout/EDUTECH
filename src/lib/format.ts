/**
 * Форматирование чисел для интерфейса по правилам текущего языка.
 * Любое отсутствующее или некорректное значение (null, NaN, Infinity)
 * отображается как «—», а не как «NaN».
 */
import { i18n, numberFormat } from "@/i18n/core";

const DASH = "—";

function isNum(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const INT: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
const DEC1: Intl.NumberFormatOptions = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
const HOURS: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

const fmt = (options: Intl.NumberFormatOptions) => numberFormat(i18n().intl, options);

/** Подставить уже отформатированное число в шаблон единицы («{n}%», «{n} ч»). */
function unit(template: (u: ReturnType<typeof i18n>["m"]["units"]) => string, n: string): string {
  const { t, m } = i18n();
  return t(template(m.units), { n });
}

export function formatInt(value: number | null | undefined): string {
  return isNum(value) ? fmt(INT).format(value) : DASH;
}

/** Доля (0..1) → «72,4%» (положение знака процента — по правилам языка). */
export function formatPct(rate: number | null | undefined, digits: 0 | 1 = 1): string {
  if (!isNum(rate)) return DASH;
  const pct = rate * 100;
  return unit((u) => u.percent, fmt(digits === 0 ? INT : DEC1).format(pct));
}

/** Значение, уже выраженное в процентах (порог 60 → «60%»). */
export function formatPercentValue(value: number | null | undefined, digits: 0 | 1 = 0): string {
  if (!isNum(value)) return DASH;
  return unit((u) => u.percent, fmt(digits === 0 ? INT : DEC1).format(value));
}

/** Разница долей → «+4,2 п.п.» / «−3,0 п.п.». */
export function formatPp(diff: number | null | undefined, digits: 0 | 1 = 1): string {
  if (!isNum(diff)) return DASH;
  const pp = diff * 100;
  const rounded = Math.round(pp * 10 ** digits) / 10 ** digits;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±";
  const abs = Math.abs(rounded);
  return unit((u) => u.pp, `${sign}${fmt(digits === 0 ? INT : DEC1).format(abs)}`);
}

/** Разница долей без знака → «4,2 п.п.». */
export function formatPpAbs(diff: number | null | undefined, digits: 0 | 1 = 1): string {
  if (!isNum(diff)) return DASH;
  return unit((u) => u.pp, fmt(digits === 0 ? INT : DEC1).format(Math.abs(diff * 100)));
}

/** Интервал долей → «64,1–71,8%». */
export function formatCi(low: number | null | undefined, high: number | null | undefined): string {
  if (!isNum(low) || !isNum(high)) return DASH;
  return unit((u) => u.percent, `${fmt(DEC1).format(low * 100)}–${fmt(DEC1).format(high * 100)}`);
}

/** Интервал разницы → «−3,0…+5,4 п.п.». */
export function formatPpRange(low: number | null | undefined, high: number | null | undefined): string {
  if (!isNum(low) || !isNum(high)) return DASH;
  const f = (v: number) => {
    const r = Math.round(v * 1000) / 10;
    const sign = r > 0 ? "+" : r < 0 ? "−" : "";
    return `${sign}${fmt(DEC1).format(Math.abs(r))}`;
  };
  return unit((u) => u.pp, `${f(low)}…${f(high)}`);
}

export function formatHours(value: number | null | undefined): string {
  return isNum(value) ? unit((u) => u.hours, fmt(HOURS).format(value)) : DASH;
}

export function formatHoursDelta(value: number | null | undefined): string {
  if (!isNum(value)) return DASH;
  if (value === 0) return unit((u) => u.hours, fmt(HOURS).format(0));
  return unit((u) => u.hours, `${value > 0 ? "+" : "−"}${fmt(HOURS).format(Math.abs(value))}`);
}

export function formatNumber(value: number | null | undefined, maxDigits = 2): string {
  if (!isNum(value)) return DASH;
  return fmt({ maximumFractionDigits: maxDigits }).format(value);
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** ISO YYYY-MM-DD → «12 окт. 2026 г.» (формат — по правилам языка). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return DASH;
  const intl = i18n().intl;
  let f = dateFormats.get(intl);
  if (!f) {
    f = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    dateFormats.set(intl, f);
  }
  return f.format(d);
}

/** Название в кавычках языка; названия, уже содержащие кавычки, не оборачиваются повторно. */
export function quote(text: string): string {
  const { open, close } = i18n().m.common.quotes;
  return /[«»"“”„「」]/.test(text) ? text : `${open}${text}${close}`;
}

/** «Алгебра 7 · УМК «Альфа»» → «УМК «Альфа»», если предмет и параллель уже указаны в контексте. */
export function shortTextbookName(name: string, subject: string, grade: number): string {
  const prefix = `${subject} ${grade}`;
  if (!name.startsWith(prefix)) return name;
  const rest = name.slice(prefix.length).replace(/^\s*[·:\-—–]\s*/, "").trim();
  return rest.length > 0 ? rest : name;
}
