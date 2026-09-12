/**
 * The translation engine, with no React and no storage in it.
 *
 * Lifted out of mobile's I18nContext.tsx by TASK-2601 Phase 0 so web/ gets identical lookup,
 * interpolation and fallback behaviour instead of a second, subtly different implementation.
 * Each app still owns its own provider and its own persistence — mobile writes the chosen
 * language to SQLite, web to localStorage — because only the surrounding wiring differs.
 */
import { en, type Catalogue } from "./en";
import { te } from "./te";

/**
 * The languages the UI is actually translated into. Derived from what catalogues exist here,
 * which is the honest source of truth: question *content* is separately bilingual
 * English/Hindi, but there is no Hindi UI catalogue and never has been.
 */
export type UiLanguage = "en" | "te";

export const CATALOGUES: Record<UiLanguage, Catalogue> = { en, te };

export const FALLBACK_LANGUAGE: UiLanguage = "en";

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

export type Translate = (key: TranslationKey, vars?: TranslateVars) => string;

export function lookup(catalogue: Catalogue, key: string): string | undefined {
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
export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * Builds the `t` function for one language. Falls back to English for a key the chosen
 * catalogue is missing, and to the key itself if English lacks it too — so a missing string
 * shows up as a visible key rather than a blank space.
 */
export function translatorFor(language: UiLanguage): Translate {
  const catalogue = CATALOGUES[language] ?? CATALOGUES[FALLBACK_LANGUAGE];
  return (key, vars) =>
    interpolate(lookup(catalogue, key) ?? lookup(en, key) ?? key, vars);
}
