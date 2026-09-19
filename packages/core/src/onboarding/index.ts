export {
  PREPARATION_LEVELS,
  DAILY_STUDY_TIMES,
  EMPTY_PREPARATION_PROFILE,
  MIN_CONTENT_LANGUAGES,
  MAX_CONTENT_LANGUAGES,
  isPreparationLevel,
  isDailyStudyTime,
  isOnboardingComplete,
} from "./profile";
export type { PreparationLevel, DailyStudyTime, PreparationProfile } from "./profile";

export {
  DISPLAY_NAME_MAX_LENGTH,
  TARGET_YEAR_HORIZON,
  normaliseDisplayName,
  validateDisplayName,
  supportedUiLanguages,
  validateLanguage,
  validateContentLanguages,
  toggleContentLanguage,
  validateExamCode,
  validateExamStageId,
  targetYearOptions,
  validateTargetYear,
  validatePreparationLevel,
  validateDailyStudyTime,
  validateProfileDraft,
} from "./validation";
export type {
  FieldValidationFailure,
  FieldValidation,
  ProfileDraft,
  DraftValidationContext,
  DraftValidationResult,
} from "./validation";

export { resolveOnboardingStatus, greetingPeriod } from "./status";
export type { OnboardingStatus, OnboardingSignals } from "./status";
