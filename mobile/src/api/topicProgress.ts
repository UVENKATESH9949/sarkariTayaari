import { apiFetch } from "./client";

/**
 * Per-topic mastery sync (Epic L / TICKET-2105). Mirrors `bookmarks.ts` — mutable state, so
 * every row carries its own `updatedAt` and the server resolves competing devices by it.
 */

export type TopicProgressPayload = {
  topicId: string;
  /** NOT_STARTED | LEARNING | PRACTICING | MASTERED | NEEDS_REVISION */
  state: string;
  accuracyPercent: number | null;
  attemptedCount: number;
  correctCount: number;
  totalTimeMs: number;
  lastPracticedAt: string | null;
  updatedAt: string;
};

export type TopicProgressSyncResult = {
  stored: number;
  /**
   * Rows the server declined — a stale snapshot, an illegal transition, or a topic it does not
   * know. Reported separately from `stored` rather than folded in, so a client sending bad data
   * can be noticed instead of assuming the upload worked.
   */
  rejected: number;
};

export type RestoredTopicProgress = TopicProgressPayload & {
  topicName: string;
  subjectId: string;
  subjectName: string;
};

export type TopicProgressRestoreResult = {
  topics: RestoredTopicProgress[];
};

/** Safe to retry — the server keeps whichever update is newer, by updatedAt. */
export function uploadTopicProgress(token: string, topics: TopicProgressPayload[]) {
  return apiFetch<TopicProgressSyncResult>("/topic-progress/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: { topics },
  });
}

/** Everything the server holds for this student, for rebuilding a fresh install. */
export function restoreTopicProgressFromServer(token: string) {
  return apiFetch<TopicProgressRestoreResult>("/topic-progress", {
    headers: { Authorization: `Bearer ${token}` },
  });
}
