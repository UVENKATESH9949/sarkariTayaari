import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadPreferences, savePreferences, DEFAULT_PREFERENCES, type UiLanguage } from "../db/preferences";
import { en, type Catalogue } from "./en";
import { te } from "./te";

const CATALOGUES: Record<UiLanguage, Catalogue> = { en, te };

/**
 * Dotted paths into the catalogue, derived from its shape.
 *
 * This is why the catalogue is worth typing at all: `t("quiz.loading")` autocompletes,
 * `t("quiz.loadng")` is a compile error, and a key deleted from `en.ts` breaks every call
 * site immediately instead of rendering the literal string "quiz.loading" to a student.
 */
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type TranslationKey = Paths<Catalogue>;

export type TranslateVars = Record<string, string | number>;

type I18nContextValue = {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  t: (key: TranslationKey, vars?: TranslateVars) => string;
};

function lookup(catalogue: Catalogue, key: string): string | undefined {
  let node: unknown = catalogue;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Substitutes `{name}` placeholders. A placeholder with no matching variable is left as
 * written rather than replaced with "undefined": a visible `{count}` in the UI is an
 * obvious bug report, whereas "undefined questions" looks like a data problem and gets
 * chased in the wrong place.
 */
function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

const FALLBACK_LANGUAGE: UiLanguage = "en";

const defaultT: I18nContextValue["t"] = (key, vars) =>
  interpolate(lookup(en, key) ?? key, vars);

const I18nContext = createContext<I18nContextValue>({
  language: DEFAULT_PREFERENCES.uiLanguage,
  setLanguage: () => {},
  t: defaultT,
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

  const t = useMemo<I18nContextValue["t"]>(() => {
    const catalogue = CATALOGUES[language] ?? CATALOGUES[FALLBACK_LANGUAGE];
    return (key, vars) => {
      // The English fallback is unreachable while `te` is typed as the full Catalogue, but
      // it is kept so that adding a third language as a Partial later degrades to English
      // rather than to a raw key.
      const template = lookup(catalogue, key) ?? lookup(en, key) ?? key;
      return interpolate(template, vars);
    };
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
