import { createContext, useContext } from "react";
import { translatorFor, CATALOGUES, type Translate, type UiLanguage } from "@sarkaritaiyaari/core/i18n";

/** Split from the provider so Fast Refresh keeps working — see the note in ThemeContext.ts. */

export const AVAILABLE_LANGUAGES = Object.keys(CATALOGUES) as UiLanguage[];

export type I18nContextValue = {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  t: Translate;
};

export const I18nContext = createContext<I18nContextValue>({
  language: "en",
  setLanguage: () => {},
  t: translatorFor("en"),
});

export function useI18n() {
  return useContext(I18nContext);
}

/** The common case — just the translate function. */
export function useT() {
  return useContext(I18nContext).t;
}
