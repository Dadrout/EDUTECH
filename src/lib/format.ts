/**
 * Форматирование чисел для интерфейса. Любое отсутствующее или некорректное
 * значение (null, NaN, Infinity) отображается как «—», а не как «NaN».
 */

const DASH = "—";

function isNum(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const intFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const dec1Fmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const hoursFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export function formatInt(value: number | null | undefined): string {
  return isNum(value) ? intFmt.format(value) : DASH;
}

/** Доля (0..1) → «72,4%». */
export function formatPct(rate: number | null | undefined, digits: 0 | 1 = 1): string {
  if (!isNum(rate)) return DASH;
  const pct = rate * 100;
  return `${digits === 0 ? intFmt.format(pct) : dec1Fmt.format(pct)}%`;
}

/** Разница долей → «+4,2 п.п.» / «−3,0 п.п.». */
export function formatPp(diff: number | null | undefined, digits: 0 | 1 = 1): string {
  if (!isNum(diff)) return DASH;
  const pp = diff * 100;
  const rounded = Math.round(pp * 10 ** digits) / 10 ** digits;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±";
  const abs = Math.abs(rounded);
  return `${sign}${digits === 0 ? intFmt.format(abs) : dec1Fmt.format(abs)} п.п.`;
}

/** Интервал долей → «64,1–71,8%». */
export function formatCi(low: number | null | undefined, high: number | null | undefined): string {
  if (!isNum(low) || !isNum(high)) return DASH;
  return `${dec1Fmt.format(low * 100)}–${dec1Fmt.format(high * 100)}%`;
}

/** Интервал разницы → «−3,0…+5,4 п.п.». */
export function formatPpRange(low: number | null | undefined, high: number | null | undefined): string {
  if (!isNum(low) || !isNum(high)) return DASH;
  const f = (v: number) => {
    const r = Math.round(v * 1000) / 10;
    const sign = r > 0 ? "+" : r < 0 ? "−" : "";
    return `${sign}${dec1Fmt.format(Math.abs(r))}`;
  };
  return `${f(low)}…${f(high)} п.п.`;
}

export function formatHours(value: number | null | undefined): string {
  return isNum(value) ? `${hoursFmt.format(value)} ч` : DASH;
}

export function formatHoursDelta(value: number | null | undefined): string {
  if (!isNum(value)) return DASH;
  if (value === 0) return "0 ч";
  return `${value > 0 ? "+" : "−"}${hoursFmt.format(Math.abs(value))} ч`;
}

export function formatNumber(value: number | null | undefined, maxDigits = 2): string {
  if (!isNum(value)) return DASH;
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: maxDigits }).format(value);
}

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** ISO YYYY-MM-DD → «12 окт. 2026 г.». */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? DASH : dateFmt.format(d);
}

/** Склонение: plural(5, ["ученик", "ученика", "учеников"]). */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function countLabel(n: number, forms: [string, string, string]): string {
  return `${formatInt(n)} ${plural(n, forms)}`;
}

/** Кавычки-«ёлочки»; названия, уже содержащие кавычки, не оборачиваются повторно. */
export function quote(text: string): string {
  return /[«»"]/.test(text) ? text : `«${text}»`;
}

/** «Алгебра 7 · УМК «Альфа»» → «УМК «Альфа»», если предмет и параллель уже указаны в контексте. */
export function shortTextbookName(name: string, subject: string, grade: number): string {
  const prefix = `${subject} ${grade}`;
  if (!name.startsWith(prefix)) return name;
  const rest = name.slice(prefix.length).replace(/^\s*[·:\-—–]\s*/, "").trim();
  return rest.length > 0 ? rest : name;
}
