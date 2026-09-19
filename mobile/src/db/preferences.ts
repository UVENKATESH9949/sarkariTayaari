import { eq } from "drizzle-orm";
import type { UiLanguage } from "@sarkaritaiyaari/core/i18n";
import { db } from "./client";
import { appPreferences } from "./schema";

const CURRENT_KEY = "current";

export type ThemeMode = "dark" | "light";
/**
 * Re-exported so existing call sites keep importing it from here. The set of UI languages is
 * defined by which catalogues exist in `@sarkaritaiyaari/core/i18n`, not by this table.
 */
export type { UiLanguage };

export type AppPreferences = {
  themeMode: ThemeMode;
  /** Content scale multiplier. 1 = 100%. */
  zoomLevel: number;
  uiLanguage: UiLanguage;
  /**
   * The exam code currently driving Home and every exam-scoped screen. Null means "not
   * chosen yet"; a code that is no longer followed is equally possible and equally fine.
   * Neither case is resolved here -- `examsModule/activeExamContext.tsx` owns that, because
   * only it can see the live followed-exam list.
   */
  activeExamCode: string | null;
};

/**
 * Light, 100%, English, no active exam chosen.
 */
export const DEFAULT_PREFERENCES: AppPreferences = {
  themeMode: "light",
  zoomLevel: 1,
  uiLanguage: "en",
  activeExamCode: null,
};

/**
 * The zoom steps offered in Settings. A discrete ladder rather than a continuous
 * slider: every step is a value the layouts were actually checked at, and it makes
 * "reset to 100%" a real position on the scale instead of an approximate one.
 *
 * Capped at 1.3 rather than going higher because past roughly that point the quiz
 * footer button and the four answer options stop fitting on a small phone together,
 * and a zoom setting that hides the Next button is worse than no zoom setting.
 */
export const ZOOM_STEPS = [0.9, 1, 1.1, 1.2, 1.3] as const;

const THEME_MODES: readonly string[] = ["dark", "light"];
const UI_LANGUAGES: readonly string[] = ["en", "te"];

/**
 * Every field is validated on the way out, not trusted.
 *
 * These rows outlive the code that wrote them: a value written by a build where the
 * zoom ladder had different steps, or a language that a later build dropped, must not
 * be able to produce a broken UI or an unresolvable translation lookup. An unrecognised
 * value is treated exactly like an absent one.
 */
function coerce(row: {
  themeMode: string | null;
  zoomLevel: number | null;
  uiLanguage: string | null;
  activeExamCode: string | null;
}): AppPreferences {
  return {
    themeMode: THEME_MODES.includes(row.themeMode ?? "")
      ? (row.themeMode as ThemeMode)
      : DEFAULT_PREFERENCES.themeMode,
    zoomLevel: nearestZoomStep(row.zoomLevel),
    uiLanguage: UI_LANGUAGES.includes(row.uiLanguage ?? "")
      ? (row.uiLanguage as UiLanguage)
      : DEFAULT_PREFERENCES.uiLanguage,
    // Not validated against a fixed set, unlike the three above: the valid values are
    // whichever exams this device has synced and followed, which this module cannot see.
    // An empty string is normalised to null so "" and NULL cannot mean two things.
    activeExamCode: row.activeExamCode ? row.activeExamCode : null,
  };
}

/**
 * Snaps to the closest offered step rather than clamping, so a value from a build with
 * a finer ladder lands on the nearest thing this build can actually render and the
 * Settings control still highlights a real position.
 */
function nearestZoomStep(value: number | null): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_PREFERENCES.zoomLevel;
  let best: number = ZOOM_STEPS[0];
  for (const step of ZOOM_STEPS) {
    if (Math.abs(step - value) < Math.abs(best - value)) best = step;
  }
  return best;
}

/** Never rejects: a read failure falls back to defaults rather than blocking startup. */
export async function loadPreferences(): Promise<AppPreferences> {
  try {
    const row = await db.select().from(appPreferences).where(eq(appPreferences.key, CURRENT_KEY)).get();
    if (!row) return DEFAULT_PREFERENCES;
    return coerce(row);
  } catch (err) {
    console.warn("Failed to read preferences — using defaults", err);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Writes only the fields provided, so changing the theme cannot clobber a zoom level
 * chosen a moment earlier by a different control.
 */
export async function savePreferences(patch: Partial<AppPreferences>): Promise<void> {
  const values = {
    key: CURRENT_KEY,
    ...(patch.themeMode !== undefined ? { themeMode: patch.themeMode } : {}),
    ...(patch.zoomLevel !== undefined ? { zoomLevel: patch.zoomLevel } : {}),
    ...(patch.uiLanguage !== undefined ? { uiLanguage: patch.uiLanguage } : {}),
    ...(patch.activeExamCode !== undefined ? { activeExamCode: patch.activeExamCode } : {}),
  };
  await db
    .insert(appPreferences)
    .values(values)
    .onConflictDoUpdate({ target: appPreferences.key, set: values });
}
