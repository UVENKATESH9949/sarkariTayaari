import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { clearSession, loadSession, saveSession } from "../db/authSession";
import { login as apiLogin, logout as apiLogout, register as apiRegister, type AuthUser } from "../api/auth";
import { syncProgress, uploadPendingProgress } from "../sync/progressSync";
import { syncBookmarks, uploadPendingBookmarks } from "../sync/bookmarkSync";
import {
  restoreTopicProgressForDevice,
  uploadPendingTopicProgress,
} from "../sync/topicProgressSync";
import { captureError, trackEvent } from "../telemetry/analytics";

type AuthContextValue = {
  user: AuthUser | null;
  /** True until the stored session has been read — avoids flashing a signed-out UI. */
  loading: boolean;
  syncing: boolean;
  lastError: string | null;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
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
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  syncing: false,
  lastError: null,
  signUp: async () => {},
  signIn: async () => {},
  signOut: async () => {},
  pushProgress: async () => {},
  progressVersion: 0,
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
        const [progressResult, bookmarkResult, restoredTopics] = await Promise.all([
          syncProgress(activeToken),
          syncBookmarks(activeToken),
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
        ]);
        // Only nudge the UI when something actually landed locally.
        if (
          progressResult.restoredSessions > 0 ||
          progressResult.restoredAttempts > 0 ||
          bookmarkResult.restored > 0 ||
          restoredTopics > 0
        ) {
          setProgressVersion((v) => v + 1);
        }
      } else {
        await Promise.all([
          uploadPendingProgress(activeToken),
          uploadPendingBookmarks(activeToken),
          // Epic L / TICKET-2105. Joins the same batch rather than getting its own pass: all
          // three are "push whatever changed locally", and running them together means one
          // round of latency instead of three. Caught for the same reason as the full-sync
          // branch above — an older backend 404s here, and that must not mark the other two
          // uploads as failed.
          uploadPendingTopicProgress(activeToken).catch((err) => {
            captureError(err, { context: "authContext.topicProgressSync", full: false });
            return 0;
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
    setToken(result.token);
    setUser(result.user);
    trackEvent(source);
    // Full sync on sign-in: upload what this device has, then pull down anything it
    // is missing. This is the moment a new phone gets its history back.
    await runSync(result.token, true);
  }, [runSync]);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    adoptOrThrow(await apiRegister(email, password, displayName), (result) => adopt(result, "sign_up"));
  }, [adopt]);

  const signIn = useCallback(async (email: string, password: string) => {
    adoptOrThrow(await apiLogin(email, password), (result) => adopt(result, "sign_in"));
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
          uploadPendingTopicProgress(current).catch((err) => {
            captureError(err, { context: "authContext.topicProgressSync", full: false });
            return 0;
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
    setToken(null);
    setUser(null);
  }, [token]);

  const pushProgress = useCallback(async () => {
    if (!token) return;
    await runSync(token, false);
  }, [token, runSync]);

  return (
    <AuthContext.Provider
      value={{ user, loading, syncing, lastError, signUp, signIn, signOut, pushProgress, progressVersion }}
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
