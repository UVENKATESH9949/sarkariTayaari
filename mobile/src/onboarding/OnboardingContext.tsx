import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  validateProfileDraft,
  type DraftValidationResult,
  type ProfileDraft,
} from "@sarkaritaiyaari/core/onboarding";
import {
  loadPreparationProfile,
  markOnboardingCompleted,
  resolveAndStampOnboardingStatus,
  savePreparationProfile,
} from "../db/onboarding";
import { savePreferences } from "../db/preferences";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../practice/authContext";
import { captureError, trackEvent } from "../telemetry/analytics";

/**
 * Owns first-time onboarding: whether it is owed, what has been answered so far, and the
 * moment it is finished with.
 *
 * ## The two decisions this file is built around
 *
 * **1. Onboarding runs *while* the first sync does, not before it.**
 *
 * The brief's flow is "onboard, then prepare data". Taken literally that is impossible here,
 * because the exam catalogue a student is asked to choose from *is* the data being prepared —
 * a fresh install has no exams until the reference sync lands. Blocking onboarding on the sync
 * would mean two loading screens around a three-question form.
 *
 * So the flow opens immediately and the sync runs behind it. The name and language steps need
 * no data at all and take a few seconds, by which time the catalogue has almost always arrived;
 * the exam step reads whatever is there, falls back to a live fetch, and — genuinely offline —
 * says so and lets the student continue without choosing. That last path is why
 * `primaryExamCode` is nullable.
 *
 * **2. Answers are persisted as they are given, not at the end.**
 *
 * `updateDraft` writes through to SQLite on every change. A student who takes a phone call on
 * step 4 and comes back to a killed app resumes with everything they had entered, which is
 * what §12 asks for. It also means the flow holds no state that only exists in memory.
 *
 * Completion is stamped in {@link submit}, before the preparation screen runs, deliberately:
 * by then every question has been answered and saved, so an app killed during the warm-up must
 * not ask them all again.
 */

export type OnboardingPhase =
  /** Reading the database to find out whether onboarding is owed. Milliseconds, once. */
  | "resolving"
  /** The flow is on screen. */
  | "collecting"
  /** Answers are saved; the personalised warm-up is running. */
  | "preparing"
  /** Nothing to do — show the app. Every returning launch starts and stays here. */
  | "ready";

export type OnboardingContextValue = {
  phase: OnboardingPhase;
  /**
   * The name to greet this person by, or null when there is none — a student who was adopted
   * as an existing install, or who has not reached the first step yet.
   */
  displayName: string | null;
  draft: ProfileDraft;
  /** Records one answer, in memory and in SQLite. */
  updateDraft: (patch: Partial<ProfileDraft>) => void;
  /**
   * Validates everything, persists it, applies the chosen language, and stamps onboarding
   * complete. Returns the validation result so the caller can surface a field error rather
   * than failing silently — though in normal use each step has already validated its own field.
   */
  submit: (context: {
    availableContentLanguages: readonly string[];
    availableExamCodes: readonly string[];
    availableStageIds: readonly string[];
  }) => Promise<DraftValidationResult>;
  /** Called by the preparation screen once its real work is done. */
  finish: () => void;
};

const EMPTY_DRAFT: ProfileDraft = {
  displayName: "",
  preferredLanguage: "en",
  contentLanguages: [],
  primaryExamCode: null,
  examStageId: null,
  targetYear: null,
  preparationLevel: null,
  dailyStudyTime: null,
};

const OnboardingContext = createContext<OnboardingContextValue>({
  phase: "ready",
  displayName: null,
  draft: EMPTY_DRAFT,
  updateDraft: () => {},
  submit: async () => ({ ok: false, errors: {} }),
  finish: () => {},
});

export function useOnboarding() {
  return useContext(OnboardingContext);
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<OnboardingPhase>("resolving");
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [savedName, setSavedName] = useState<string | null>(null);

  const { language, setLanguage } = useI18n();
  const { user } = useAuth();

  // Resolution runs exactly once per app launch. Not keyed on anything, and deliberately not
  // re-run: the signals it reads (has this device synced? does it follow an exam?) all turn
  // true while the flow is on screen, so a second evaluation would reach a different answer.
  const resolved = useRef(false);

  useEffect(() => {
    if (resolved.current) return;
    resolved.current = true;

    (async () => {
      try {
        const [status, stored] = await Promise.all([
          resolveAndStampOnboardingStatus(),
          loadPreparationProfile(),
        ]);

        setSavedName(stored.displayName || null);

        if (status === "REQUIRED") {
          // Resume whatever was already answered. On a true first launch this is all empty;
          // after an interrupted flow it is however far they got.
          setDraft({
            displayName: stored.displayName,
            preferredLanguage: stored.preferredLanguage,
            contentLanguages: stored.contentLanguages,
            primaryExamCode: stored.primaryExamCode,
            examStageId: stored.examStageId,
            targetYear: stored.targetYear,
            preparationLevel: stored.preparationLevel,
            dailyStudyTime: stored.dailyStudyTime,
          });
          trackEvent("onboarding_started", { resumed: stored.displayName ? "true" : "false" });
          setPhase("collecting");
          return;
        }

        if (status === "ADOPT_EXISTING_INSTALL") {
          // Silent by design. This install was in use before onboarding existed; the one thing
          // it must never do is interrogate someone who already has practice history.
          trackEvent("onboarding_adopted_existing_install");
        }
        setPhase("ready");
      } catch (err) {
        // The app must open. A failure here is treated as "nothing to onboard" rather than
        // blocking startup behind a question nobody can answer.
        console.warn("Failed to resolve onboarding status", err);
        captureError(err, { context: "OnboardingProvider.resolve" });
        setPhase("ready");
      }
    })();
  }, []);

  const updateDraft = useCallback(
    (patch: Partial<ProfileDraft>) => {
      // The state updater stays pure — the persistence below sits outside it, so React calling
      // it twice (as it may) cannot produce two writes.
      setDraft((current) => ({ ...current, ...patch }));

      // Write-through, fire-and-forget, and only the fields that changed: the in-memory answer
      // is what the screen renders, and a failed write costs a resumed answer rather than a
      // broken flow. `preferredLanguage` is excluded because it is not stored here — it belongs
      // to the one `ui_language` column, written by setLanguage below.
      const { preferredLanguage, ...persistable } = patch;
      if (Object.keys(persistable).length > 0) {
        savePreparationProfile(persistable).catch((err) =>
          console.warn("Failed to save onboarding answer", err),
        );
      }

      // The language applies the instant it is chosen — the rest of the flow is then in it,
      // which is the only honest way to let someone confirm they picked the right one.
      if (preferredLanguage && preferredLanguage !== language) {
        setLanguage(preferredLanguage);
      }
    },
    [language, setLanguage],
  );

  const submit = useCallback<OnboardingContextValue["submit"]>(
    async (context) => {
      const result = validateProfileDraft(draft, {
        availableContentLanguages: context.availableContentLanguages,
        availableExamCodes: context.availableExamCodes,
        availableStageIds: context.availableStageIds,
        currentYear: new Date().getFullYear(),
      });
      if (!result.ok) return result;

      const { profile } = result;
      try {
        await savePreparationProfile({
          displayName: profile.displayName,
          // Its own table, and written before the completion stamp — see savePreparationProfile.
          contentLanguages: profile.contentLanguages,
          primaryExamCode: profile.primaryExamCode,
          examStageId: profile.examStageId,
          targetYear: profile.targetYear,
          preparationLevel: profile.preparationLevel,
          dailyStudyTime: profile.dailyStudyTime,
        });
        // One column for the app's language, written where Settings already writes it.
        await savePreferences({ uiLanguage: profile.preferredLanguage });
        await markOnboardingCompleted();
        setSavedName(profile.displayName);
        trackEvent("onboarding_completed", {
          exam: profile.primaryExamCode ?? "none",
          level: profile.preparationLevel,
          studyTime: profile.dailyStudyTime,
          appLanguage: profile.preferredLanguage,
          // Recorded separately from the interface language, because whether students actually
          // use the two independently is the thing worth measuring about this feature.
          contentLanguages: profile.contentLanguages.join(","),
        });
      } catch (err) {
        // The answers are still in memory and every step already wrote through, so the worst
        // case is that onboarding is asked for again — never that the app is stuck here.
        console.warn("Failed to persist onboarding profile", err);
        captureError(err, { context: "OnboardingProvider.submit" });
      }

      setPhase("preparing");
      return result;
    },
    [draft],
  );

  const finish = useCallback(() => setPhase("ready"), []);

  const displayName = savedName ?? (user?.displayName?.trim() || null);

  const value = useMemo<OnboardingContextValue>(
    () => ({ phase, displayName, draft, updateDraft, submit, finish }),
    [phase, displayName, draft, updateDraft, submit, finish],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}
