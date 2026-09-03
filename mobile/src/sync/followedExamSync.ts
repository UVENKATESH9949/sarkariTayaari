import { db } from "../db/client";
import { followedExams } from "../db/schema";
import {
  loadPendingFollowedExams,
  markFollowedExamsSynced,
  pruneSyncedFollowedExamTombstones,
  type PendingFollowedExam,
} from "../db/followedExams";
import {
  restoreFollowedExams,
  uploadFollowedExams,
  type FollowedExamPayload,
} from "../api/followedExams";

/**
 * Mirrors sync/bookmarkSync.ts exactly. Simpler than bookmarks in one respect: a
 * followed exam carries no content of its own to reconstruct (no question text/options
 * to look up) — just the exam code, which the ordinary reference sync already keeps
 * locally. A restored row pointing at an exam not yet synced locally is harmless: the
 * join in getFollowedExams()/getFollowedExam() simply won't surface it until that
 * exam's own sync lands, exactly like a bookmark for a not-yet-synced question.
 */
export async function uploadPendingFollowedExams(token: string): Promise<number> {
  const pending = await loadPendingFollowedExams();
  if (pending.length === 0) return 0;

  const payload: FollowedExamPayload[] = pending.map((f: PendingFollowedExam) => ({
    examCode: f.examCode,
    deleted: f.isDeleted,
    updatedAt: new Date(f.updatedAt).toISOString(),
  }));

  await uploadFollowedExams(token, payload);

  await markFollowedExamsSynced(pending.map((f) => f.examCode));
  await pruneSyncedFollowedExamTombstones();

  return pending.length;
}

/**
 * Pulls follows this device doesn't have yet. Only additions travel down — an exam
 * unfollowed elsewhere and never followed locally needs no representation here, and one
 * this device already has (followed or already tombstoned) is left alone rather than
 * fighting whatever pending local change is still waiting to go up.
 */
export async function restoreFollowedExamsFromServer(token: string): Promise<number> {
  const remote = await restoreFollowedExams(token);
  if (remote.exams.length === 0) return 0;

  const existingCodes = new Set(
    (await db.select({ code: followedExams.examCode }).from(followedExams).all()).map((r) => r.code),
  );
  const missing = remote.exams.filter((f) => !existingCodes.has(f.examCode));
  if (missing.length === 0) return 0;

  await db.insert(followedExams).values(
    missing.map((f) => {
      const updatedAt = new Date(f.updatedAt);
      return {
        examCode: f.examCode,
        followedAt: updatedAt,
        isDeleted: false,
        isSynced: true,
        updatedAt,
      };
    }),
  );

  return missing.length;
}

/** Both directions in one pass: push what's pending, then pull anything missing. */
export async function syncFollowedExams(token: string): Promise<{ uploaded: number; restored: number }> {
  const uploaded = await uploadPendingFollowedExams(token);
  const restored = await restoreFollowedExamsFromServer(token);
  return { uploaded, restored };
}
