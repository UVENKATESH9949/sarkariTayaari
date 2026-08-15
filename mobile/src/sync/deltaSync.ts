import { db } from "../db/client";
import { getLastSyncedAt, setLastSyncedAt } from "../db/syncMeta";
import { syncQuestions } from "../api/questions";
import { writeLanguages, writeReferenceData, upsertQuestion, deleteQuestionLocally } from "./writeQuestions";

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
    // Captured before any fetching, and stored as the new watermark on success — a
    // question edited mid-sync would otherwise fall between the old and new marks and
    // never be picked up.
    const startedAt = new Date();

    await Promise.all([writeLanguages(), writeReferenceData()]);

    let page = 0;
    while (true) {
      const result = await syncQuestions(since, page, PAGE_SIZE);

      await db.transaction(async (tx) => {
        for (const q of result.content) {
          if (q.deleted) {
            await deleteQuestionLocally(tx, q.id);
            deleted += 1;
          } else {
            await upsertQuestion(tx, q);
            upserted += 1;
          }
        }
      });

      if (result.last) {
        break;
      }
      page += 1;
    }

    await setLastSyncedAt(startedAt);
    return { status: "completed", upserted, deleted };
  } catch (err) {
    return { status: "error", upserted, deleted, error: (err as Error).message };
  }
}
