import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { exams, followedExams } from "./schema";

export type FollowedExam = {
  code: string;
  name: string;
};

/**
 * Returns the exam the user is currently preparing for, or null if none is followed yet.
 *
 * The table has always been keyed to support more than one followed exam (its primary
 * key is `examCode`, not a singleton row) — only this query narrowed it to one, for
 * Home's single exam card. {@link getFollowedExams} (Exam Guide spec §29 "My Exams") is
 * the plural counterpart added alongside it; this one is unchanged so every existing
 * caller (Home, PreparationPlanCard) keeps its current "one primary exam" behaviour.
 */
export async function getFollowedExam(): Promise<FollowedExam | null> {
  const row = await db
    .select({ code: exams.code, name: exams.name })
    .from(followedExams)
    .innerJoin(exams, eq(followedExams.examCode, exams.code))
    .where(eq(followedExams.isDeleted, false))
    .get();
  return row ?? null;
}

/** Every followed exam, most-recently-followed first. */
export async function getFollowedExams(): Promise<FollowedExam[]> {
  return db
    .select({ code: exams.code, name: exams.name })
    .from(followedExams)
    .innerJoin(exams, eq(followedExams.examCode, exams.code))
    .where(eq(followedExams.isDeleted, false))
    .orderBy(desc(followedExams.followedAt))
    .all();
}

/**
 * Upserts rather than a plain insert: an unfollow whose tombstone hasn't synced away
 * yet must be revived on re-follow, not silently ignored — same reasoning as
 * `insertBookmark` in db/bookmarks.ts.
 */
export async function followExam(examCode: string): Promise<void> {
  const now = new Date();
  await db
    .insert(followedExams)
    .values({ examCode, followedAt: now, isDeleted: false, isSynced: false, updatedAt: now })
    .onConflictDoUpdate({
      target: followedExams.examCode,
      set: { isDeleted: false, isSynced: false, updatedAt: now },
    });
}

/**
 * Tombstones rather than deletes — the sync queue needs a row to tell the server this
 * exam was unfollowed. uploadPendingFollowedExams() (sync/followedExamSync.ts) is what
 * removes it for good, once the server has confirmed the removal.
 */
export async function unfollowExam(examCode: string): Promise<void> {
  await db
    .update(followedExams)
    .set({ isDeleted: true, isSynced: false, updatedAt: new Date() })
    .where(eq(followedExams.examCode, examCode));
}

export async function isExamFollowed(examCode: string): Promise<boolean> {
  const row = await db
    .select()
    .from(followedExams)
    .where(and(eq(followedExams.examCode, examCode), eq(followedExams.isDeleted, false)))
    .get();
  return row !== undefined;
}

export type PendingFollowedExam = {
  examCode: string;
  isDeleted: boolean;
  updatedAt: number;
};

export async function loadPendingFollowedExams(): Promise<PendingFollowedExam[]> {
  const rows = await db.select().from(followedExams).where(eq(followedExams.isSynced, false)).all();
  return rows.map((r) => ({ examCode: r.examCode, isDeleted: r.isDeleted, updatedAt: r.updatedAt.getTime() }));
}

export async function markFollowedExamsSynced(examCodes: string[]): Promise<void> {
  if (examCodes.length === 0) return;
  await db.update(followedExams).set({ isSynced: true }).where(inArray(followedExams.examCode, examCodes));
}

/** A tombstone that's been confirmed synced no longer needs to exist at all. */
export async function pruneSyncedFollowedExamTombstones(): Promise<void> {
  await db.delete(followedExams).where(and(eq(followedExams.isDeleted, true), eq(followedExams.isSynced, true)));
}

/**
 * If the user isn't following any exam yet, auto-follows the first one
 * (lowest display order) from the locally-synced exam list. There's no
 * "choose your exam" onboarding screen yet — with only one real exam
 * (SSC_CGL) available today, following it automatically after the first
 * sync is a reasonable stand-in until that UI exists.
 */
export async function ensureExamFollowed(): Promise<void> {
  const alreadyFollowed = await getFollowedExam();
  if (alreadyFollowed) return;

  const firstExam = await db.select().from(exams).orderBy(asc(exams.displayOrder)).get();
  if (firstExam) {
    await followExam(firstExam.code);
  }
}
