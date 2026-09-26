import { inArray } from "drizzle-orm";
import { db } from "./client";
import { questions } from "./schema";

export type QuestionSubtopicMeta = {
  topicName: string | null;
  difficultyCode: string | null;
};

/**
 * Batch lookup of each question's own topic name / difficulty code — the "sub-topic" grouping
 * key for the Practice Result Analytics tab (`practiceResultAnalytics.ts`). A Practice session's
 * `results` carry no topic/difficulty of their own (see `db/practiceSessions.ts`'s
 * `QuestionResult`), but the already-synced local `questions` table does, keyed by the same
 * `questionId` every result already has — so this needs no new column and no server round trip.
 *
 * A question missing from the local table (deleted since, or synced questions cleared) simply
 * has no entry in the returned map; callers treat that as "unknown sub-topic", the same way
 * `session.results` already tolerates a stale/missing question elsewhere in this app.
 */
export async function getQuestionSubtopicMeta(questionIds: string[]): Promise<Map<string, QuestionSubtopicMeta>> {
  const map = new Map<string, QuestionSubtopicMeta>();
  if (questionIds.length === 0) return map;

  const rows = await db
    .select({ id: questions.id, topicName: questions.topicName, difficulty: questions.difficulty })
    .from(questions)
    .where(inArray(questions.id, questionIds))
    .all();

  for (const row of rows) {
    map.set(row.id, { topicName: row.topicName, difficultyCode: row.difficulty });
  }
  return map;
}
