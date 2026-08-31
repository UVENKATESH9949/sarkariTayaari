import {
  loadPendingTopicProgress,
  markTopicProgressSynced,
  restoreTopicProgress,
} from "../db/topicProgressStore";
import {
  restoreTopicProgressFromServer,
  uploadTopicProgress,
  type TopicProgressPayload,
} from "../api/topicProgress";

/**
 * Uploads and restores per-topic mastery (Epic L / TICKET-2105).
 *
 * Follows `bookmarkSync.ts` rather than `progressSync.ts`: mastery is mutable state per topic,
 * not an append-only event, so the same row is re-uploaded whenever it changes and the server
 * resolves conflicts last-write-wins on `updatedAt`.
 */

/**
 * Pushes every topic whose progress has changed since the last successful sync.
 *
 * The ids are captured *before* the request and only those are marked synced afterwards — a quiz
 * finishing mid-flight would otherwise have its new row marked synced without ever being sent.
 *
 * @returns how many rows were accepted, or 0 when there was nothing to send.
 */
export async function uploadPendingTopicProgress(token: string): Promise<number> {
  const pending = await loadPendingTopicProgress();
  if (pending.length === 0) return 0;

  const payload: TopicProgressPayload[] = pending.map((row) => ({
    topicId: row.topicId,
    state: row.state,
    accuracyPercent: row.accuracyPercent,
    attemptedCount: row.attemptedCount,
    correctCount: row.correctCount,
    totalTimeMs: row.totalTimeMs,
    lastPracticedAt: row.lastPracticedAt ? new Date(row.lastPracticedAt).toISOString() : null,
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));

  const result = await uploadTopicProgress(token, payload);

  /*
   * Marked synced even when the server rejected some rows, and deliberately so.
   *
   * A rejection is not transient: the server declines a row because the transition is illegal,
   * the topic no longer exists, or its own copy is already newer. Re-sending it on every sync
   * forever would be a permanent, silently growing queue that never drains — the failure mode
   * is worse than dropping the row, because the rejected row is by definition one the server
   * has correctly decided not to take.
   */
  await markTopicProgressSynced(pending.map((row) => row.topicId));

  return result.stored;
}

/**
 * Pulls the server's copy onto this device.
 *
 * Unlike bookmarks, rows already present locally are *not* skipped: mastery is a value that
 * changes rather than a thing that exists or does not, so a locally-known topic can still have a
 * newer figure on the server (practised on another device). The newer-wins comparison happens in
 * {@link restoreTopicProgress}'s upsert, so a row edited offline here is never clobbered by an
 * older server copy.
 *
 * @returns how many rows the server sent.
 */
export async function restoreTopicProgressForDevice(token: string): Promise<number> {
  const remote = await restoreTopicProgressFromServer(token);
  if (remote.topics.length === 0) return 0;

  await restoreTopicProgress(
    remote.topics.map((row) => ({
      topicId: row.topicId,
      state: row.state,
      accuracyPercent: row.accuracyPercent,
      attemptedCount: row.attemptedCount,
      correctCount: row.correctCount,
      totalTimeMs: row.totalTimeMs,
      lastPracticedAt: row.lastPracticedAt,
      updatedAt: row.updatedAt,
    })),
  );

  return remote.topics.length;
}
