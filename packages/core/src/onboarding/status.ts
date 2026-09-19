/**
 * Deciding, once per install, whether onboarding is owed to this user at all.
 *
 * This is the piece that has to be right for the people who are already using the app. A new
 * flow that greets an existing student with "what should we call you?" — after they have
 * practised for weeks — reads as the app having lost their data, whatever it actually did.
 */

export type OnboardingStatus =
  /** Onboarding was completed (or adopted) — show the app. */
  | "COMPLETED"
  /** Show the flow. Any partially-entered answers already saved are resumed. */
  | "REQUIRED"
  /**
   * A device that was already in use before onboarding existed. Not shown the flow, and
   * stamped complete so this is decided once rather than re-derived on every launch.
   */
  | "ADOPT_EXISTING_INSTALL";

export type OnboardingSignals = {
  /** `onboarding_completed_at` — the only positive proof of completion. */
  completedAt: string | null;
  /**
   * `onboarding_started_at` — written the moment this resolver first answers REQUIRED.
   *
   * Load-bearing, not bookkeeping. Without it, the usage signals below re-decide the question
   * on every launch, and they all turn true *while the flow is on screen*: the first sync
   * completes, `ensureExamFollowed` follows an exam, and a student who killed the app halfway
   * through onboarding would be adopted as an existing user and never asked again.
   */
  startedAt: string | null;
  /** This device has completed at least one sync (`sync_meta.last_synced_at`). */
  hasSyncedBefore: boolean;
  /** Any practice session or mock attempt exists locally. */
  hasPracticeHistory: boolean;
  /** Any exam is followed. */
  hasFollowedExams: boolean;
  /** A signed-in account was restored from storage. */
  hasAccount: boolean;
};

/**
 * Four ordered questions, and the order is the whole design:
 *
 * 1. Stamped complete? Then it is complete — nothing else can override that.
 * 2. Already decided to be required? Then stay required, even though the signals below may
 *    have turned true in the meantime (see `startedAt`).
 * 3. Any sign this install was used before onboarding existed? Adopt it silently.
 * 4. Otherwise it is genuinely a first launch.
 *
 * Step 3 is deliberately generous — *any one* signal is enough. The two failure modes are not
 * symmetric: wrongly adopting a true first-time user costs them a personalised name (and they
 * can still set one, the app works exactly as it did before), while wrongly re-onboarding an
 * existing user looks like data loss. When in doubt, this treats the install as existing.
 */
export function resolveOnboardingStatus(signals: OnboardingSignals): OnboardingStatus {
  if (signals.completedAt) return "COMPLETED";
  if (signals.startedAt) return "REQUIRED";

  const looksUsed =
    signals.hasSyncedBefore || signals.hasPracticeHistory || signals.hasFollowedExams || signals.hasAccount;

  return looksUsed ? "ADOPT_EXISTING_INSTALL" : "REQUIRED";
}

/** Morning/afternoon/evening from a local hour, for the personalised Home greeting. */
export function greetingPeriod(hour: number): "morning" | "afternoon" | "evening" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}
