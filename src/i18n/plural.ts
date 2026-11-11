/**
 * Формы множественного числа по категориям CLDR (как у Intl.PluralRules).
 * В каждой форме {n} — само число, отформатированное по правилам языка.
 * Обязательна только форма other; остальные задаются, если язык их различает.
 */
export interface Plural {
  readonly kind: "plural";
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

export function p(forms: Omit<Plural, "kind">): Plural {
  return { kind: "plural", ...forms };
}
