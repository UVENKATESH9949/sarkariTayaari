import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { clearSession, loadSession, saveSession } from "../db/authSession";
import { resetProfileForSignOut } from "../db/onboarding";
import { clearSnapshots } from "../data/snapshotStore";
import {
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  requestEmailOtp,
  signInWithGoogleIdToken,
  verifyEmailOtp,
  type AuthUser,
} from "@sarkaritaiyaari/core/api";
import { syncProgress, uploadPendingProgress } from "../sync/progressSync";
import { syncBookmarks, uploadPendingBookmarks } from "../sync/bookmarkSync";
import { syncFollowedExams, uploadPendingFollowedExams } from "../sync/followedExamSync";
import { syncPreparationProfile } from "../sync/preparationProfileSync";
import {
  restoreTopicProgressForDevice,
  uploadPendingTopicProgress,
} from "../sync/topicProgressSync";
import { captureError, trackEvent } from "../telemetry/analytics";
import { startupLog } from "../telemetry/startupLog";
import { signOutOfGoogle } from "../auth/googleSignIn";
import { registerForPushNotifications } from "../notifications/pushRegistration";
import { clearCachedRadars } from "../db/radarCache";

/** Longest the start gate waits for a sign-in's account restore before showing onboarding anyway. */
const RESTORE_WAIT_MS = 10_000;

type AuthContextValue = {
  user: AuthUser | null;
  /** True until the stored session has been read — avoids flashing a signed-out UI. */
  loading: boolean;
  syncing: boolean;
  lastError: string | null;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Asks the server to email a one-time code. Resolves with how the server handled it.
   *
   * A success says NOTHING about whether the address has an account — the endpoint answers
   * identically either way on purpose, so a caller must not phrase it as "welcome back".
   */
  requestSignInCode: (email: string) => Promise<{ expiresInMinutes: number; emailed: boolean }>;
  /** Redeems a code and signs in, creating the account if this is the first time. */
  signInWithCode: (email: string, code: string) => Promise<void>;
  /** Signs in with a Google ID token; the same Gmail is the same account as a code sign-in. */
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Push anything pending; safe to call when signed out (does nothing). */
  pushProgress: () => Promise<void>;
  /**
   * Bumped whenever a restore writes history into SQLite. Providers that read that
   * history put it in their effect deps so they re-query — without it, signing in on a
   * new phone restores the data but the screens keep showing empty, which looks exactly
   * like the restore failing.
   */
  progressVersion: number;
  /**
   * True from the moment a sign-in succeeds until its first full sync has finished (or given up).
   * The start gate waits on this before deciding onboarding is owed, so a returning student on a
   * reinstalled app is not shown step 1 for the second it takes their account to come back.
   */
  restoringAccount: boolean;
  /**
   * Bumped whenever a sync writes the account's preparation profile into SQLite. The onboarding
   * provider re-reads completion on it — that is how a reinstall learns onboarding was done.
   */
  profileVersion: number;
  /** Bumped on every sign-out, so the onboarding provider can reset to the next person's state. */
  signOutCount: number;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  syncing: false,
  lastError: null,
  signUp: async () => {},
  signIn: async () => {},
  requestSignInCode: async () => ({ expiresInMinutes: 0, emailed: false }),
  signInWithCode: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  pushProgress: async () => {},
  progressVersion: 0,
  restoringAccount: false,
  profileVersion: 0,
  signOutCount: 0,
});

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Accounts are entirely optional. The app works signed out exactly as before — this only
 * adds the ability to back progress up and get it back on a new device. Nothing here
 * blocks the UI or forces a sign-up wall.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [progressVersion, setProgressVersion] = useState(0);
  const [restoringAccount, setRestoringAccount] = useState(false);
  const [profileVersion, setProfileVersion] = useState(0);
  const [signOutCount, setSignOutCount] = useState(0);

  // A ref, not state: the launch and foreground triggers can fire in the same tick.
  const inFlight = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await loadSession();
        if (stored) {
          setToken(stored.token);
          setUser(stored.user);
        }
        startupLog("AUTH_RESTORED", { signedIn: stored !== null && stored !== undefined });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const runSync = useCallback(async (activeToken: string, full: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSyncing(true);
    setLastError(null);
    try {
      if (full) {
        const [progressResult, bookmarkResult, followedExamResult, restoredTopics, profileResult] = await Promise.all([
          syncProgress(activeToken),
          syncBookmarks(activeToken),
          // New endpoint (Exams module Phase 2/3) — same 404-tolerant reasoning as the
          // topic-progress block below: a device pointed at a not-yet-redeployed backend
          // must not have its progress/bookmark restore aborted by this one failing.
          syncFollowedExams(activeToken).catch((err) => {
            captureError(err, { context: "authContext.followedExamSync", full: true });
            return { uploaded: 0, restored: 0 };
          }),
          /*
           * Epic L / TICKET-2105. Push-then-pull in one step, same as the other two: this is the
           * moment a new phone gets its per-topic mastery back, and without it a student who signs
           * in on a new device sees every topic reset to NOT_STARTED — which would also silently
           * re-lock every prerequisite they had already cleared.
           *
           * Failures are swallowed to 0 rather than propagated, and that is load-bearing rather
           * than defensive habit: this sits in a Promise.all with progress and bookmarks, so an
           * unhandled rejection here would abort the *whole* full sync and skip restoring a
           * student's practice history and bookmarks. A backend that predates TICKET-2105 returns
           * 404 for this endpoint, which is exactly the situation on a device pointed at a
           * not-yet-redeployed server — mastery is additive, history is not.
           */
          (async () => {
            try {
              await uploadPendingTopicProgress(activeToken);
              return await restoreTopicProgressForDevice(activeToken);
            } catch (err) {
              captureError(err, { context: "authContext.topicProgressSync", full: true });
              return 0;
            }
          })(),
          /*
           * The preparation profile (TASK-3301/3401). Caught for exactly the same reason as the
           * two above: a backend predating V48 has no such endpoint, and a 404 here must not abort
           * the batch and cost a student their restored history.
           *
           * It genuinely matters that this runs at all — the daily planner reads this row on the
           * server, so without it every account is budgeted the declared 60-minute default however
           * long the student actually said they study.
           */
          syncPreparationProfile(activeToken).catch((err) => {
            captureError(err, { context: "authContext.preparationProfileSync", full: true });
            return "noop" as const;
          }),
        ]);
        if (profileResult === "pulled") setProfileVersion((v) => v + 1);
        // Only nudge the UI when something actually landed locally.
        if (
          progressResult.restoredSessions > 0 ||
          progressResult.restoredAttempts > 0 ||
          bookmarkResult.restored > 0 ||
          followedExamResult.restored > 0 ||
          restoredTopics > 0
        ) {
          setProgressVersion((v) => v + 1);
        }
      } else {
        await Promise.all([
          uploadPendingProgress(activeToken),
          uploadPendingBookmarks(activeToken),
          uploadPendingFollowedExams(activeToken).catch((err) => {
            captureError(err, { context: "authContext.followedExamSync", full: false });
            return 0;
          }),
          // Epic L / TICKET-2105. Joins the same batch rather than getting its own pass: all
          // three are "push whatever changed locally", and running them together means one
          // round of latency instead of three. Caught for the same reason as the full-sync
          // branch above — an older backend 404s here, and that must not mark the other two
          // uploads as failed.
          uploadPendingTopicProgress(activeToken).catch((err) => {
            captureError(err, { context: "authContext.topicProgressSync", full: false });
            return 0;
          }),
          // Same batch, same reasoning. A profile edited in Settings while offline goes up on the
          // next push rather than waiting for a full sync.
          syncPreparationProfile(activeToken)
            .then((result) => {
              if (result === "pulled") setProfileVersion((v) => v + 1);
              return result;
            })
            .catch((err) => {
              captureError(err, { context: "authContext.preparationProfileSync", full: false });
              return "noop" as const;
            }),
        ]);
      }
    } catch (err) {
      // Never surfaced as a blocking error: the history is safe locally either way,
      // and it will go up on the next attempt.
      captureError(err, { context: "authContext.runSync", full });
      setLastError((err as Error).message);
    } finally {
      inFlight.current = false;
      setSyncing(false);
    }
  }, []);

  // Once signed in, push whatever accumulated before or while signed out.
  useEffect(() => {
    if (!token) return;
    runSync(token, false).catch(() => {});
  }, [token, runSync]);

  /**
   * Flush on the way to the background. This is what actually keeps the unsynced window
   * down to seconds — a warning dialog on uninstall would never fire for the case that
   * matters, which is a phone that is lost or broken.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if ((state === "background" || state === "inactive") && token) {
        runSync(token, false).catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [token, runSync]);

  const adopt = useCallback(async (result: Awaited<ReturnType<typeof apiLogin>>, source: "sign_up" | "sign_in") => {
    await saveSession(result);
    // Raised BEFORE the user is set, in the same batch, so the start gate never sees a signed-in
    // user with the restore not yet announced — that one render is exactly when it would decide
    // onboarding is owed.
    setRestoringAccount(true);
    setToken(result.token);
    setUser(result.user);
    trackEvent(source);
    startupLog("SIGNED_IN");
    // Not awaited: a denied permission or a slow registration must not delay sign-in for
    // a feature (reminders) nobody has asked for yet. Errors are swallowed internally.
    registerForPushNotifications(result.token);
    // Full sync on sign-in: upload what this device has, then pull down anything it
    // is missing. This is the moment a new phone gets its history back — and, since V53, the
    // moment a reinstalled app learns onboarding was already done.
    startupLog("ACCOUNT_RESTORE_STARTED");
    /*
     * The flag, not the sync, has a ceiling. The shared API client has no request timeout, so a
     * network that never answers must not hold the start gate on "restoring" forever. After
     * RESTORE_WAIT_MS the gate falls through to onboarding; if the account's profile lands later,
     * `profileVersion` still ends onboarding the moment it does.
     */
    let announced = false;
    const endRestore = (reason: string) => {
      if (announced) return;
      announced = true;
      setRestoringAccount(false);
      startupLog("ACCOUNT_RESTORE_FINISHED", { reason });
    };
    const ceiling = setTimeout(() => endRestore("ceiling"), RESTORE_WAIT_MS);
    try {
      await runSync(result.token, true);
    } finally {
      clearTimeout(ceiling);
      endRestore("synced");
    }
  }, [runSync]);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    adoptOrThrow(await apiRegister(email, password, displayName), (result) => adopt(result, "sign_up"));
  }, [adopt]);

  const signIn = useCallback(async (email: string, password: string) => {
    adoptOrThrow(await apiLogin(email, password), (result) => adopt(result, "sign_in"));
  }, [adopt]);

  /*
   * Passwordless sign-in (V51). Deliberately goes through the same `adopt` as password sign-in,
   * so a session created by a code is identical in every way to one created by a password —
   * same storage, same push registration, same full sync that restores history onto a new phone.
   * A second path that did any of that differently would drift.
   */
  const requestSignInCode = useCallback(async (email: string) => {
    const result = await requestEmailOtp(email.trim());
    return { expiresInMinutes: result.expiresInMinutes, emailed: result.emailed };
  }, []);

  const signInWithCode = useCallback(async (email: string, code: string) => {
    adoptOrThrow(await verifyEmailOtp(email.trim(), code.trim()), (result) => adopt(result, "sign_in"));
  }, [adopt]);

  /*
   * "Continue with Google" (2026-09-25). Through the same `adopt` as every other sign-in, for the
   * same reason as the code path above: one session shape, one restore, one push registration.
   */
  const signInWithGoogle = useCallback(async (idToken: string) => {
    adoptOrThrow(await signInWithGoogleIdToken(idToken), (result) => adopt(result, "sign_in"));
  }, [adopt]);

  const signOut = useCallback(async () => {
    const current = token;
    trackEvent("sign_out");
    // Last chance to save anything pending before the token goes away.
    if (current) {
      try {
        await Promise.all([
          uploadPendingProgress(current),
          uploadPendingBookmarks(current),
          uploadPendingFollowedExams(current).catch((err) => {
            captureError(err, { context: "authContext.followedExamSync", full: false });
            return 0;
          }),
          uploadPendingTopicProgress(current).catch((err) => {
            captureError(err, { context: "authContext.topicProgressSync", full: false });
            return 0;
          }),
          // Last chance before the token goes away: a study-time change made this session must not
          // be stranded on the device, or the planner keeps budgeting the old figure.
          syncPreparationProfile(current).catch((err) => {
            captureError(err, { context: "authContext.preparationProfileSync", full: false });
            return "noop" as const;
          }),
        ]);
      } catch {
        // Best effort — signing out must not be blocked by a bad connection.
      }
      try {
        await apiLogout(current);
      } catch {
        // The local session goes regardless; a stale server token expires on its own.
      }
    }
    await clearSession();
    // So the next "Continue with Google" shows the account chooser rather than reusing this one.
    await signOutOfGoogle();
    /*
     * The onboarding answers belong to the person signing out, not to the phone. The profile was
     * pushed to their account just above, so forgetting it here loses nothing — and not forgetting
     * it let the next account inherit it and upload it over their own (found on the emulator).
     */
    await resetProfileForSignOut().catch((err) =>
      captureError(err, { context: "authContext.resetProfileForSignOut", full: false }),
    );
    /*
     * Only the personal namespace. Daily-plan snapshots are keyed by user id already, so a
     * leftover row is unreadable by the next account — this is the second line of defence, not
     * the only one, and it is kept because a stale server-computed plan surfacing under someone
     * else's name would look like a data leak whether or not it technically was one.
     *
     * `exams-discover` is deliberately NOT cleared: it is a public catalogue taking no token and
     * containing nothing about anybody, so wiping it would only make the next sign-in slower.
     */
    await clearSnapshots("daily-plan");
    /*
     * The cached Weakness Radar is this student's own diagnosis, not device state -- leaving
     * it behind would show the next person to pick up the phone someone else's weaknesses.
     * Deliberately unlike `app_preferences` (theme/zoom/language), which is a device setting
     * and is never cleared on sign-out.
     *
     * Best effort, and after clearSession() rather than before: a failed local delete must
     * not leave the student still signed in.
     */
    await clearCachedRadars().catch((err) =>
      captureError(err, { context: "authContext.clearCachedRadars", full: false }),
    );
    setToken(null);
    setUser(null);
    setSignOutCount((n) => n + 1);
  }, [token]);

  const pushProgress = useCallback(async () => {
    if (!token) return;
    await runSync(token, false);
  }, [token, runSync]);

  return (
    <AuthContext.Provider
      value={{
        user, loading, syncing, lastError,
        signUp, signIn, requestSignInCode, signInWithCode, signInWithGoogle, signOut,
        pushProgress, progressVersion, restoringAccount, profileVersion, signOutCount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Kept separate so the async adopt() is awaited rather than floating. */
async function adoptOrThrow(
  result: Awaited<ReturnType<typeof apiLogin>>,
  adopt: (r: Awaited<ReturnType<typeof apiLogin>>) => Promise<void>,
) {
  await adopt(result);
}
