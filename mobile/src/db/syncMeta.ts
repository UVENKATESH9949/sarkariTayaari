import { eq } from "drizzle-orm";
import { db } from "./client";
import { syncMeta } from "./schema";

const GLOBAL_KEY = "global";

/**
 * Returns the last successful sync time, or null if this device has never
 * synced before (i.e. the next sync should be a full sync, since=0). Sync is
 * no longer scoped by exam — there is exactly one row here for the whole app.
 */
export async function getLastSyncedAt(): Promise<Date | null> {
  const row = await db.select().from(syncMeta).where(eq(syncMeta.key, GLOBAL_KEY)).get();
  return row?.lastSyncedAt ?? null;
}

/**
 * Records the watermark for the next delta sync.
 *
 * Callers pass the time the sync *started*, not the time it finished. A question edited
 * while a sync was running would otherwise fall in the gap between the two and never be
 * picked up again; starting the next delta from the start time re-fetches it. The cost
 * is re-syncing a few rows that were already written, which upserts absorb.
 */
export async function setLastSyncedAt(syncedAt: Date): Promise<void> {
  await db
    .insert(syncMeta)
    .values({ key: GLOBAL_KEY, lastSyncedAt: syncedAt })
    .onConflictDoUpdate({
      target: syncMeta.key,
      set: { lastSyncedAt: syncedAt },
    });
}

export type SyncResumeState = { page: number; startedAt: Date };

/** Where an interrupted initial sync got to, or null if there's nothing to resume. */
export async function getResumeState(): Promise<SyncResumeState | null> {
  const row = await db.select().from(syncMeta).where(eq(syncMeta.key, GLOBAL_KEY)).get();
  if (!row || row.resumePage == null || row.resumeStartedAt == null) return null;
  return { page: row.resumePage, startedAt: row.resumeStartedAt };
}

export async function setResumeState(state: SyncResumeState): Promise<void> {
  await db
    .insert(syncMeta)
    .values({ key: GLOBAL_KEY, resumePage: state.page, resumeStartedAt: state.startedAt })
    .onConflictDoUpdate({
      target: syncMeta.key,
      set: { resumePage: state.page, resumeStartedAt: state.startedAt },
    });
}

export async function clearResumeState(): Promise<void> {
  await db
    .insert(syncMeta)
    .values({ key: GLOBAL_KEY, resumePage: null, resumeStartedAt: null })
    .onConflictDoUpdate({
      target: syncMeta.key,
      set: { resumePage: null, resumeStartedAt: null },
    });
}
