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
  followExam as followExamRow,
  getFollowedExams,
  unfollowExam as unfollowExamRow,
  type FollowedExam,
} from "../db/followedExams";
import { loadPreferences, savePreferences } from "../db/preferences";
import { getExamGuideHybrid } from "../data/examGuideData";
import { useHybridMode } from "../data/hybridSource";
import { getPriorityTopics } from "../db/topicIntelligence";
import { useAuth } from "../practice/authContext";
import { useSyncStatus } from "../sync/SyncContext";
import { captureError, trackEvent } from "../telemetry/analytics";

/**
 * The one source of truth for **My Exams** (all followed exams) and the **Active Exam**
 * (the single one driving Home and every exam-scoped screen).
 *
 * ## Why this exists — the two real bugs it fixes
 *
 * 1. **Home never heard about a change.** `(tabs)/index.tsx` read `getFollowedExam()` in an
 *    effect keyed on `syncVersion`, which only a sync bumps. Following or unfollowing from
 *    My Exams, the Exams tab or an Exam Guide wrote to SQLite and told nobody, so Home kept
 *    rendering whatever it had read on mount until a sync happened or the app was killed.
 *    Persistent storage and in-memory state had no channel between them; this provider is
 *    that channel.
 *
 * 2. **"The" followed exam was whichever row SQLite happened to return.** `getFollowedExam()`
 *    ran a `.get()` with **no `ORDER BY`**, so with more than one followed exam the answer was
 *    arbitrary — in practice the first-followed row, which is exactly why the app looked stuck
 *    on the *old* exam. Restarting did not fix that; it re-ran the same unordered query. There
 *    was no stored notion of "active" at all, so there was nothing a restart could have read.
 *
 * ## The model
 *
 *   My Exams     -> `followed_exams` rows (synced, many)
 *   Active Exam  -> `app_preferences.active_exam_code` (device-local, one)
 *
 * Kept device-local on purpose. The backend's followed-exam contract has no active-exam
 * concept, and an offline-first app must not need a round trip to change which exam its Home
 * screen shows. The trade-off, stated rather than hidden: switching exams on one device does
 * not move the active exam on another. Both devices still agree on *My Exams*, because that is
 * the part the server actually stores. Making it account-wide later is an additive column plus
 * an API change, and nothing here would have to move.
 *
 * ## Resolution
 *
 * The stored code is never trusted on its own — it may name an exam that has since been
 * unfollowed, or one whose row has not synced to this device yet. {@link resolveActive} picks
 * the stored exam when it is genuinely in My Exams, otherwise the most recently followed one,
 * otherwise null; when that differs from what was stored it writes the resolution back, so the
 * fallback is sticky instead of being re-derived (and possibly re-deciding) on every read.
 */

export type ActiveExamContextValue = {
  /** Every followed exam, most recently followed first. */
  myExams: FollowedExam[];
  /** The one exam driving exam-scoped screens. Null only when nothing is followed. */
  activeExam: FollowedExam | null;
  /** True until the first resolution completes; screens show their existing skeletons. */
  loading: boolean;
  /** The exam being switched to, while the blocking overlay is up. Null otherwise. */
  switchingTo: FollowedExam | null;
  /**
   * Bumped on every change to the active exam. For a consumer that caches exam-scoped data
   * and needs an explicit refetch key rather than reacting to `activeExam` itself.
   */
  activeExamVersion: number;
  /**
   * THE exam-switching operation. Every switching affordance in the app calls this one —
   * Home's picker, My Exams, and any future entry point.
   *
   * `silent` suppresses the blocking overlay, for the one case where there is no dashboard to
   * swap out and something else is already showing progress: first-time onboarding, which sets
   * the exam it just asked for behind its own preparation screen. Same reasoning `addExam`
   * already applies to the first exam a user follows. Every other caller omits it.
   */
  setActiveExam: (examCode: string, options?: { silent?: boolean }) => Promise<void>;
  /** Follow an exam. Becomes active immediately if nothing was active. */
  addExam: (examCode: string) => Promise<void>;
  /** Unfollow. If it was the active exam, the next one is promoted deterministically. */
  removeExam: (examCode: string) => Promise<void>;
  /** Re-read both from the database. For pull-to-refresh. */
  refresh: () => Promise<void>;
};

const ActiveExamContext = createContext<ActiveExamContextValue>({
  myExams: [],
  activeExam: null,
  loading: true,
  switchingTo: null,
  activeExamVersion: 0,
  setActiveExam: async () => {},
  addExam: async () => {},
  removeExam: async () => {},
  refresh: async () => {},
});

export function useActiveExam() {
  return useContext(ActiveExamContext);
}

/**
 * A floor on how long the switching overlay stays up, purely so a switch that resolves in
 * 30ms does not flash the overlay for one frame.
 *
 * This is NOT a delay on the work. The switch begins immediately and the overlay comes down
 * the moment both the real work and this floor are done — so a 2-second switch takes 2
 * seconds and a 6-second switch takes 6. Nothing sleeps for a fixed several seconds.
 */
const MIN_OVERLAY_MS = 350;

/** Deterministic promotion rule, used whenever the active exam has to be chosen rather than read: the most recently followed exam. */
function defaultActive(myExams: FollowedExam[]): FollowedExam | null {
  return myExams[0] ?? null;
}

function resolveActive(myExams: FollowedExam[], storedCode: string | null): FollowedExam | null {
  const stored = storedCode ? myExams.find((e) => e.code === storedCode) : undefined;
  return stored ?? defaultActive(myExams);
}

function log(message: string, detail?: unknown) {
  if (__DEV__) console.log(`[ExamSwitch] ${message}`, detail ?? "");
}

export function ActiveExamProvider({ children }: { children: ReactNode }) {
  const [myExams, setMyExams] = useState<FollowedExam[]>([]);
  const [activeExam, setActiveExamState] = useState<FollowedExam | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingTo, setSwitchingTo] = useState<FollowedExam | null>(null);
  const [activeExamVersion, setActiveExamVersion] = useState(0);

  // A sync can auto-follow an exam (SyncContext's ensureExamFollowed) and signing in can
  // restore follows made on another device, and neither goes through this provider's own
  // mutators — so both have to be treated as external writes and re-read.
  const { syncVersion } = useSyncStatus();
  const { progressVersion } = useAuth();
  const mode = useHybridMode();

  // The overlay must never be able to outlive the operation that raised it, including when
  // the user leaves the screen mid-switch.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Re-reads My Exams and re-resolves the active exam, writing the resolution back when the
   * stored code no longer holds. Returns what it resolved so callers can act on it without
   * waiting for a render.
   */
  const reload = useCallback(async (): Promise<{ myExams: FollowedExam[]; active: FollowedExam | null }> => {
    const [exams, prefs] = await Promise.all([getFollowedExams(), loadPreferences()]);
    const active = resolveActive(exams, prefs.activeExamCode);

    if ((active?.code ?? null) !== prefs.activeExamCode) {
      // Includes the case where nothing is followed any more: null is written back, so a
      // stale code cannot resurrect itself if that exam is ever followed again.
      await savePreferences({ activeExamCode: active?.code ?? null });
      log("resolved active exam differed from stored — rewritten", {
        stored: prefs.activeExamCode,
        resolved: active?.code ?? null,
      });
    }

    if (mountedRef.current) {
      setMyExams(exams);
      setActiveExamState(active);
    }
    return { myExams: exams, active };
  }, []);

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch((err) => {
        // Never blocks the app: a failure here leaves "no exam followed", which every
        // exam-scoped screen already renders correctly as its own empty state.
        console.warn("Failed to resolve active exam", err);
        captureError(err, { context: "activeExamContext.reload" });
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, syncVersion, progressVersion]);

  /**
   * Warms the data the new exam's Home depends on, so the overlay covers real work instead of
   * a timer. Best-effort by design: every one of these is an enhancement whose own screen
   * already handles absence (Case 6 — switching offline to an exam with no cached guide must
   * still switch, not hang on a spinner).
   */
  const prefetchFor = useCallback(
    async (examCode: string) => {
      await Promise.allSettled([getExamGuideHybrid(examCode, mode), getPriorityTopics(examCode, 4)]);
    },
    [mode],
  );

  const setActiveExam = useCallback(
    async (examCode: string, options?: { silent?: boolean }) => {
      if (examCode === activeExam?.code) {
        log("already active, nothing to do", examCode);
        return;
      }
      // Reads through rather than trusting `myExams` state, so a switch requested moments
      // after a follow (before this provider re-rendered) still finds its target.
      const exams = myExams.some((e) => e.code === examCode) ? myExams : await getFollowedExams();
      const target = exams.find((e) => e.code === examCode);
      if (!target) {
        log("refused: not a followed exam", examCode);
        return;
      }

      log("previous active exam", activeExam?.code ?? "(none)");
      log("new active exam", target.code);
      const startedAt = Date.now();
      if (!options?.silent) setSwitchingTo(target);
      try {
        await savePreferences({ activeExamCode: target.code });
        log("local DB updated");

        // In-memory state next, and before the prefetch: Home re-renders behind the overlay
        // and starts its own exam-scoped loads immediately, so the two run together rather
        // than one after the other.
        if (mountedRef.current) {
          setMyExams(exams);
          setActiveExamState(target);
          setActiveExamVersion((v) => v + 1);
        }
        log("application state updated");

        await prefetchFor(target.code);
        log("dependent data refreshed");
        trackEvent("active_exam_changed", { examCode: target.code });
      } catch (err) {
        // The switch itself has already happened in both the database and state by the time
        // anything here can throw; surfacing an error would be misleading.
        console.warn("Exam switch completed with a degraded prefetch", err);
      } finally {
        // The anti-flash floor exists only to stop the overlay blinking, so with no overlay
        // there is nothing to wait for — a silent switch must not sit on a timer.
        const elapsed = Date.now() - startedAt;
        if (!options?.silent && elapsed < MIN_OVERLAY_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_OVERLAY_MS - elapsed));
        }
        if (mountedRef.current && !options?.silent) setSwitchingTo(null);
        log("switch complete", `${Date.now() - startedAt}ms`);
      }
    },
    [activeExam, myExams, prefetchFor],
  );

  const addExam = useCallback(
    async (examCode: string) => {
      await followExamRow(examCode);
      const { active } = await reload();
      // The first exam a user follows becomes active with no overlay: there is no previous
      // dashboard to swap out, and resolveActive has already chosen it.
      log("followed", `${examCode} (active now ${active?.code ?? "none"})`);
    },
    [reload],
  );

  const removeExam = useCallback(
    async (examCode: string) => {
      const wasActive = activeExam?.code === examCode;
      await unfollowExamRow(examCode);
      const { active } = await reload();
      if (wasActive) {
        // Case 7: never left pointing at nothing while exams remain. `reload` already applied
        // the promotion rule and persisted it; this only bumps the version so exam-scoped
        // caches refetch, exactly as they would for a deliberate switch.
        if (mountedRef.current) setActiveExamVersion((v) => v + 1);
        log("active exam was removed — promoted", active?.code ?? "(none left)");
      }
    },
    [activeExam, reload],
  );

  const refresh = useCallback(async () => {
    await reload();
  }, [reload]);

  const value = useMemo<ActiveExamContextValue>(
    () => ({
      myExams,
      activeExam,
      loading,
      switchingTo,
      activeExamVersion,
      setActiveExam,
      addExam,
      removeExam,
      refresh,
    }),
    [myExams, activeExam, loading, switchingTo, activeExamVersion, setActiveExam, addExam, removeExam, refresh],
  );

  return <ActiveExamContext.Provider value={value}>{children}</ActiveExamContext.Provider>;
}
