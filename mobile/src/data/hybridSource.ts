import { useEffect } from "react";
import { useSyncStatus } from "../sync/SyncContext";
import { useNetworkStatus } from "../sync/NetworkStatusContext";

/**
 * The single branching decision for every hybrid data function:
 * - "local"       — this device has completed at least one full sync; read local SQLite.
 * - "live"        — never (fully) synced, but online; read straight from the backend.
 * - "unavailable" — never synced AND offline; neither source can answer.
 *
 * `lastSyncedAt` (not `status`) is the completion signal — it's only ever set after a
 * sync's local writes actually commit (see SyncContext.tsx), so "local" here means real
 * data exists to read, not just that a sync is in progress.
 */
export type HybridMode = "local" | "live" | "unavailable";

export function useHybridMode(): HybridMode {
  const { lastSyncedAt } = useSyncStatus();
  const { isOnline } = useNetworkStatus();
  const mode: HybridMode = lastSyncedAt !== null ? "local" : isOnline !== false ? "live" : "unavailable";

  // Dev-only visibility into which source a screen is actually reading from — logs only
  // on a real transition (mount counts as one), never in a production build.
  useEffect(() => {
    if (__DEV__) console.log(`[cache] hybrid mode -> ${mode}`);
  }, [mode]);

  return mode;
}
