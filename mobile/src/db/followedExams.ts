import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { appPreferences, exams, followedExams } from "./schema";

export type FollowedExam = {
  code: string;
  name: string;
};

/**
 * Whether ANY exam is followed, returning one arbitrarily.
 *
 * **Not the active exam, and not a substitute for it.** This query has no `ORDER BY`, so with
 * several exams followed it returns whichever row SQLite hands back first — which is exactly
 * how the app used to end up showing the wrong exam on Home. The active exam is a stored,
 * resolved choice and lives in `examsModule/activeExamContext.tsx`; every screen reads it from
 * there.
 *
 * The one legitimate remaining caller is {@link ensureExamFollowed}, which only needs the
 * yes/no. Anything that needs to name an exam wants `useActiveExam()` or
 * {@link getFollowedExams}.
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
 * If the user isn't following any exam yet, auto-follows the first one (lowest display order)
 * from the locally-synced exam list, guaranteeing the app always has something to prepare for.
 *
 * Since first-time onboarding shipped this is the *fallback*, not the primary path — a new
 * student chooses their own exam, and this covers the cases onboarding cannot: an install that
 * predates onboarding, and a student who onboarded offline with no catalogue to choose from.
 * It deliberately stands down while onboarding is in progress; see the check below.
 *
 * It is also what makes "no exams at all" a transient state rather than a supported one: a user
 * who unfollows everything gets the first exam back on the next launch, and the active-exam
 * resolver then promotes it. Worth knowing before treating an empty My Exams as a lasting
 * condition to design for.
 *
 * Returns whether it actually followed something, so the caller can announce the change.
 * Found on a device, not by review: this write happens outside any sync, so without a signal
 * the active-exam provider had already read an empty followed list and never re-read it -- the
 * app sat with an exam followed, no active exam, and a blank "Preparing for" card until
 * something else happened to bump `syncVersion`.
 */
export async function ensureExamFollowed(): Promise<boolean> {
  const alreadyFollowed = await getFollowedExam();
  if (alreadyFollowed) return false;

  // Never pick for someone who is, at this very moment, being asked to pick.
  //
  // This is a real race, not a theoretical one: onboarding renders while the first sync runs
  // behind it, and this function is called the instant that sync finishes. Without this check
  // a student still on the exam step would silently acquire whichever exam happens to sort
  // first, and would end up following two.
  const stamps = await db
    .select({
      startedAt: appPreferences.onboardingStartedAt,
      completedAt: appPreferences.onboardingCompletedAt,
    })
    .from(appPreferences)
    .where(eq(appPreferences.key, "current"))
    .get();
  if (stamps?.startedAt && !stamps.completedAt) return false;

  const firstExam = await db.select().from(exams).orderBy(asc(exams.displayOrder)).get();
  if (firstExam) {
    await followExam(firstExam.code);
    return true;
  }
  return false;
}
