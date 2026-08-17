import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { bookmarks } from "./schema";

export type BookmarkedQuestion = {
  questionId: string;
  questionText: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  subjectName: string;
  topicName: string;
  examLabel: string;
  bookmarkedAt: number;
};

export async function loadBookmarks(): Promise<BookmarkedQuestion[]> {
  const rows = await db
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.isDeleted, false))
    .orderBy(desc(bookmarks.bookmarkedAt))
    .all();
  return rows.map((r) => ({
    questionId: r.questionId,
    questionText: r.questionText,
    options: r.options,
    correctIndex: r.correctIndex,
    explanation: r.explanation,
    subjectName: r.subjectName,
    topicName: r.topicName,
    examLabel: r.examLabel,
    bookmarkedAt: r.bookmarkedAt.getTime(),
  }));
}

export async function insertBookmark(bookmark: BookmarkedQuestion): Promise<void> {
  const now = new Date(bookmark.bookmarkedAt);
  await db
    .insert(bookmarks)
    .values({ ...bookmark, bookmarkedAt: now, isDeleted: false, isSynced: false, updatedAt: now })
    .onConflictDoUpdate({
      target: bookmarks.questionId,
      // Re-bookmarking something whose tombstone hadn't synced away yet: revive it
      // rather than leaving a dead row that onConflictDoNothing would have ignored.
      set: { isDeleted: false, isSynced: false, updatedAt: now, bookmarkedAt: now },
    });
}

/**
 * Tombstones rather than deletes — the sync queue needs a row to tell the server this
 * question was un-bookmarked. uploadPendingBookmarks() is what removes it for good, once
 * the server has confirmed the removal.
 */
export async function deleteBookmark(questionId: string): Promise<void> {
  await db
    .update(bookmarks)
    .set({ isDeleted: true, isSynced: false, updatedAt: new Date() })
    .where(eq(bookmarks.questionId, questionId));
}

export type PendingBookmark = {
  questionId: string;
  isDeleted: boolean;
  updatedAt: number;
};

export async function loadPendingBookmarks(): Promise<PendingBookmark[]> {
  const rows = await db.select().from(bookmarks).where(eq(bookmarks.isSynced, false)).all();
  return rows.map((r) => ({ questionId: r.questionId, isDeleted: r.isDeleted, updatedAt: r.updatedAt.getTime() }));
}

export async function markBookmarksSynced(questionIds: string[]): Promise<void> {
  if (questionIds.length === 0) return;
  await db.update(bookmarks).set({ isSynced: true }).where(inArray(bookmarks.questionId, questionIds));
}

/** A tombstone that's been confirmed synced no longer needs to exist at all. */
export async function pruneSyncedTombstones(): Promise<void> {
  await db.delete(bookmarks).where(and(eq(bookmarks.isDeleted, true), eq(bookmarks.isSynced, true)));
}
