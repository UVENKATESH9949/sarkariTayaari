import { eq, sql } from "drizzle-orm";
import {
  EMPTY_PREPARATION_PROFILE,
  isDailyStudyTime,
  isPreparationLevel,
  resolveOnboardingStatus,
  type OnboardingStatus,
  type PreparationProfile,
} from "@sarkaritaiyaari/core/onboarding";
import { db } from "./client";
import { appPreferences, authSession, followedExams, mockTestAttempts, practiceSessions } from "./schema";
import { getLastSyncedAt } from "./syncMeta";
import { getContentLanguages, setContentLanguages } from "./contentLanguages";

const CURRENT_KEY = "current";

/**
 * Reading and writing the preparation profile.
 *
 * It shares the single `app_preferences` row with `db/preferences.ts` rather than living in a
 * table of its own — see migration 0027 for why — and the two modules can write concurrently
 * without clobbering each other because both build their upsert from **only the fields they
 * were given**. Neither ever writes a column it does not own.
 *
 * Kept as a separate module rather than folded into `preferences.ts` because the concerns are
 * genuinely different: one is appearance and language, changed from Settings whenever the
 * student likes; this is a profile written once during onboarding and read by everything that
 * personalises. Merging them would make `AppPreferences` a twelve-field grab bag.
 */

/**
 * Every field is validated on the way out, never trusted — same posture as `coerce()` in
 * `preferences.ts`, and for the same reason: these rows outlive the code that wrote them. A
 * `preparation_level` written by a build whose enum has since changed must read back as
 * "unknown", not as a value nothing downstream can branch on.
 */
function coerce(row: {
  displayName: string | null;
  primaryExamCode: string | null;
  examStageId: string | null;
  targetYear: number | null;
  preparationLevel: string | null;
  dailyStudyTime: string | null;
  onboardingStartedAt: string | null;
  onboardingCompletedAt: string | null;
  uiLanguage: string | null;
}): PreparationProfile & { onboardingStartedAt: string | null } {
  return {
    displayName: row.displayName?.trim() ? row.displayName.trim() : "",
    // Filled in by loadPreparationProfile from its own table — see the note there.
    contentLanguages: [],
    // Read back from the language preference itself, not from a duplicate column — that is
    // what keeps "the language onboarding chose" and "the language the app is in" one fact.
    preferredLanguage: row.uiLanguage === "te" ? "te" : "en",
    // Empty string normalised to null so "" and NULL cannot come to mean two different things.
    primaryExamCode: row.primaryExamCode || null,
    examStageId: row.examStageId || null,
    targetYear: Number.isInteger(row.targetYear) ? row.targetYear : null,
    preparationLevel: isPreparationLevel(row.preparationLevel) ? row.preparationLevel : null,
    dailyStudyTime: isDailyStudyTime(row.dailyStudyTime) ? row.dailyStudyTime : null,
    onboardingStartedAt: row.onboardingStartedAt || null,
    onboardingCompletedAt: row.onboardingCompletedAt || null,
  };
}

export type StoredProfile = PreparationProfile & { onboardingStartedAt: string | null };

const EMPTY_STORED: StoredProfile = { ...EMPTY_PREPARATION_PROFILE, onboardingStartedAt: null };

/** Never rejects: a read failure falls back to an empty profile rather than blocking startup. */
export async function loadPreparationProfile(): Promise<StoredProfile> {
  try {
    // Two reads because the profile spans two places on purpose: the scalars live on the single
    // `app_preferences` row, and the content languages are a genuinely multi-valued relationship
    // with its own table (see migration 0028). They are assembled here so no caller has to know.
    const [row, contentLanguages] = await Promise.all([
      db.select().from(appPreferences).where(eq(appPreferences.key, CURRENT_KEY)).get(),
      getContentLanguages(),
    ]);
    if (!row) return { ...EMPTY_STORED, contentLanguages };
    return { ...coerce(row), contentLanguages };
  } catch (err) {
    console.warn("Failed to read preparation profile — treating as empty", err);
    return EMPTY_STORED;
  }
}

/** Writes only the fields provided, so a partially-answered flow never blanks the rest. */
export async function savePreparationProfile(patch: Partial<StoredProfile>): Promise<void> {
  // Routed to its own table rather than the preferences row. Done first so a failure here
  // surfaces before the scalars are written, rather than leaving the two halves disagreeing.
  if (patch.contentLanguages !== undefined) {
    await setContentLanguages(patch.contentLanguages);
  }

  const values = {
    key: CURRENT_KEY,
    ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
    ...(patch.primaryExamCode !== undefined ? { primaryExamCode: patch.primaryExamCode } : {}),
    ...(patch.examStageId !== undefined ? { examStageId: patch.examStageId } : {}),
    ...(patch.targetYear !== undefined ? { targetYear: patch.targetYear } : {}),
    ...(patch.preparationLevel !== undefined ? { preparationLevel: patch.preparationLevel } : {}),
    ...(patch.dailyStudyTime !== undefined ? { dailyStudyTime: patch.dailyStudyTime } : {}),
    ...(patch.onboardingStartedAt !== undefined ? { onboardingStartedAt: patch.onboardingStartedAt } : {}),
    ...(patch.onboardingCompletedAt !== undefined ? { onboardingCompletedAt: patch.onboardingCompletedAt } : {}),
    // Deliberately absent: preferredLanguage (written through savePreferences({ uiLanguage }), so
    // there is exactly one column and therefore one answer for the interface language) and
    // contentLanguages (its own table, handled above).
  };
  await db
    .insert(appPreferences)
    .values(values)
    .onConflictDoUpdate({ target: appPreferences.key, set: values });
}

async function hasAnyRow(table: typeof practiceSessions | typeof mockTestAttempts): Promise<boolean> {
  // `limit(1)` rather than a count: the question is "any at all", and on a device with
  // thousands of sessions counting them all to answer a yes/no is pure waste.
  const row = await db.select({ one: sql<number>`1` }).from(table).limit(1).get();
  return row !== undefined;
}

/**
 * Gathers the four "has this install been used before?" signals.
 *
 * Read **once**, at startup, before the first sync can land — see `resolveOnboardingStatus`
 * for why the timing matters and what stops it mattering after the first read.
 *
 * Wrapped as a whole rather than per-signal, because `false` is the direction that shows the
 * flow: a query that failed would otherwise re-onboard a real user, which is the worse of the
 * two possible mistakes. A failed read returns null, and the caller treats the install as
 * existing rather than guessing.
 */
export async function readOnboardingSignals(): Promise<{
  completedAt: string | null;
  startedAt: string | null;
  hasSyncedBefore: boolean;
  hasPracticeHistory: boolean;
  hasFollowedExams: boolean;
  hasAccount: boolean;
} | null> {
  try {
    const [profile, lastSyncedAt, practised, mocked, followed, session] = await Promise.all([
      loadPreparationProfile(),
      getLastSyncedAt(),
      hasAnyRow(practiceSessions),
      hasAnyRow(mockTestAttempts),
      db.select({ one: sql<number>`1` }).from(followedExams).where(eq(followedExams.isDeleted, false)).limit(1).get(),
      db.select({ one: sql<number>`1` }).from(authSession).limit(1).get(),
    ]);

    return {
      completedAt: profile.onboardingCompletedAt,
      startedAt: profile.onboardingStartedAt,
      hasSyncedBefore: lastSyncedAt !== null,
      hasPracticeHistory: practised || mocked,
      hasFollowedExams: followed !== undefined,
      hasAccount: session !== undefined,
    };
  } catch (err) {
    console.warn("Failed to read onboarding signals", err);
    return null;
  }
}

/**
 * The startup decision, made once and persisted so it cannot be re-made differently later.
 *
 * - `COMPLETED` — nothing to do.
 * - `ADOPT_EXISTING_INSTALL` — stamped complete immediately, so a device that predates
 *   onboarding is asked exactly zero questions and never re-evaluated.
 * - `REQUIRED` — stamped *started*, which is what makes the flow survive being killed halfway.
 *
 * A failed signal read is treated as `COMPLETED`: the app must not interrogate an existing
 * student because a query failed.
 */
export async function resolveAndStampOnboardingStatus(): Promise<OnboardingStatus> {
  const signals = await readOnboardingSignals();
  if (!signals) return "COMPLETED";

  const status = resolveOnboardingStatus(signals);
  const now = new Date().toISOString();

  if (status === "ADOPT_EXISTING_INSTALL") {
    await savePreparationProfile({ onboardingCompletedAt: now });
  } else if (status === "REQUIRED" && !signals.startedAt) {
    await savePreparationProfile({ onboardingStartedAt: now });
  }

  return status;
}

/** Stamps completion. The one write that ends onboarding. */
export async function markOnboardingCompleted(): Promise<string> {
  const now = new Date().toISOString();
  await savePreparationProfile({ onboardingCompletedAt: now });
  return now;
}

/**
 * The name to greet someone by, or null when there is nothing personal to say.
 *
 * Order matters: the onboarding name wins over the account's display name, because it is what
 * this person typed when asked what to call them, on this device, most recently. Falling back
 * to the account name covers a student who onboarded before this feature existed and signed in
 * afterwards.
 */
export async function getGreetingName(accountDisplayName?: string | null): Promise<string | null> {
  const profile = await loadPreparationProfile();
  if (profile.displayName) return profile.displayName;
  const account = accountDisplayName?.trim();
  return account ? account : null;
}
