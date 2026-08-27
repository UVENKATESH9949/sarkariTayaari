import { db } from "../db/client";
import { clearResumeState, getResumeState, setLastSyncedAt, setResumeState } from "../db/syncMeta";
import { syncQuestions } from "../api/questions";
import { writeLanguages, writeReferenceData, upsertQuestionsBatch } from "./writeQuestions";
import { captureError } from "../telemetry/analytics";

const PAGE_SIZE = 500;
const SOFT_TIMEOUT_MS = 2 * 60 * 1000;
const RETRY_BASE_MS = 2 * 1000;
const RETRY_MAX_MS = 30 * 1000;

export type SyncStatus = "syncing" | "partial" | "completed" | "error";

/**
 * Which half of the initial sync is in flight. This exists so the first-launch gate can
 * release on `"questions"` — i.e. the moment reference data is written — instead of
 * waiting for the entire question bank. The app shell only needs exams/subjects/topics/
 * levels to render; questions are needed when a quiz opens, and `useHybridMode()`
 * already serves those live until the local copy lands.
 */
export type SyncPhase = "reference" | "questions";

export type SyncProgress = {
  status: SyncStatus;
  synced: number;
  total: number;
  phase?: SyncPhase;
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

  if (__DEV__) console.log("[sync] initial sync started");

  try {
    onProgress?.({ status: "syncing", synced: 0, total: 0, phase: "reference" });
    await Promise.all([writeLanguages(), writeReferenceData()]);
    if (__DEV__) console.log("[sync] reference data ready (languages, exams, subjects, topics, structures)");
    // The gate's release signal. Everything past this point is background work as far
    // as the app shell is concerned.
    onProgress?.({ status: "syncing", synced: 0, total: 0, phase: "questions" });

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
        await upsertQuestionsBatch(tx, result.content);
      });
      synced += result.content.length;
      if (__DEV__) console.log(`[sync] page ${page} written (${synced}/${total} questions)`);
      // Checkpoint after the page is committed, so a crash here resumes at the next one.
      await setResumeState({ page: page + 1, startedAt });

      if (!result.last && !timedOutNotified && Date.now() > deadline) {
        timedOutNotified = true;
        onProgress?.({ status: "partial", synced, total, phase: "questions" });
      } else {
        // Always report a "syncing" tick with the real counts for this page,
        // even on the last page — otherwise a dataset that fits in one page
        // (true today, at ~108 rows) never shows real progress before the
        // final "completed" tick.
        onProgress?.({ status: "syncing", synced, total, phase: "questions" });
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
    if (__DEV__) console.log(`[sync] initial sync completed (${synced}/${total} questions)`);
    onProgress?.({ status: "completed", synced, total, phase: "questions" });
    return { status: "completed" };
  } catch (err) {
    const message = (err as Error).message;
    if (__DEV__) console.log("[sync] initial sync failed, will retry", message);
    onProgress?.({ status: "error", synced, total, error: message });
    throw err;
  }
}

/**
 * Wraps `runInitialSync` with indefinite retry, backing off exponentially (capped at
 * 30s) between attempts. A page failing mid-download (e.g. a transient 500 from the
 * backend) is expected to be recoverable, not fatal — the per-page checkpoint in
 * `runInitialSync` means a retry resumes at the next page instead of restarting, so
 * there's no cost to just trying again. The caller never sees a terminal "error": each
 * failed attempt is swallowed and reported back as "syncing" with the last known
 * progress, so the UI has nothing to show but a percentage climbing towards 100.
 */
export async function runInitialSyncUntilDone(onProgress?: OnProgress): Promise<void> {
  let attempt = 0;
  let lastSynced = 0;
  let lastTotal = 0;
  // Carried across the error rewrite below so a failure during the question phase
  // doesn't look like a regression back to the reference phase — the gate keys off
  // `phase`, and reference data that already landed stays landed.
  let lastPhase: SyncPhase | undefined;

  const wrappedProgress: OnProgress = (progress) => {
    if (progress.status === "error") {
      onProgress?.({ status: "syncing", synced: lastSynced, total: lastTotal, phase: lastPhase });
      return;
    }
    lastSynced = progress.synced;
    lastTotal = progress.total;
    lastPhase = progress.phase ?? lastPhase;
    onProgress?.(progress);
  };

  while (true) {
    try {
      await runInitialSync(wrappedProgress);
      return;
    } catch (err) {
      attempt += 1;
      const delay = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS);
      console.warn(`Initial sync attempt ${attempt} failed, retrying in ${delay}ms`, err);
      captureError(err, { context: "initial sync retry", attempt });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
