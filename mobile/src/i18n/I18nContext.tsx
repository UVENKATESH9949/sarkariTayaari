import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { translatorFor, type Translate, type UiLanguage } from "@sarkaritaiyaari/core/i18n";
import { loadPreferences, savePreferences, DEFAULT_PREFERENCES } from "../db/preferences";

/**
 * Mobile's i18n provider.
 *
 * The catalogues, the dotted-key typing, lookup, `{placeholder}` interpolation and the
 * English fallback all live in `@sarkaritaiyaari/core/i18n` as of TASK-2601 Phase 0 — web
 * uses the identical engine, so a student sees the same strings on both. What stays here is
 * only what is genuinely mobile: React context and persistence to the SQLite
 * `app_preferences` row.
 */

type I18nContextValue = {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  t: Translate;
};

const I18nContext = createContext<I18nContextValue>({
  language: DEFAULT_PREFERENCES.uiLanguage,
  setLanguage: () => {},
  t: translatorFor(DEFAULT_PREFERENCES.uiLanguage),
});

export function useI18n() {
  return useContext(I18nContext);
}

/** The common case — just the translate function. */
export function useT() {
  return useContext(I18nContext).t;
}

/**
 * Holds the interface language and hands out `t()`.
 *
 * Reads the same `app_preferences` row as ThemeProvider. Two separate reads of one row is
 * cheap and keeps the two concerns independent — the alternative is a combined
 * preferences provider that both depend on, which couples a colour change to a language
 * change for no benefit.
 *
 * Unlike ThemeProvider this does NOT gate rendering on the read. A frame of English before
 * Telugu arrives is a far smaller glitch than a frame of the wrong background colour, and
 * the whole tree is already behind ThemeProvider's gate anyway, so by the time anything
 * renders this read has almost always landed too.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(DEFAULT_PREFERENCES.uiLanguage);
  // Same guard as ThemeProvider: a slow read must not overwrite a choice made while it
  // was in flight.
  const dirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadPreferences().then((prefs) => {
      if (cancelled || dirtyRef.current) return;
      setLanguageState(prefs.uiLanguage);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback((next: UiLanguage) => {
    dirtyRef.current = true;
    setLanguageState(next);
    savePreferences({ uiLanguage: next }).catch((err) => console.warn("Failed to save language", err));
  }, []);

  const t = useMemo(() => translatorFor(language), [language]);

  const value = useMemo<I18nContextValue>(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
