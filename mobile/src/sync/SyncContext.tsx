import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { getLastSyncedAt } from "../db/syncMeta";
import { ensureExamFollowed } from "../db/followedExams";
import { runInitialSyncUntilDone, type SyncProgress } from "./initialSync";
import { runDeltaSync } from "./deltaSync";
import { useNetworkStatus } from "./NetworkStatusContext";
import { captureError } from "../telemetry/analytics";

/**
 * How recent a sync has to be for an automatic check to be skipped. Foregrounding the
 * app repeatedly shouldn't hammer the server, but content authored today should reach
 * a device the same day it opens the app. A manual pull-to-refresh passes `force` and
 * ignores this entirely.
 */
const STALE_AFTER_MS = 15 * 60 * 1000;

/**
 * Hard ceiling on the first-launch preparation gate. Enforced independently of sync
 * state, which is the whole point: it cannot be extended by a slow network, a Cloud Run
 * cold start, or a failing request, so it is structurally impossible for a first launch
 * to strand the user on the preparation screen. That was a real bug — an offline first
 * launch previously retried forever behind the gate with no way into the app and no way
 * to reach More's Retry.
 *
 * Normally unreached: the gate releases as soon as reference data is written (see the
 * `phase` check below), which is 8 small requests. This is the safety net, not the path.
 */
const GATE_MAX_MS = 5 * 1000;

type SyncContextValue = (SyncProgress | { status: "checking"; synced: 0; total: 0 }) & {
  /** A delta sync running in the background — never blocks navigation. */
  isRefreshing: boolean;
  lastSyncedAt: Date | null;
  refreshError: string | null;
  /**
   * True only for a device's genuinely first-ever sync, from the moment it starts until
   * whichever comes first: reference data is written, the sync finishes, or `GATE_MAX_MS`
   * elapses. Stays false the entire session for a returning device — the initial-sync
   * branch below is the only place that ever sets it true. Drives the first-launch
   * preparation gate (`mobile/src/ui/PreparingApp.tsx`) without needing a separate
   * persisted flag.
   */
  firstLaunchSyncActive: boolean;
  /**
   * When the first-launch gate opened, or null when it isn't/wasn't active. The gate
   * screen uses it to advance its bar smoothly over `GATE_MAX_MS` rather than jumping
   * from 0 to 100 — with a one-page question bank the real counts have no intermediate
   * values to show.
   */
  firstLaunchStartedAt: number | null;
  /** Hard ceiling the gate screen animates against. */
  firstLaunchMaxMs: number;
  refresh: (options?: { force?: boolean }) => Promise<void>;
  /**
   * The More screen's single "Sync Now"/"Retry" action — picks initial vs. delta sync
   * depending on whether this device has ever completed one, so the screen doesn't need
   * to know which path applies.
   */
  syncNow: () => Promise<void>;
  /**
   * Bumped after every sync that wrote something. Screens that read from SQLite put
   * this in their effect deps so they re-query: tab and stack state is preserved
   * across navigation, so a screen mounted before a sync would otherwise keep showing
   * pre-sync data indefinitely.
   */
  syncVersion: number;
};

const SyncContext = createContext<SyncContextValue>({
  status: "checking",
  synced: 0,
  total: 0,
  isRefreshing: false,
  lastSyncedAt: null,
  refreshError: null,
  firstLaunchSyncActive: false,
  firstLaunchStartedAt: null,
  firstLaunchMaxMs: GATE_MAX_MS,
  refresh: async () => {},
  syncNow: async () => {},
  syncVersion: 0,
});

export function useSyncStatus() {
  return useContext(SyncContext);
}

/**
 * Owns both syncs.
 *
 * A delta sync never blocks navigation. A device's genuinely first-ever sync does, but
 * only briefly and only once: `firstLaunchSyncActive` holds the preparation screen up
 * until reference data is written (8 small requests), and a hard `GATE_MAX_MS` ceiling
 * releases it regardless of what the network is doing. The question bank continues
 * downloading behind the open app — screens read live from the backend via the hybrid
 * data layer (`mobile/src/data/`) until the local copy lands; see `useHybridMode()`.
 *
 * This replaced an earlier gate that waited for `status === "completed"`, i.e. every
 * page of the question bank. That version could not release at all on an offline first
 * launch, because the retry wrapper rewrites failures as "syncing" — the ceiling above
 * is what makes that class of bug impossible rather than merely unlikely.
 *
 * `status`/`synced`/`total` publish real measured progress for the More screen's bar.
 * The gate screen's own bar is time-smoothed (see `firstLaunchStartedAt`) because a
 * one-page question bank has no intermediate counts to show; it must never present
 * those two as the same thing.
 *
 * The initial full sync runs once, on first mount, if this device has never synced.
 * After that, a delta sync runs on launch and whenever the app returns to the
 * foreground. It reports through `isRefreshing` rather than `status` precisely so it
 * never implies the app is blocked: picking up new content should be invisible unless
 * it fails.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<SyncProgress | { status: "checking"; synced: 0; total: 0 }>({
    status: "checking",
    synced: 0,
    total: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);
  const [firstLaunchSyncActive, setFirstLaunchSyncActive] = useState(false);
  const [firstLaunchStartedAt, setFirstLaunchStartedAt] = useState<number | null>(null);
  // Cleared by whichever release condition wins, and on unmount, so the ceiling can
  // never fire against an unmounted provider.
  const gateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The release conditions are re-evaluated on every progress tick, and `phase` stays
  // "questions" for the rest of the sync — so without this the gate "releases" once per
  // page. React bails out on the unchanged state, but the log line repeated and made it
  // impossible to tell from the log which condition actually won.
  const gateReleased = useRef(false);

  const { isOnline } = useNetworkStatus();
  const started = useRef(false);
  // A ref, not state: two triggers can fire in the same tick (launch + foreground),
  // and a state flag would not have updated in time to stop the second one.
  const refreshing = useRef(false);
  // Read inside refresh() without making isOnline a dependency — refresh is captured
  // by AppState/foreground listeners set up once, and a stale isOnline there would
  // mean a phone that went offline mid-session keeps trying delta syncs forever.
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (refreshing.current) return;
    // No point attempting and then reporting a fetch failure that was never in doubt.
    // `null` (not yet known) is treated as online so a cold start doesn't skip its
    // first check.
    if (isOnlineRef.current === false) return;

    const last = await getLastSyncedAt();
    // Never synced: the initial sync owns that path, and a delta sync here would race it.
    if (!last) return;
    if (!options?.force && Date.now() - last.getTime() < STALE_AFTER_MS) return;

    refreshing.current = true;
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const result = await runDeltaSync();
      if (result.status === "error") {
        setRefreshError(result.error ?? "Couldn't check for updates.");
      } else {
        setLastSyncedAt(await getLastSyncedAt());
        setSyncVersion((v) => v + 1);
      }
    } finally {
      refreshing.current = false;
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const last = await getLastSyncedAt();
      if (last) {
        if (__DEV__) console.log("[cache] warm — already synced, checking for updates in background");
        setProgress({ status: "completed", synced: 0, total: 0 });
        setLastSyncedAt(last);
        ensureExamFollowed().catch((err) => {
          console.warn("Failed to auto-follow exam", err);
          captureError(err, { context: "ensureExamFollowed (post-sync)" });
        });
        // Already synced before — check for anything new without blocking the UI.
        refresh().catch((err) => {
          console.warn("Delta sync on launch failed", err);
          captureError(err, { context: "delta sync on launch" });
        });
        return;
      }

      // Never synced before. The sync itself is fire-and-forget and retries indefinitely
      // (see runInitialSyncUntilDone for why that's safe); the preparation gate is held
      // separately and released by whichever of three conditions lands first — reference
      // data written, sync finished, or the GATE_MAX_MS ceiling. Released from inside the
      // progress callback rather than a separate effect reacting to state, same shape as
      // the setState calls in the `.then()` below.
      if (__DEV__) console.log("[cache] cold — first-ever launch, preparation gate active");
      setFirstLaunchSyncActive(true);
      setFirstLaunchStartedAt(Date.now());

      const releaseGate = (reason: string) => {
        if (gateReleased.current) return;
        gateReleased.current = true;
        if (gateTimer.current !== null) {
          clearTimeout(gateTimer.current);
          gateTimer.current = null;
        }
        if (__DEV__) console.log(`[cache] preparation gate released (${reason})`);
        setFirstLaunchSyncActive(false);
      };

      // The ceiling. Deliberately not conditional on anything — see GATE_MAX_MS.
      gateTimer.current = setTimeout(() => releaseGate("5s ceiling"), GATE_MAX_MS);

      runInitialSyncUntilDone((p) => {
        setProgress(p);
        // Reference data written (phase advanced to "questions") is the real release
        // signal: that's everything the app shell renders from. Questions keep
        // downloading behind the open app. "completed"/"partial" are kept as belt-and-
        // braces for a sync that somehow skips straight past the phase tick.
        if (p.phase === "questions" || p.status === "completed" || p.status === "partial") {
          releaseGate(p.phase === "questions" ? "reference data ready" : `status: ${p.status}`);
        }
      }).then(async () => {
        await ensureExamFollowed();
        setLastSyncedAt(await getLastSyncedAt());
        setSyncVersion((v) => v + 1);
      });
    })();

    return () => {
      if (gateTimer.current !== null) {
        clearTimeout(gateTimer.current);
        gateTimer.current = null;
      }
    };
  }, [refresh]);

  const syncNow = useCallback(async () => {
    if (lastSyncedAt === null) {
      await runInitialSyncUntilDone(setProgress);
      await ensureExamFollowed();
      setLastSyncedAt(await getLastSyncedAt());
      setSyncVersion((v) => v + 1);
    } else {
      await refresh({ force: true });
    }
  }, [lastSyncedAt, refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh().catch((err) => {
          console.warn("Delta sync on foreground failed", err);
          captureError(err, { context: "delta sync on foreground" });
        });
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  // Coming back online is exactly when a student is most likely waiting on new
  // content — don't make them wait for the next foreground event or the 15-minute
  // staleness window on top of the outage they just sat through.
  const wasOnline = useRef(isOnline);
  useEffect(() => {
    if (isOnline && wasOnline.current === false) {
      refresh({ force: true }).catch((err) => {
        console.warn("Delta sync on reconnect failed", err);
        captureError(err, { context: "delta sync on reconnect" });
      });
    }
    wasOnline.current = isOnline;
  }, [isOnline, refresh]);

  return (
    <SyncContext.Provider
      value={{
        ...progress,
        isRefreshing,
        lastSyncedAt,
        refreshError,
        firstLaunchSyncActive,
        firstLaunchStartedAt,
        firstLaunchMaxMs: GATE_MAX_MS,
        refresh,
        syncNow,
        syncVersion,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}
