import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { bookmarks, questionTranslations, questions } from "../db/schema";
import {
  loadPendingBookmarks,
  markBookmarksSynced,
  pruneSyncedTombstones,
  type PendingBookmark,
} from "../db/bookmarks";
import { restoreBookmarks, uploadBookmarks, type BookmarkPayload } from "../api/bookmarks";

const MISSING_QUESTION_TEXT = "This question is no longer available.";

/**
 * Pushes every add and removal not yet confirmed by the server. Unlike progress, a
 * removal is real work to sync too — a tombstone is exactly as "pending" as a new
 * bookmark, and both travel in the same batch keyed by updatedAt.
 */
export async function uploadPendingBookmarks(token: string): Promise<number> {
  const pending = await loadPendingBookmarks();
  if (pending.length === 0) return 0;

  const payload: BookmarkPayload[] = pending.map((b: PendingBookmark) => ({
    questionId: b.questionId,
    deleted: b.isDeleted,
    updatedAt: new Date(b.updatedAt).toISOString(),
  }));

  await uploadBookmarks(token, payload);

  await markBookmarksSynced(pending.map((b) => b.questionId));
  await pruneSyncedTombstones();

  return pending.length;
}

/**
 * Pulls bookmarks this device doesn't have yet. Only additions travel down — a bookmark
 * removed elsewhere and never made locally needs no representation here, and one this
 * device already has (bookmarked or already tombstoned) is left alone rather than
 * fighting whatever pending local change is still waiting to go up.
 */
export async function restoreBookmarksFromServer(token: string): Promise<number> {
  const remote = await restoreBookmarks(token);
  if (remote.bookmarks.length === 0) return 0;

  const existingIds = new Set((await db.select({ id: bookmarks.questionId }).from(bookmarks).all()).map((r) => r.id));
  const missing = remote.bookmarks.filter((b) => !existingIds.has(b.questionId));
  if (missing.length === 0) return 0;

  const questionIds = missing.map((b) => b.questionId);
  const questionRows = await db.select().from(questions).where(inArray(questions.id, questionIds)).all();
  const questionById = new Map(questionRows.map((q) => [q.id, q]));

  const translationRows = await db
    .select()
    .from(questionTranslations)
    .where(inArray(questionTranslations.questionId, questionIds))
    .all();
  const englishByQuestion = new Map(
    translationRows.filter((r) => r.languageCode === "en").map((r) => [r.questionId, r]),
  );

  await db.insert(bookmarks).values(
    missing.map((b) => {
      const question = questionById.get(b.questionId);
      const translation = englishByQuestion.get(b.questionId);
      const updatedAt = new Date(b.updatedAt);
      return {
        questionId: b.questionId,
        questionText: translation?.questionText ?? MISSING_QUESTION_TEXT,
        options: translation?.options ?? [],
        correctIndex: 0,
        explanation: translation?.explanation ?? "",
        subjectName: question?.subjectName ?? "",
        topicName: question?.topicName ?? "",
        examLabel: "",
        bookmarkedAt: updatedAt,
        isDeleted: false,
        isSynced: true,
        updatedAt,
      };
    }),
  );

  return missing.length;
}

/** Both directions in one pass: push what's pending, then pull anything missing. */
export async function syncBookmarks(token: string): Promise<{ uploaded: number; restored: number }> {
  const uploaded = await uploadPendingBookmarks(token);
  const restored = await restoreBookmarksFromServer(token);
  return { uploaded, restored };
}
