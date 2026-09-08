import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  difficultyLevels,
  mockTestAttemptResults,
  mockTestAttempts,
  practiceSessionResults,
  practiceSessions,
  questionExams,
  questions,
} from "../db/schema";
import { buildDifficultyScale, EVIDENCE_WINDOW_DAYS, type DifficultyScale, type EvidenceEvent } from "./topicHealth";

/**
 * Builds topic-health evidence from this device's own attempts (Weakness Radar v1, signed-out
 * path).
 *
 * The server-side equivalent is `TopicEvidenceRepository`, and this mirrors its two queries
 * exactly, including the two rules that are easy to get wrong:
 *
 * 1. **The topic comes from the question, not the attempt.** Neither result table stores a
 *    topic; both store a question id, and `questions.topic_id` is what resolves it. Same on
 *    both sides, so no new column was needed anywhere.
 * 2. **A mock question with no answer is excluded**, not counted wrong. Counting skipped
 *    questions as mistakes would manufacture weaknesses out of a student running out of time.
 *
 * Grouped in SQL rather than row-by-row in JS: a student with real history has thousands of
 * result rows, and pulling them all across the SQLite bridge to count them here is the 1+N
 * shape this codebase has now fixed five times.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Every topic this device has evidence for, keyed by topic id. */
export async function loadLocalEvidence(nowMs: number): Promise<Map<string, EvidenceEvent[]>> {
  const since = new Date(nowMs - EVIDENCE_WINDOW_DAYS * DAY_MS);

  const practiceRows = await db
    .select({
      topicId: questions.topicId,
      eventId: practiceSessionResults.sessionId,
      occurredAt: practiceSessions.completedAt,
      difficultyCode: questions.difficulty,
      pyq: questions.isPyq,
      answered: sql<number>`count(*)`,
      correct: sql<number>`sum(case when ${practiceSessionResults.isCorrect} then 1 else 0 end)`,
      totalTimeMs: sql<number | null>`sum(${practiceSessionResults.timeMs})`,
      timedAnswers: sql<number>`count(${practiceSessionResults.timeMs})`,
    })
    .from(practiceSessionResults)
    .innerJoin(practiceSessions, eq(practiceSessions.id, practiceSessionResults.sessionId))
    // Inner join, so a result whose question is no longer on this device is skipped rather
    // than attributed to nothing. That is a real case here in a way it is not on the server:
    // content sync can lag, and one device is already known to hold a frozen snapshot of the
    // question bank (see memory/STATUS.md).
    .innerJoin(questions, eq(questions.id, practiceSessionResults.questionId))
    .where(gte(practiceSessions.completedAt, since))
    .groupBy(
      questions.topicId,
      practiceSessionResults.sessionId,
      practiceSessions.completedAt,
      questions.difficulty,
      questions.isPyq,
    )
    .all();

  const mockRows = await db
    .select({
      topicId: questions.topicId,
      eventId: mockTestAttemptResults.attemptId,
      occurredAt: mockTestAttempts.completedAt,
      difficultyCode: questions.difficulty,
      pyq: questions.isPyq,
      answered: sql<number>`count(*)`,
      // Derived, because mock result rows store no boolean — unlike practice rows.
      // `outcome`, not `selectedIndex = correctIndex` (TASK-2301 Phase P2 Wave A): both are
      // null for a real, answered MULTIPLE_CHOICE/TRUE_FALSE result, which the old index
      // comparison would have silently scored as wrong. Mirrors the backend fix in
      // `TopicEvidenceRepository.mockEvidence` — see that query's own comment.
      correct: sql<number>`sum(case when ${mockTestAttemptResults.outcome} = 'CORRECT' then 1 else 0 end)`,
      totalTimeMs: sql<number | null>`sum(${mockTestAttemptResults.timeMs})`,
      timedAnswers: sql<number>`count(${mockTestAttemptResults.timeMs})`,
    })
    .from(mockTestAttemptResults)
    .innerJoin(mockTestAttempts, eq(mockTestAttempts.id, mockTestAttemptResults.attemptId))
    .innerJoin(questions, eq(questions.id, mockTestAttemptResults.questionId))
    .where(
      and(
        gte(mockTestAttempts.completedAt, since),
        // See rule 2 above. This is the single most important predicate in the file.
        ne(mockTestAttemptResults.outcome, "UNATTEMPTED"),
      ),
    )
    .groupBy(
      questions.topicId,
      mockTestAttemptResults.attemptId,
      mockTestAttempts.completedAt,
      questions.difficulty,
      questions.isPyq,
    )
    .all();

  const byTopic = new Map<string, EvidenceEvent[]>();
  for (const row of [...practiceRows, ...mockRows]) {
    const bucket = byTopic.get(row.topicId) ?? [];
    bucket.push({
      topicId: row.topicId,
      eventId: row.eventId,
      occurredAtMs: row.occurredAt.getTime(),
      difficultyCode: row.difficultyCode ?? null,
      pyq: Boolean(row.pyq),
      answered: Number(row.answered),
      correct: Number(row.correct ?? 0),
      totalTimeMs: row.totalTimeMs === null ? null : Number(row.totalTimeMs),
      timedAnswers: Number(row.timedAnswers ?? 0),
    });
    byTopic.set(row.topicId, bucket);
  }
  return byTopic;
}

/**
 * The difficulty ladder as this device knows it.
 *
 * Read from the synced `difficulty_levels` rows in display order — the same source the server
 * uses — so the two sides agree about which code is "easiest" even after an admin reorders
 * them. An empty table (a device whose reference sync has not finished) yields an empty scale,
 * which correctly drops the difficulty signal rather than guessing at it.
 */
export async function loadDifficultyScale(): Promise<DifficultyScale> {
  // No `is_active` filter: the reference sync only ever writes levels the server reports as
  // active, so every row here is already one. Filtering on a column this table does not have
  // is how the server-side and device-side notions of the ladder would quietly diverge.
  const rows = await db
    .select({ code: difficultyLevels.code, displayOrder: difficultyLevels.displayOrder })
    .from(difficultyLevels)
    .all();
  rows.sort((a, b) => a.displayOrder - b.displayOrder);
  return buildDifficultyScale(rows.map((r) => r.code));
}

/**
 * Non-deleted question counts per topic for one exam — the "can this be practised at all"
 * guard, mirroring `QuestionRepository.countByTopicForExam`.
 */
export async function loadQuestionCounts(
  examCode: string,
  topicIds: string[],
): Promise<Map<string, number>> {
  if (topicIds.length === 0) return new Map();
  const rows = await db
    .select({ topicId: questions.topicId, total: sql<number>`count(*)` })
    .from(questions)
    .innerJoin(questionExams, eq(questionExams.questionId, questions.id))
    .where(
      and(
        eq(questionExams.examCode, examCode),
        eq(questions.isDeleted, false),
        inArray(questions.topicId, topicIds),
      ),
    )
    .groupBy(questions.topicId)
    .all();
  return new Map(rows.map((r) => [r.topicId, Number(r.total)]));
}

/** PYQ-tagged question counts per topic for one exam — whether a PYQ step is offerable. */
export async function loadPyqCounts(
  examCode: string,
  topicIds: string[],
): Promise<Map<string, number>> {
  if (topicIds.length === 0) return new Map();
  const rows = await db
    .select({ topicId: questions.topicId, total: sql<number>`count(*)` })
    .from(questions)
    .innerJoin(questionExams, eq(questionExams.questionId, questions.id))
    .where(
      and(
        eq(questionExams.examCode, examCode),
        eq(questions.isDeleted, false),
        eq(questions.isPyq, true),
        inArray(questions.topicId, topicIds),
      ),
    )
    .groupBy(questions.topicId)
    .all();
  return new Map(rows.map((r) => [r.topicId, Number(r.total)]));
}
