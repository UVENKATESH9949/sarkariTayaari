import { useCallback, useMemo, useState, type ReactNode } from "react";
import { translatorFor, CATALOGUES, type UiLanguage } from "@sarkaritaiyaari/core/i18n";
import { I18nContext, type I18nContextValue } from "./I18nContext";

/**
 * Web's i18n provider.
 *
 * The catalogues, dotted-key typing, lookup, interpolation and English fallback all come from
 * `@sarkaritaiyaari/core/i18n` — the identical engine the phone app uses, so a student sees the
 * same strings on both. Only persistence differs: mobile writes to SQLite, this to
 * localStorage.
 *
 * The catalogues cover English and Telugu only. Question *content* is separately bilingual
 * English/Hindi; there has never been a Hindi UI catalogue.
 */

const STORAGE_KEY = "st_web_language";

function readStoredLanguage(): UiLanguage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw && raw in CATALOGUES ? (raw as UiLanguage) : "en";
  } catch {
    return "en";
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(readStoredLanguage);

  const setLanguage = useCallback((next: UiLanguage) => {
    setLanguageState(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not worth failing over.
    }
  }, []);

  const t = useMemo(() => translatorFor(language), [language]);
  const value = useMemo<I18nContextValue>(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
