"use client";

import * as React from "react";
import { createI18n, i18n as currentI18n, setCurrentI18n, type I18n } from "./core";
import { loadMessages } from "./load";
import { DEFAULT_LOCALE, isLocale, matchLocale, type Locale } from "./locales";

const STORAGE_KEY = "ddc:locale";

interface I18nContextValue extends I18n {
  setLocale: (locale: Locale) => Promise<void>;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

function storedLocale(): Locale | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

function browserLocale(): Locale | null {
  if (typeof navigator === "undefined") return null;
  return matchLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

/**
 * Язык интерфейса. Сервер отдаёт страницы на русском; в браузере выбирается
 * сохранённый язык, иначе — язык браузера, если он поддерживается.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = React.useState<I18n>(() => currentI18n());
  const request = React.useRef(0);

  const setLocale = React.useCallback(async (locale: Locale) => {
    const id = ++request.current;
    const messages = await loadMessages(locale);
    // Пользователь мог выбрать другой язык, пока загружался словарь.
    if (id !== request.current) return;
    const next = createI18n(locale, messages);
    // Сначала меняется словарь для расчётных функций, затем — состояние React.
    setCurrentI18n(next);
    setValue(next);
    document.documentElement.lang = locale;
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Хранилище недоступно (приватный режим) — язык просто не запомнится.
    }
  }, []);

  React.useEffect(() => {
    const initial = storedLocale() ?? browserLocale() ?? DEFAULT_LOCALE;
    if (initial !== currentI18n().locale) void setLocale(initial);
  }, [setLocale]);

  const ctx = React.useMemo<I18nContextValue>(() => ({ ...value, setLocale }), [value, setLocale]);
  return <I18nContext.Provider value={ctx}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

/**
 * Перемонтирует содержимое при смене языка: так пересчитываются и тексты,
 * которые формируют расчётные функции внутри useMemo. Данные и фильтры
 * хранятся выше, в DataProvider, и не теряются.
 */
export function LocaleScope({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n();
  return <React.Fragment key={locale}>{children}</React.Fragment>;
}
