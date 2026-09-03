import { eq } from "drizzle-orm";
import { db } from "./client";
import { appPreferences } from "./schema";

const CURRENT_KEY = "current";

export type ThemeMode = "dark" | "light";
export type UiLanguage = "en" | "te";

export type AppPreferences = {
  themeMode: ThemeMode;
  /** Content scale multiplier. 1 = 100%. */
  zoomLevel: number;
  uiLanguage: UiLanguage;
};

/**
 * Dark, 100%, English — the app as it shipped before any of this existed, so an
 * existing user who never opens Settings sees no change whatsoever.
 */
export const DEFAULT_PREFERENCES: AppPreferences = {
  themeMode: "dark",
  zoomLevel: 1,
  uiLanguage: "en",
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
}): AppPreferences {
  return {
    themeMode: THEME_MODES.includes(row.themeMode ?? "")
      ? (row.themeMode as ThemeMode)
      : DEFAULT_PREFERENCES.themeMode,
    zoomLevel: nearestZoomStep(row.zoomLevel),
    uiLanguage: UI_LANGUAGES.includes(row.uiLanguage ?? "")
      ? (row.uiLanguage as UiLanguage)
      : DEFAULT_PREFERENCES.uiLanguage,
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
  };
  await db
    .insert(appPreferences)
    .values(values)
    .onConflictDoUpdate({ target: appPreferences.key, set: values });
}
