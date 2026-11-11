/**
 * Ядро локализации без React: словарь текущего языка, подстановка параметров
 * и формы множественного числа.
 *
 * Текущий язык хранится в модуле, а не передаётся параметрами: так им пользуются
 * и компоненты, и расчётные функции (выводы, причины изменения часов, ошибки
 * импорта). Приложение работает в браузере с одним языком одновременно; при смене
 * языка I18nProvider сначала меняет текущий словарь, затем перерисовывает экран.
 */
import { intlTag, type Locale } from "./locales";
import { ru, type Messages } from "./messages/ru";
import type { Plural } from "./plural";

export type Params = Record<string, string | number>;

export interface I18n {
  locale: Locale;
  /** Тег для Intl, например «ru-RU». */
  intl: string;
  m: Messages;
  /** Подставить {параметры} в строку словаря. Числа форматируются по правилам языка. */
  t: (template: string, params?: Params) => string;
  /** Выбрать форму множественного числа для n и подставить {n} и остальные параметры. */
  plural: (msg: Plural, n: number, params?: Params) => string;
}

const numberFormats = new Map<string, Intl.NumberFormat>();

/** Кэш Intl.NumberFormat: создание форматтера заметно дороже форматирования. */
export function numberFormat(intl: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${intl}|${JSON.stringify(options)}`;
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(intl, options);
    numberFormats.set(key, f);
  }
  return f;
}

export function createI18n(locale: Locale, m: Messages): I18n {
  const intl = intlTag(locale);
  const rules = new Intl.PluralRules(intl);
  const num = numberFormat(intl, { maximumFractionDigits: 2 });

  const t = (template: string, params?: Params): string => {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
      if (!(key in params)) return whole;
      const value = params[key];
      return typeof value === "number" ? num.format(value) : value;
    });
  };

  const plural = (msg: Plural, n: number, params?: Params): string => {
    const category = rules.select(n) as Exclude<keyof Plural, "kind">;
    return t(msg[category] ?? msg.other, { n, ...params });
  };

  return { locale, intl, m, t, plural };
}

let current: I18n = createI18n("ru", ru);

/** Текущий язык и словарь. */
export function i18n(): I18n {
  return current;
}

export function setCurrentI18n(next: I18n): void {
  current = next;
}
