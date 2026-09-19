import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { getContentLanguages, setContentLanguages } from "../db/contentLanguages";

/**
 * Fallback list of language names, used ONLY to label a code this device has no synced
 * `languages` row for.
 *
 * It is not a source of truth and never was — the real supported-content-language list is the
 * synced `languages` table (`GET /api/languages`), which is what onboarding offers and what
 * `db/contentLanguages.ts` reads. Only `en` and `hi` have real question content today; the rest
 * exist here so a code arriving from the server still renders with a name rather than a bare
 * "ta".
 */
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "te", name: "Telugu" },
  { code: "ta", name: "Tamil" },
  { code: "kn", name: "Kannada" },
  { code: "bn", name: "Bengali" },
  { code: "mr", name: "Marathi" },
  { code: "gu", name: "Gujarati" },
  { code: "pa", name: "Punjabi" },
  { code: "ml", name: "Malayalam" },
  { code: "ur", name: "Urdu" },
];

type AppLanguageContextValue = {
  /**
   * The language questions are rendered in by default — the FIRST of the student's chosen
   * content languages. Unchanged as an API: every existing consumer (quiz, mock test, the AI
   * feedback calls) keeps reading exactly this.
   */
  defaultLanguageCode: string;
  setDefaultLanguageCode: (code: string) => void;
  /**
   * Every content language the student chose during onboarding, in order, or empty for a device
   * that was never asked. Lets a picker offer the languages this student actually reads instead
   * of all eleven.
   */
  contentLanguages: string[];
  /**
   * Re-reads the stored selection.
   *
   * Needed because this provider is mounted ABOVE the onboarding provider — it has already done
   * its one read by the time onboarding writes the student's answer, and without being told it
   * would keep serving an empty selection for the rest of the session. The post-onboarding
   * preparation screen calls this as part of its own work.
   */
  refresh: () => Promise<void>;
};

const AppLanguageContext = createContext<AppLanguageContextValue>({
  defaultLanguageCode: "en",
  setDefaultLanguageCode: () => {},
  contentLanguages: [],
  refresh: async () => {},
});

export function useAppLanguage() {
  return useContext(AppLanguageContext);
}

/**
 * Holds the **content** language — the language questions and explanations are shown in.
 *
 * Deliberately not the same thing as the interface language, which lives in `I18nProvider` and
 * `app_preferences.ui_language`. The two have different supported sets (Hindi has question
 * content but no UI catalogue) and a student may reasonably want them to differ, so neither is
 * ever derived from the other.
 *
 * ## What changed, and why it is the minimum
 *
 * This used to be `useState("en")` and nothing else: the choice existed only in memory, was lost
 * on every app restart, and was never written anywhere. That gap is why onboarding asking for
 * content languages would otherwise have had no effect at all. It now reads and writes the
 * `content_language_preferences` table, so the answer given during onboarding is the answer the
 * quiz uses.
 *
 * The public API is unchanged, so no existing consumer needed editing.
 */
export function AppLanguageProvider({ children }: { children: ReactNode }) {
  const [contentLanguages, setContentLanguagesState] = useState<string[]>([]);
  // Same guard ThemeProvider and I18nProvider use: a slow read must not overwrite a choice made
  // while it was still in flight.
  const dirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getContentLanguages()
      .then((codes) => {
        if (cancelled || dirtyRef.current) return;
        setContentLanguagesState(codes);
      })
      .catch((err) => console.warn("Failed to read content languages", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirrors the state so the setter below can read the current selection without taking it as a
  // dependency, and without doing the persistence inside a state updater -- React may call an
  // updater twice, and a write in there would run twice with it.
  const selectionRef = useRef<string[]>([]);
  useEffect(() => {
    selectionRef.current = contentLanguages;
  }, [contentLanguages]);

  // A transient override for the "no stored selection yet" case, so a device that predates
  // onboarding keeps exactly its old in-memory behaviour.
  const [sessionDefault, setSessionDefault] = useState<string | null>(null);

  /**
   * Choosing a default reorders the existing selection rather than replacing it, so there stays
   * exactly one stored answer to "which languages does this student read".
   *
   * A code that is not among the chosen languages — which is every code on a device that
   * predates onboarding, since its table is empty — is honoured in memory for this session but
   * not persisted. That keeps the old behaviour intact for existing users instead of silently
   * writing them a preference they never gave.
   */
  const setDefaultLanguageCode = useCallback((code: string) => {
    dirtyRef.current = true;
    setSessionDefault(code);

    const current = selectionRef.current;
    if (!current.includes(code)) return;

    const next = [code, ...current.filter((c) => c !== code)];
    selectionRef.current = next;
    setContentLanguagesState(next);
    setContentLanguages(next).catch((err) => console.warn("Failed to save content languages", err));
  }, []);

  const refresh = useCallback(async () => {
    const codes = await getContentLanguages();
    selectionRef.current = codes;
    setContentLanguagesState(codes);
  }, []);

  const defaultLanguageCode = contentLanguages[0] ?? sessionDefault ?? "en";

  const value = useMemo<AppLanguageContextValue>(
    () => ({ defaultLanguageCode, setDefaultLanguageCode, contentLanguages, refresh }),
    [defaultLanguageCode, setDefaultLanguageCode, contentLanguages, refresh],
  );

  return <AppLanguageContext.Provider value={value}>{children}</AppLanguageContext.Provider>;
}
