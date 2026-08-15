import { asc, eq } from "drizzle-orm";
import { db } from "./client";
import { exams, followedExams } from "./schema";

export type FollowedExam = {
  code: string;
  name: string;
};

/** Returns the exam the user is currently preparing for, or null if none is followed yet. */
export async function getFollowedExam(): Promise<FollowedExam | null> {
  const row = await db
    .select({ code: exams.code, name: exams.name })
    .from(followedExams)
    .innerJoin(exams, eq(followedExams.examCode, exams.code))
    .get();
  return row ?? null;
}

export async function followExam(examCode: string): Promise<void> {
  await db
    .insert(followedExams)
    .values({ examCode, followedAt: new Date() })
    .onConflictDoNothing();
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
