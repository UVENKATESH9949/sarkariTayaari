import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { getLastSyncedAt } from "../db/syncMeta";
import { ensureExamFollowed } from "../db/followedExams";
import { runInitialSync, type SyncProgress } from "./initialSync";
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

type SyncContextValue = (SyncProgress | { status: "checking"; synced: 0; total: 0 }) & {
  /** A delta sync running in the background — never blocks navigation. */
  isRefreshing: boolean;
  lastSyncedAt: Date | null;
  refreshError: string | null;
  refresh: (options?: { force?: boolean }) => Promise<void>;
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
  refresh: async () => {},
  syncVersion: 0,
});

export function useSyncStatus() {
  return useContext(SyncContext);
}

/**
 * Owns both syncs.
 *
 * The initial full sync runs once, on first mount, if this device has never synced —
 * that one blocks navigation until the 2-minute soft timeout, via `status`.
 *
 * After that, a delta sync runs on launch and whenever the app returns to the
 * foreground. It reports through `isRefreshing` rather than `status` precisely so it
 * never puts the blocking progress screen back up: picking up new content should be
 * invisible unless it fails.
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

      try {
        await runInitialSync(setProgress);
        await ensureExamFollowed();
        setLastSyncedAt(await getLastSyncedAt());
        setSyncVersion((v) => v + 1);
      } catch (err) {
        // "error" status already published via the progress callback above.
        captureError(err, { context: "initial sync" });
      }
    })();
  }, [refresh]);

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
      value={{ ...progress, isRefreshing, lastSyncedAt, refreshError, refresh, syncVersion }}
    >
      {children}
    </SyncContext.Provider>
  );
}
