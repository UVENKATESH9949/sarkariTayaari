import type { DailyStudyTime, PreparationLevel } from "@sarkaritaiyaari/core/onboarding";
import { loadPreparationProfile, savePreparationProfile } from "../db/onboarding";
import { loadSession } from "../db/authSession";
import { syncPreparationProfile } from "../sync/preparationProfileSync";

/**
 * Reading and changing the two profile answers the planner actually uses.
 *
 * <h2>Why this exists at all</h2>
 * Onboarding asked these questions once, on first run, and nothing could change them afterwards —
 * `savePreparationProfile` had exactly one caller and it was the first-run flow. That only became
 * a visible problem when `daily-plan.tsx` shipped and started telling students *"we've assumed an
 * hour"*: the screen could name the assumption and the student had no way to correct it. The
 * column that makes a later edit resolvable across devices (`profile_updated_at`, migration 0030)
 * already existed for edits nothing made.
 *
 * Deliberately narrow: the study-time band and the preparation level, not the whole profile. The
 * active exam has its own switcher, and a display name is not a planning input.
 */

export type PlanningPreferences = {
  dailyStudyTime: DailyStudyTime | null;
  preparationLevel: PreparationLevel | null;
};

export async function loadPlanningPreferences(): Promise<PlanningPreferences> {
  const profile = await loadPreparationProfile();
  return {
    dailyStudyTime: profile.dailyStudyTime,
    preparationLevel: profile.preparationLevel,
  };
}

/**
 * Saves locally, then pushes to the server when signed in.
 *
 * The local write comes first and is what the caller's success depends on: this is a device-local
 * profile that happens to sync, exactly as it was during onboarding, and a student on a train must
 * still be able to change their mind. `savePreparationProfile` stamps `profileUpdatedAt` to now, so
 * this edit legitimately wins against an older one made on another device.
 *
 * The push is best effort and never throws — the ordinary sync on the next sign-in, push or
 * sign-out will carry it, since that is the same `syncPreparationProfile` this calls.
 */
export async function savePlanningPreferences(patch: Partial<PlanningPreferences>): Promise<void> {
  await savePreparationProfile(patch);

  const token = (await loadSession())?.token ?? null;
  if (!token) return;
  try {
    await syncPreparationProfile(token);
  } catch {
    // Deliberately silent. The edit is safely on the device and every sync point retries it;
    // surfacing a network error here would make a local preference look like it failed to save.
  }
}
