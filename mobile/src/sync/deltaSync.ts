import { db } from "../db/client";
import { getLastSyncedAt, setLastSyncedAt } from "../db/syncMeta";
import { syncQuestions } from "../api/questions";
import { writeLanguages, writeReferenceData, upsertQuestionsBatch, deleteQuestionLocally } from "./writeQuestions";

const PAGE_SIZE = 500;

export type DeltaSyncResult = {
  status: "completed" | "error";
  upserted: number;
  deleted: number;
  error?: string;
};

/**
 * Syncs only what changed since this device's last successful sync (falls
 * back to a full sync if it has never synced). Changed/new questions are
 * upserted; questions the server reports as soft-deleted are hard-deleted
 * locally (there's no reason to keep a ghost row around on a read-only
 * client) along with their translations and exam tags.
 */
export async function runDeltaSync(): Promise<DeltaSyncResult> {
  let upserted = 0;
  let deleted = 0;

  try {
    const lastSyncedAt = await getLastSyncedAt();
    const since = lastSyncedAt ? lastSyncedAt.toISOString() : "0";
    if (__DEV__) console.log(`[sync] delta sync started (since ${since})`);
    // Captured before any fetching, and stored as the new watermark on success — a
    // question edited mid-sync would otherwise fall between the old and new marks and
    // never be picked up.
    const startedAt = new Date();

    await Promise.all([writeLanguages(), writeReferenceData()]);

    let page = 0;
    while (true) {
      const result = await syncQuestions(since, page, PAGE_SIZE);

      await db.transaction(async (tx) => {
        const toDelete = result.content.filter((q) => q.deleted);
        const toUpsert = result.content.filter((q) => !q.deleted);

        for (const q of toDelete) {
          await deleteQuestionLocally(tx, q.id);
        }
        await upsertQuestionsBatch(tx, toUpsert);

        deleted += toDelete.length;
        upserted += toUpsert.length;
      });

      if (result.last) {
        break;
      }
      page += 1;
    }

    await setLastSyncedAt(startedAt);
    if (__DEV__) console.log(`[sync] delta sync completed (${upserted} upserted, ${deleted} deleted)`);
    return { status: "completed", upserted, deleted };
  } catch (err) {
    if (__DEV__) console.log("[sync] delta sync failed", (err as Error).message);
    return { status: "error", upserted, deleted, error: (err as Error).message };
  }
}
