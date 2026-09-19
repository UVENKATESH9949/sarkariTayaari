/**
 * The preparation profile — what a first-time student tells the app about themselves, and
 * the shape every consumer reads it back in.
 *
 * ## Why this lives in the shared package
 *
 * Two reasons, in order of importance:
 *
 * 1. **It is the only half of onboarding that can be automatically tested.** `mobile/` has no
 *    JavaScript test runner in this project (confirmed, not assumed — see `qa/README.md`'s
 *    automation rules), `packages/core` does. Putting the validation here means the rules a
 *    student's answers are checked against are proven by real tests rather than by a manual
 *    pass, which is exactly the split `evaluation/` and `intelligence/` already use.
 * 2. `web/` will eventually need the same profile, and a second, subtly different copy of
 *    "what counts as a valid name" is how the two platforms drift.
 *
 * What is deliberately NOT here: persistence. Mobile writes this to its SQLite
 * `app_preferences` row, and any other host writes it wherever it keeps preferences — the
 * same division i18n already draws between `translatorFor()` and each app's own provider.
 *
 * ## Designed for data it does not collect yet
 *
 * Every field here is something a student can answer in under a second. The far larger set of
 * facts a preparation profile eventually wants — subject/topic strength, accuracy, response
 * time, mistake patterns, revision and mock history — is **computed from real behaviour**, not
 * asked for, and most of it already exists (`user_topic_progress`, the weakness radar's
 * `user_topic_health`). Nothing here duplicates it, and nothing here needs to change when a
 * diagnostic assessment starts contributing to it: a diagnostic writes evidence, this record
 * holds stated intent.
 */
import type { UiLanguage } from "../i18n";

/**
 * Where the student says they are in their preparation.
 *
 * A closed set rather than free text because the point of asking is to branch on the answer
 * later (recommendations, practice targets, plan generation) — and a value that arrives as
 * "im just starting out lol" cannot be branched on. Stored as the stable identifier, never
 * as the label shown on screen, so re-wording the UI never rewrites anybody's saved profile.
 */
export const PREPARATION_LEVELS = [
  "JUST_STARTING",
  "LEARNING",
  "PRACTICING",
  "REVISING",
  "EXAM_READY",
] as const;

export type PreparationLevel = (typeof PREPARATION_LEVELS)[number];

/**
 * A band, not a number of minutes.
 *
 * Asking "how many hours?" invites a precise-looking answer that is really a guess, and then
 * everything downstream treats 2.0 and 2.5 as a meaningful difference. Bands are honest about
 * the resolution of the question, and they are what a daily plan actually needs.
 */
export const DAILY_STUDY_TIMES = [
  "UNDER_1H",
  "ONE_TO_TWO",
  "TWO_TO_FOUR",
  "FOUR_TO_SIX",
  "SIX_PLUS",
] as const;

export type DailyStudyTime = (typeof DAILY_STUDY_TIMES)[number];

/**
 * How many languages a student may pick their *content* in.
 *
 * Capped at two on purpose, and the reason is data volume rather than taste: the question bank
 * is ~1 lakh questions across ~10 languages, so every extra language a device opts into is
 * another full translation set to sync and store. Two covers the realistic cases -- English plus
 * a mother tongue -- and a student who wants a third is far cheaper to serve by letting them
 * change the pair than by shipping all ten to every phone.
 */
export const MIN_CONTENT_LANGUAGES = 1;
export const MAX_CONTENT_LANGUAGES = 2;

export type PreparationProfile = {
  /**
   * What the student wants to be called. A personalisation name, explicitly not a legal name
   * — nothing in this app verifies identity, and asking for one would imply it does.
   */
  displayName: string;
  /**
   * The INTERFACE language -- navigation, buttons, labels, onboarding itself. Written through to
   * the same `uiLanguage` preference Settings already owns.
   *
   * Deliberately NOT the same thing as {@link contentLanguages}, and never derived from it. A
   * student can perfectly well read an English interface while studying questions in Telugu, or
   * the reverse; assuming the two match would silently take one of those choices away. The two
   * also have genuinely different supported sets: the interface exists only in the languages
   * with a translation catalogue, while content exists in whatever the question bank was
   * authored in.
   */
  preferredLanguage: UiLanguage;
  /**
   * The languages this student wants their QUESTIONS and explanations in -- between
   * {@link MIN_CONTENT_LANGUAGES} and {@link MAX_CONTENT_LANGUAGES} of them, in the order chosen,
   * so the first is the one a screen defaults to.
   *
   * Codes come from the synced `languages` table, which is the app's real supported-content-language
   * list. (The 11-entry array in mobile's `practice/appLanguage.tsx` is a mock -- its own comment
   * says so -- and is not a source of truth for this.)
   */
  contentLanguages: string[];
  /**
   * The exam chosen during onboarding. Null is a real, supported state: a fresh install with
   * no network has no catalogue to choose from, and refusing to let that student finish
   * onboarding would be worse than letting the existing auto-follow pick one later.
   *
   * NOT the source of truth for which exam is active — `app_preferences.active_exam_code` is,
   * resolved by `examsModule/activeExamContext`. This records what was chosen *here*, so a
   * later change of exam elsewhere does not look like onboarding was wrong.
   */
  primaryExamCode: string | null;
  /**
   * An `exam_stages.id` for the selected exam, or null. Null covers three different situations
   * on purpose — the exam has no stages recorded, it has exactly one (so there was nothing to
   * ask), or the student chose "both/not sure". None of them is an error.
   */
  examStageId: string | null;
  /** Calendar year the student is aiming at, or null for "not sure yet". */
  targetYear: number | null;
  preparationLevel: PreparationLevel | null;
  dailyStudyTime: DailyStudyTime | null;
  /** ISO timestamp, or null when onboarding has not been completed. This is the flag. */
  onboardingCompletedAt: string | null;
};

export const EMPTY_PREPARATION_PROFILE: PreparationProfile = {
  displayName: "",
  preferredLanguage: "en",
  contentLanguages: [],
  primaryExamCode: null,
  examStageId: null,
  targetYear: null,
  preparationLevel: null,
  dailyStudyTime: null,
  onboardingCompletedAt: null,
};

export function isPreparationLevel(value: unknown): value is PreparationLevel {
  return typeof value === "string" && (PREPARATION_LEVELS as readonly string[]).includes(value);
}

export function isDailyStudyTime(value: unknown): value is DailyStudyTime {
  return typeof value === "string" && (DAILY_STUDY_TIMES as readonly string[]).includes(value);
}

/** Onboarding is complete when, and only when, it was stamped. */
export function isOnboardingComplete(profile: Pick<PreparationProfile, "onboardingCompletedAt">): boolean {
  return profile.onboardingCompletedAt !== null && profile.onboardingCompletedAt !== "";
}
