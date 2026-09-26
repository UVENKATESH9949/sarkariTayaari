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
import { useActiveExam } from "../examsModule/activeExamContext";
import { startupLog } from "../telemetry/startupLog";
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
  /**
   * True while an account profile has arrived but has not yet been checked for completion. The
   * start gate keeps "Restoring your account" up for this window instead of flashing step 1.
   */
  checkingAccount: boolean;
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
  checkingAccount: false,
});

export function useOnboarding() {
  return useContext(OnboardingContext);
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<OnboardingPhase>("resolving");
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [savedName, setSavedName] = useState<string | null>(null);
  // Which profileVersion the re-check below has finished reading. Until it catches up, the gate
  // waits — found on the emulator: without this, the ~0.5 s between the account restore finishing
  // and this read resolving was enough to render onboarding step 1 to a returning student.
  const [checkedProfileVersion, setCheckedProfileVersion] = useState(0);

  const { language, setLanguage } = useI18n();
  const { user, profileVersion, pushProgress, signOutCount } = useAuth();
  const { addExam } = useActiveExam();

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
          startupLog("ONBOARDING_REQUIRED");
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

  /*
   * THE ACCOUNT CAN END ONBOARDING, NOT ONLY THIS DEVICE (V53, 2026-09-24).
   *
   * The launch-time resolution above reads only this phone's own storage, and on a reinstalled app
   * or a second phone that storage is empty — so it answers "required" even for a student who
   * onboarded months ago. The account knows better: signing in pulls the server's profile, and
   * `preparationProfileSync` writes its completion stamp locally. This re-reads that stamp whenever
   * a sync lands a profile, and whenever the phase becomes "collecting" (a pull can finish before
   * the resolution above has even set the phase).
   *
   * Only ever moves "collecting" -> "ready". A student already past onboarding is untouched, and
   * the warm-up screen is deliberately skipped: this student has an exam and a dashboard already,
   * and the ordinary first-sync gate still covers an empty local database behind them.
   */
  useEffect(() => {
    if (phase !== "collecting" || profileVersion === 0) return;
    let cancelled = false;
    (async () => {
      const stored = await loadPreparationProfile();
      if (cancelled) return;
      setCheckedProfileVersion(profileVersion);
      if (!stored.onboardingCompletedAt) return;
      startupLog("ONBOARDING_RESTORED_FROM_ACCOUNT");
      trackEvent("onboarding_restored_from_account");
      setSavedName(stored.displayName || null);
      setPhase("ready");
      // Best effort: the followed-exam sync normally brings the exam back too, but an account whose
      // follows predate that sync would otherwise land on Home with nothing active.
      if (stored.primaryExamCode) {
        addExam(stored.primaryExamCode).catch((err) =>
          console.warn("Failed to re-follow the restored exam", err),
        );
      }
    })().catch((err) => {
      console.warn("Failed to re-check onboarding after sync", err);
      captureError(err, { context: "OnboardingProvider.recheck" });
      // Never leave the gate waiting on a check that failed: fall through to onboarding instead.
      if (!cancelled) setCheckedProfileVersion(profileVersion);
    });
    return () => {
      cancelled = true;
    };
  }, [phase, profileVersion, addExam]);

  /*
   * Sign-out starts the next person's onboarding state (2026-09-25). authContext has already
   * cleared the stored answers (resetProfileForSignOut); this re-reads them so the in-memory draft,
   * greeting and phase match. The next sign-in then either restores that account's finished
   * profile (the re-check above) or shows onboarding to a genuinely new account. Without this the
   * phase stayed "ready" and a brand-new account signing in on this phone skipped onboarding.
   */
  useEffect(() => {
    if (signOutCount === 0) return;
    let cancelled = false;
    (async () => {
      const stored = await loadPreparationProfile();
      if (cancelled) return;
      setSavedName(null);
      setDraft({ ...EMPTY_DRAFT, preferredLanguage: stored.preferredLanguage, contentLanguages: stored.contentLanguages });
      setCheckedProfileVersion(profileVersion);
      setPhase("collecting");
      startupLog("ONBOARDING_REQUIRED", { reason: "signed_out" });
    })().catch((err) => captureError(err, { context: "OnboardingProvider.signOutReset" }));
    return () => {
      cancelled = true;
    };
    // profileVersion is read, not reacted to: this runs once per sign-out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signOutCount]);

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
        startupLog("ONBOARDING_COMPLETED");
        // Straight to the account, not at the next background: the server's completion stamp is
        // what lets a reinstall skip onboarding, and it should not depend on the app being
        // backgrounded first. Not awaited — the warm-up must not wait on the network.
        pushProgress().catch((err) => console.warn("Failed to push the finished profile", err));
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
    [draft, pushProgress],
  );

  const finish = useCallback(() => setPhase("ready"), []);

  const displayName = savedName ?? (user?.displayName?.trim() || null);

  const checkingAccount = phase === "collecting" && profileVersion !== checkedProfileVersion;

  const value = useMemo<OnboardingContextValue>(
    () => ({ phase, displayName, draft, updateDraft, submit, finish, checkingAccount }),
    [phase, displayName, draft, updateDraft, submit, finish, checkingAccount],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}
