/** Языки интерфейса. name — самоназвание языка, intl — тег для Intl (числа, даты, множественное число). */
export const LOCALES = [
  { code: "ru", name: "Русский", intl: "ru-RU" },
  { code: "kk", name: "Қазақша", intl: "kk-KZ" },
  { code: "en", name: "English", intl: "en-US" },
  { code: "zh", name: "中文", intl: "zh-CN" },
  { code: "es", name: "Español", intl: "es-ES" },
  { code: "fr", name: "Français", intl: "fr-FR" },
  { code: "de", name: "Deutsch", intl: "de-DE" },
  { code: "tr", name: "Türkçe", intl: "tr-TR" },
  { code: "uz", name: "Oʻzbekcha", intl: "uz-Latn-UZ" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "ru";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.some((l) => l.code === value);
}

export function intlTag(locale: Locale): string {
  return LOCALES.find((l) => l.code === locale)?.intl ?? "ru-RU";
}

/** Первый поддерживаемый язык из списка предпочтений браузера («en-GB» → en, «zh-Hans-CN» → zh). */
export function matchLocale(tags: readonly string[]): Locale | null {
  for (const tag of tags) {
    const primary = tag.toLowerCase().split(/[-_]/)[0];
    if (isLocale(primary)) return primary;
  }
  return null;
}
