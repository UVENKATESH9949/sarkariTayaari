import { db } from "../db/client";
import { clearResumeState, getResumeState, setLastSyncedAt, setResumeState } from "../db/syncMeta";
import { syncQuestions } from "../api/questions";
import { writeLanguages, writeReferenceData, upsertQuestion } from "./writeQuestions";

const PAGE_SIZE = 500;
const SOFT_TIMEOUT_MS = 2 * 60 * 1000;

export type SyncStatus = "syncing" | "partial" | "completed" | "error";

export type SyncProgress = {
  status: SyncStatus;
  synced: number;
  total: number;
  error?: string;
};

type OnProgress = (progress: SyncProgress) => void;

/**
 * Runs a full sync (since=0), paginating through the server's sync endpoint
 * and writing each page into local SQLite inside a transaction. Always syncs
 * the entire question bank — the server no longer scopes this by exam, so
 * switching exams or browsing "All Government Exams" never needs a network
 * call after this first sync.
 *
 * If the sync is still running past the 2-minute soft timeout, `onProgress`
 * is called once with status "partial" — the caller (home/splash screen) can
 * treat that as a signal to unlock navigation and stop awaiting this promise,
 * while the promise itself keeps running to completion in the background
 * (still just async work on the JS thread — see Sprint 3 notes in the
 * requirements doc for what "background" does and doesn't mean here).
 */
export async function runInitialSync(onProgress?: OnProgress): Promise<{ status: SyncStatus }> {
  const deadline = Date.now() + SOFT_TIMEOUT_MS;
  let timedOutNotified = false;
  let synced = 0;
  let total = 0;

  try {
    await Promise.all([writeLanguages(), writeReferenceData()]);

    // Resume an interrupted run rather than re-downloading everything. Pages already
    // written stay written — the upserts make a partial run safe to build on.
    const resume = await getResumeState();
    const startedAt = resume?.startedAt ?? new Date();
    let page = resume?.page ?? 0;
    synced = page * PAGE_SIZE;

    while (true) {
      const result = await syncQuestions("0", page, PAGE_SIZE);
      total = result.totalElements;

      await db.transaction(async (tx) => {
        for (const q of result.content) {
          await upsertQuestion(tx, q);
        }
      });
      synced += result.content.length;
      // Checkpoint after the page is committed, so a crash here resumes at the next one.
      await setResumeState({ page: page + 1, startedAt });

      if (!result.last && !timedOutNotified && Date.now() > deadline) {
        timedOutNotified = true;
        onProgress?.({ status: "partial", synced, total });
      } else {
        // Always report a "syncing" tick with the real counts for this page,
        // even on the last page — otherwise a dataset that fits in one page
        // (true today, at ~108 rows) never shows real progress before the
        // final "completed" tick.
        onProgress?.({ status: "syncing", synced, total });
      }

      if (result.last) {
        break;
      }

      page += 1;
    }

    // Watermark is the sync's start time, not now: anything edited while this was
    // running is then re-fetched by the next delta sync instead of being missed.
    await setLastSyncedAt(startedAt);
    await clearResumeState();
    onProgress?.({ status: "completed", synced, total });
    return { status: "completed" };
  } catch (err) {
    const message = (err as Error).message;
    onProgress?.({ status: "error", synced, total, error: message });
    throw err;
  }
}
