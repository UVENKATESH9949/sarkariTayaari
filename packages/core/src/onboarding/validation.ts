/**
 * Validation for everything onboarding collects.
 *
 * The rule this file exists to enforce: **an invalid value is never silently saved.** Every
 * answer either passes and is stored in its normalised form, or is rejected with a reason the
 * UI can turn into a message. There is no third path where something questionable gets
 * written and quietly misbehaves three screens later.
 *
 * All of it is pure, so all of it is tested (`validation.test.ts`). The step components own
 * layout and nothing else.
 */
import { CATALOGUES, type UiLanguage } from "../i18n";
import {
  MAX_CONTENT_LANGUAGES,
  MIN_CONTENT_LANGUAGES,
  isDailyStudyTime,
  isPreparationLevel,
  type DailyStudyTime,
  type PreparationLevel,
  type PreparationProfile,
} from "./profile";

/**
 * Long enough for a real name with a couple of parts, short enough that nothing downstream has
 * to plan for a paragraph — this string ends up inside a greeting on Home, where a 200-character
 * "name" would wrap the header into the rest of the screen.
 */
export const DISPLAY_NAME_MAX_LENGTH = 40;

/**
 * Characters that are invisible but not whitespace, so no amount of trimming removes them:
 * C0/C1 controls, zero-width space/non-joiner/joiner, the bidi marks, the line/paragraph
 * separators, and the BOM.
 *
 * Worth stripping rather than rejecting, because they arrive by accident — pasted from a PDF,
 * or inserted by a keyboard's own composition — and a student whose name "won't save" with no
 * visible reason has no way to fix it. Stripped first, so a name made *entirely* of them is
 * then correctly seen as empty.
 */
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF]/g;

/**
 * Trims, removes invisibles, and collapses every run of whitespace to a single space.
 *
 * `\s` with the `u` flag covers the whitespace that actually shows up in practice and that a
 * naive `trim()` on its own would keep in the middle of the string — the non-breaking space
 * (U+00A0) from a copy-paste and the ideographic space (U+3000) from a CJK keyboard both
 * match here.
 */
export function normaliseDisplayName(raw: string): string {
  return raw.replace(INVISIBLE, "").replace(/\s+/gu, " ").trim();
}

/** Counted in code points, so an emoji or a Devanagari cluster is not charged as several. */
function lengthInCodePoints(value: string): number {
  return Array.from(value).length;
}

export type FieldValidationFailure = "EMPTY" | "TOO_LONG" | "UNSUPPORTED" | "OUT_OF_RANGE" | "TOO_MANY";

export type FieldValidation<T> = { ok: true; value: T } | { ok: false; reason: FieldValidationFailure };

/**
 * A name is required, and "  " is not a name — which is the whole reason this normalises
 * before measuring rather than after.
 */
export function validateDisplayName(raw: string): FieldValidation<string> {
  const value = normaliseDisplayName(raw);
  if (value.length === 0) return { ok: false, reason: "EMPTY" };
  if (lengthInCodePoints(value) > DISPLAY_NAME_MAX_LENGTH) return { ok: false, reason: "TOO_LONG" };
  return { ok: true, value };
}

/**
 * The languages the interface is genuinely translated into — derived from which catalogues
 * exist, never a hand-written list.
 *
 * This is the honest answer to "which languages does this app support", and it is smaller than
 * people expect: question *content* is separately English/Hindi, and neither of those facts is
 * changed by adding more entries to a picker. Offering a language with no catalogue behind it
 * would show a student an English app after they chose something else.
 */
export function supportedUiLanguages(): UiLanguage[] {
  return Object.keys(CATALOGUES) as UiLanguage[];
}

export function validateLanguage(value: unknown): FieldValidation<UiLanguage> {
  if (typeof value === "string" && (supportedUiLanguages() as string[]).includes(value)) {
    return { ok: true, value: value as UiLanguage };
  }
  return { ok: false, reason: "UNSUPPORTED" };
}

/**
 * An exam is valid when it is one this device can actually offer.
 *
 * `null` passes deliberately: a first launch with no network has an empty catalogue, and the
 * choice is then genuinely unavailable rather than wrong. Onboarding must still be completable
 * — see `PreparationProfile.primaryExamCode`.
 */
export function validateExamCode(value: string | null, availableCodes: readonly string[]): FieldValidation<string | null> {
  if (value === null) return { ok: true, value: null };
  if (availableCodes.includes(value)) return { ok: true, value };
  return { ok: false, reason: "UNSUPPORTED" };
}

/** Same shape as the exam check, against the stages the *selected* exam actually has. */
export function validateExamStageId(value: string | null, availableIds: readonly string[]): FieldValidation<string | null> {
  if (value === null) return { ok: true, value: null };
  if (availableIds.includes(value)) return { ok: true, value };
  return { ok: false, reason: "UNSUPPORTED" };
}

/** How many years ahead the target-year question offers. Three plus "not sure yet". */
export const TARGET_YEAR_HORIZON = 3;

/**
 * Derived from the year it is asked in, never a literal list.
 *
 * A hardcoded `[2026, 2027, 2028]` is correct for exactly as long as nobody notices, and then
 * it quietly offers a student a target year that has already passed.
 */
export function targetYearOptions(currentYear: number): number[] {
  return Array.from({ length: TARGET_YEAR_HORIZON }, (_, i) => currentYear + i);
}

/**
 * The past is rejected, the far future is rejected, and null ("not sure yet") is accepted —
 * that last one being a real answer for most people starting out, not a skipped question.
 */
export function validateTargetYear(value: number | null, currentYear: number): FieldValidation<number | null> {
  if (value === null) return { ok: true, value: null };
  if (!Number.isInteger(value)) return { ok: false, reason: "OUT_OF_RANGE" };
  if (value < currentYear || value > currentYear + TARGET_YEAR_HORIZON) {
    return { ok: false, reason: "OUT_OF_RANGE" };
  }
  return { ok: true, value };
}

/**
 * Content languages: at least one, at most {@link MAX_CONTENT_LANGUAGES}, every code supported.
 *
 * `available` is the synced `languages` table, not the interface-language set -- the two are
 * different questions with different answers, and conflating them is the single mistake this
 * whole pair of fields exists to prevent. Duplicates are rejected rather than quietly deduped,
 * because a duplicate means the caller's selection state is wrong and silently repairing it
 * would hide that.
 */
export function validateContentLanguages(
  codes: readonly string[],
  available: readonly string[],
): FieldValidation<string[]> {
  // Nothing to choose from is unavailable, not invalid — the same distinction
  // {@link validateExamCode} draws. A first launch with no network has no synced `languages`
  // table, and demanding a selection there would trap the student in onboarding with no way
  // to satisfy the rule. The app falls back to its default language until they set one.
  if (available.length === 0) return { ok: true, value: [] };
  if (codes.length < MIN_CONTENT_LANGUAGES) return { ok: false, reason: "EMPTY" };
  if (codes.length > MAX_CONTENT_LANGUAGES) return { ok: false, reason: "TOO_MANY" };
  if (new Set(codes).size !== codes.length) return { ok: false, reason: "UNSUPPORTED" };
  if (codes.some((c) => !available.includes(c))) return { ok: false, reason: "UNSUPPORTED" };
  // Order is preserved, not sorted: the first choice is the one screens default to.
  return { ok: true, value: [...codes] };
}

/**
 * What tapping a language in the picker does.
 *
 * Pulled out of the component and tested here because the brief is specific about the
 * behaviour at the limit, and it is the kind of rule that quietly rots into "helpfully" evicting
 * something: selecting a third language must **refuse**, leaving the existing two exactly as
 * they are, so the student decides which one to give up rather than the app deciding for them.
 *
 * Returns the next selection plus whether the tap was refused, so the caller can show the
 * "up to 2" message only when it actually applies.
 */
export function toggleContentLanguage(
  current: readonly string[],
  code: string,
): { next: string[]; refused: boolean } {
  if (current.includes(code)) {
    // Deselecting is always allowed -- including down to zero, which the step then blocks at
    // Continue. Forbidding the last removal would trap someone who wants to swap both.
    return { next: current.filter((c) => c !== code), refused: false };
  }
  if (current.length >= MAX_CONTENT_LANGUAGES) {
    return { next: [...current], refused: true };
  }
  return { next: [...current, code], refused: false };
}

export function validatePreparationLevel(value: unknown): FieldValidation<PreparationLevel> {
  return isPreparationLevel(value) ? { ok: true, value } : { ok: false, reason: "UNSUPPORTED" };
}

export function validateDailyStudyTime(value: unknown): FieldValidation<DailyStudyTime> {
  return isDailyStudyTime(value) ? { ok: true, value } : { ok: false, reason: "UNSUPPORTED" };
}

/** What the flow holds while the student is still filling it in — every answer still optional. */
export type ProfileDraft = {
  displayName: string;
  preferredLanguage: UiLanguage;
  contentLanguages: string[];
  primaryExamCode: string | null;
  examStageId: string | null;
  targetYear: number | null;
  preparationLevel: PreparationLevel | null;
  dailyStudyTime: DailyStudyTime | null;
};

export type DraftValidationContext = {
  /** Codes from the synced `languages` table -- the real supported-CONTENT-language list. */
  availableContentLanguages: readonly string[];
  availableExamCodes: readonly string[];
  /** Stages of the *selected* exam only — an empty list means the stage question wasn't asked. */
  availableStageIds: readonly string[];
  currentYear: number;
};

export type DraftValidationResult =
  | { ok: true; profile: Omit<PreparationProfile, "onboardingCompletedAt"> }
  | { ok: false; errors: Partial<Record<keyof ProfileDraft, FieldValidationFailure>> };

/**
 * The last gate before anything is written.
 *
 * Every step validates as the student moves through it, so in normal use this passes — it
 * exists for the cases that skip the steps: a draft restored after the app was killed
 * mid-onboarding, or a build where a step was reordered and left a field behind. It re-checks
 * everything rather than trusting that the flow already did, because it is the only place that
 * can guarantee what gets persisted is well-formed.
 *
 * It reports **all** failures, not the first — a caller that wants to highlight two bad fields
 * at once should not have to run it twice.
 */
export function validateProfileDraft(draft: ProfileDraft, context: DraftValidationContext): DraftValidationResult {
  const errors: Partial<Record<keyof ProfileDraft, FieldValidationFailure>> = {};

  const name = validateDisplayName(draft.displayName);
  if (!name.ok) errors.displayName = name.reason;

  const language = validateLanguage(draft.preferredLanguage);
  if (!language.ok) errors.preferredLanguage = language.reason;

  const contentLanguages = validateContentLanguages(draft.contentLanguages, context.availableContentLanguages);
  if (!contentLanguages.ok) errors.contentLanguages = contentLanguages.reason;

  const exam = validateExamCode(draft.primaryExamCode, context.availableExamCodes);
  if (!exam.ok) errors.primaryExamCode = exam.reason;

  const stage = validateExamStageId(draft.examStageId, context.availableStageIds);
  if (!stage.ok) errors.examStageId = stage.reason;

  const year = validateTargetYear(draft.targetYear, context.currentYear);
  if (!year.ok) errors.targetYear = year.reason;

  // The two below are required, unlike the four above: a student who reached the end of the
  // flow answered them, and a null here means something went wrong rather than that they
  // declined. Treated as errors rather than defaulted, because defaulting would invent a
  // preparation level nobody stated and then recommend against it.
  const level = validatePreparationLevel(draft.preparationLevel);
  if (!level.ok) errors.preparationLevel = level.reason;

  const studyTime = validateDailyStudyTime(draft.dailyStudyTime);
  if (!studyTime.ok) errors.dailyStudyTime = studyTime.reason;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    profile: {
      displayName: (name as { ok: true; value: string }).value,
      preferredLanguage: (language as { ok: true; value: UiLanguage }).value,
      contentLanguages: (contentLanguages as { ok: true; value: string[] }).value,
      primaryExamCode: (exam as { ok: true; value: string | null }).value,
      examStageId: (stage as { ok: true; value: string | null }).value,
      targetYear: (year as { ok: true; value: number | null }).value,
      preparationLevel: (level as { ok: true; value: PreparationLevel }).value,
      dailyStudyTime: (studyTime as { ok: true; value: DailyStudyTime }).value,
    },
  };
}
