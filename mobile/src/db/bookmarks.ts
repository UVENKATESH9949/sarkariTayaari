import { desc, eq } from "drizzle-orm";
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
  const rows = await db.select().from(bookmarks).orderBy(desc(bookmarks.bookmarkedAt)).all();
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
  await db
    .insert(bookmarks)
    .values({ ...bookmark, bookmarkedAt: new Date(bookmark.bookmarkedAt) })
    .onConflictDoNothing();
}

export async function deleteBookmark(questionId: string): Promise<void> {
  await db.delete(bookmarks).where(eq(bookmarks.questionId, questionId));
}
