import type { Locale } from "./locales";
import { ru, type Messages } from "./messages/ru";

/** Русский словарь входит в основной бандл; остальные загружаются при выборе языка. */
const LOADERS: Record<Exclude<Locale, "ru">, () => Promise<Messages>> = {
  kk: () => import("./messages/kk").then((mod) => mod.kk),
  en: () => import("./messages/en").then((mod) => mod.en),
  zh: () => import("./messages/zh").then((mod) => mod.zh),
  es: () => import("./messages/es").then((mod) => mod.es),
  fr: () => import("./messages/fr").then((mod) => mod.fr),
  de: () => import("./messages/de").then((mod) => mod.de),
  tr: () => import("./messages/tr").then((mod) => mod.tr),
  uz: () => import("./messages/uz").then((mod) => mod.uz),
};

export function loadMessages(locale: Locale): Promise<Messages> {
  return locale === "ru" ? Promise.resolve(ru) : LOADERS[locale]();
}
