import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./client";
import { mockTestAttemptResults, mockTestAttempts, questionExams, questions, questionTranslations } from "./schema";
import type { SyncedPaper } from "./examStructure";
import type { AdHocMockSpec } from "../mockHub/types";
import { trackEvent } from "../telemetry/analytics";
import { isIndexBasedType, resolveCorrectIndex } from "@sarkaritaiyaari/core/evaluation";
import { packRandomSample } from "./questionGroupAssembly";

/**
 * How much bigger the random candidate pool is than the number of questions actually
 * needed, before group-aware packing (TASK-2301 Phase P3) whittles it down — mirrors the
 * backend's `QuestionRepositoryImpl.sampleForMock` bounds exactly, so a section's grouped
 * content has the same real chance of being represented locally as it does server-side.
 */
const CANDIDATE_POOL_MULTIPLIER = 20;
const CANDIDATE_POOL_MIN = 500;
const CANDIDATE_POOL_MAX = 5000;

type MockCandidateRow = {
  id: string;
  correctAnswer: string;
  subjectName: string;
  questionType: string | null;
  answerKey: Record<string, unknown> | null;
  contentStructure: Record<string, unknown> | null;
  questionGroupId: string | null;
};

/** Every non-deleted sibling of a group, in authoring order — a group is always sampled as one atomic unit, never split. */
async function fullGroupChildren(groupId: string): Promise<MockCandidateRow[]> {
  return db
    .select({
      id: questions.id,
      correctAnswer: questions.correctAnswer,
      subjectName: questions.subjectName,
      questionType: questions.questionType,
      answerKey: questions.answerKey,
      contentStructure: questions.contentStructure,
      questionGroupId: questions.questionGroupId,
    })
    .from(questions)
    .where(and(eq(questions.questionGroupId, groupId), eq(questions.isDeleted, false)))
    .orderBy(questions.groupOrder)
    .all();
}

export type MockTestQuestion = {
  id: string;
  sectionName: string;
  subjectName: string;
  /** null for MULTIPLE_CHOICE/TRUE_FALSE — see PracticeQuestion's identical note (TASK-2301 Phase P2 Wave A). */
  correctIndex: number | null;
  questionType?: string;
  answerKey?: Record<string, unknown> | null;
  contentStructure?: Record<string, unknown> | null;
  /** Set when this question belongs to a shared passage/group (TASK-2301 Phase P3) — null for a standalone question. */
  questionGroupId?: string | null;
  translations: Record<
    string,
    { questionText: string; options: string[]; explanation: string; content?: Record<string, unknown> | null }
  >;
};

export type SectionAvailability = {
  sectionName: string;
  requested: number;
  available: number;
  durationMinutes: number | null;
};

/**
 * Sections carry real subject ids now, so this no longer matches subjects by name —
 * renaming a subject in the admin can't silently empty a section any more.
 */
async function countAvailable(subjectIds: string[], examCode: string): Promise<number> {
  if (subjectIds.length === 0) return 0;
  const row = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(questions)
    .innerJoin(questionExams, eq(questionExams.questionId, questions.id))
    .where(
      and(
        inArray(questions.subjectId, subjectIds),
        eq(questionExams.examCode, examCode),
        eq(questions.isDeleted, false),
      ),
    )
    .get();
  return row?.cnt ?? 0;
}

/** Real achievable question counts per section, so the Start screen can show honest numbers before the test begins. */
export async function getSectionAvailability(paper: SyncedPaper): Promise<SectionAvailability[]> {
  const results: SectionAvailability[] = [];
  for (const section of paper.sections) {
    const available = await countAvailable(section.subjectIds, paper.examCode);
    results.push({
      sectionName: section.name,
      requested: section.questionCount,
      available: Math.min(available, section.questionCount),
      durationMinutes: section.durationMinutes,
    });
  }
  return results;
}

/** Assembles the real, shuffled question set for a mock test attempt, section by section. */
export async function buildMockTestQuestions(paper: SyncedPaper): Promise<MockTestQuestion[]> {
  const all: MockTestQuestion[] = [];

  for (const section of paper.sections) {
    if (section.subjectIds.length === 0) continue;

    const sampleSize = Math.min(
      Math.max(section.questionCount * CANDIDATE_POOL_MULTIPLIER, CANDIDATE_POOL_MIN),
      CANDIDATE_POOL_MAX,
    );

    const candidates = await db
      .select({
        id: questions.id,
        correctAnswer: questions.correctAnswer,
        subjectName: questions.subjectName,
        questionType: questions.questionType,
        answerKey: questions.answerKey,
        contentStructure: questions.contentStructure,
        questionGroupId: questions.questionGroupId,
      })
      .from(questions)
      .innerJoin(questionExams, eq(questionExams.questionId, questions.id))
      .where(
        and(
          inArray(questions.subjectId, section.subjectIds),
          eq(questionExams.examCode, paper.examCode),
          eq(questions.isDeleted, false),
        ),
      )
      .orderBy(sql`RANDOM()`)
      .limit(sampleSize)
      .all();

    if (candidates.length === 0) continue;

    const matched = await packRandomSample(candidates, section.questionCount, fullGroupChildren);

    if (matched.length === 0) continue;

    const questionIds = matched.map((q) => q.id);
    const translationRows = await db
      .select()
      .from(questionTranslations)
      .where(inArray(questionTranslations.questionId, questionIds))
      .all();

    const translationsByQuestion = new Map<
      string,
      Record<string, { questionText: string; options: string[]; explanation: string; content?: Record<string, unknown> | null }>
    >();
    for (const row of translationRows) {
      const forQuestion = translationsByQuestion.get(row.questionId) ?? {};
      forQuestion[row.languageCode] = {
        questionText: row.questionText,
        options: row.options,
        explanation: row.explanation ?? "",
        content: row.content,
      };
      translationsByQuestion.set(row.questionId, forQuestion);
    }

    for (const q of matched) {
      const translations = translationsByQuestion.get(q.id) ?? {};
      const englishOptions = translations.en?.options ?? Object.values(translations)[0]?.options ?? [];
      const questionType = q.questionType ?? "SINGLE_CHOICE";
      const correctIndex = isIndexBasedType(questionType)
        ? resolveCorrectIndex(q.correctAnswer, englishOptions)
        : null;

      all.push({
        id: q.id,
        sectionName: section.name,
        subjectName: q.subjectName,
        correctIndex,
        questionType,
        answerKey: q.answerKey,
        contentStructure: q.contentStructure,
        questionGroupId: q.questionGroupId,
        translations,
      });
    }
  }

  return all;
}

/**
 * The Mock Test Hub's ad-hoc formats (Topic/Subject/Multi-Subject/Speed/Difficulty/PYQ/Weak
 * Area Mock) — a single flat pool with no real Stage/Paper/Section behind it, so this shares
 * `buildMockTestQuestions`'s query shape and pooling constants but samples once rather than
 * once per section. Revision Mock skips sampling entirely — see `spec.questionIds`.
 */
export async function countAdHocAvailable(spec: AdHocMockSpec): Promise<number> {
  if (spec.questionIds && spec.questionIds.length > 0) {
    const rows = await db
      .select({ id: questions.id })
      .from(questions)
      .where(and(inArray(questions.id, spec.questionIds), eq(questions.isDeleted, false)))
      .all();
    return Math.min(rows.length, spec.questionCount);
  }
  if (spec.subjectIds.length === 0) return 0;

  const conditions = [inArray(questions.subjectId, spec.subjectIds), eq(questions.isDeleted, false)];
  if (spec.topicIds && spec.topicIds.length > 0) conditions.push(inArray(questions.topicId, spec.topicIds));
  if (spec.difficultyCode) conditions.push(eq(questions.difficulty, spec.difficultyCode));
  if (spec.pyqOnly) conditions.push(eq(questions.isPyq, true));

  const row = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(questions)
    .innerJoin(questionExams, eq(questionExams.questionId, questions.id))
    .where(and(...conditions, eq(questionExams.examCode, spec.examCode)))
    .get();
  return Math.min(row?.cnt ?? 0, spec.questionCount);
}

/** Assembles the real, shuffled question set for an ad-hoc mock attempt — see `countAdHocAvailable`. */
export async function buildAdHocMockQuestionsLocal(spec: AdHocMockSpec): Promise<MockTestQuestion[]> {
  let matched: MockCandidateRow[];

  if (spec.questionIds && spec.questionIds.length > 0) {
    matched = await db
      .select({
        id: questions.id,
        correctAnswer: questions.correctAnswer,
        subjectName: questions.subjectName,
        questionType: questions.questionType,
        answerKey: questions.answerKey,
        contentStructure: questions.contentStructure,
        questionGroupId: questions.questionGroupId,
      })
      .from(questions)
      .where(and(inArray(questions.id, spec.questionIds), eq(questions.isDeleted, false)))
      .orderBy(sql`RANDOM()`)
      .all();
  } else {
    if (spec.subjectIds.length === 0) return [];

    const sampleSize = Math.min(
      Math.max(spec.questionCount * CANDIDATE_POOL_MULTIPLIER, CANDIDATE_POOL_MIN),
      CANDIDATE_POOL_MAX,
    );

    const conditions = [inArray(questions.subjectId, spec.subjectIds), eq(questions.isDeleted, false)];
    if (spec.topicIds && spec.topicIds.length > 0) conditions.push(inArray(questions.topicId, spec.topicIds));
    if (spec.difficultyCode) conditions.push(eq(questions.difficulty, spec.difficultyCode));
    if (spec.pyqOnly) conditions.push(eq(questions.isPyq, true));

    const candidates = await db
      .select({
        id: questions.id,
        correctAnswer: questions.correctAnswer,
        subjectName: questions.subjectName,
        questionType: questions.questionType,
        answerKey: questions.answerKey,
        contentStructure: questions.contentStructure,
        questionGroupId: questions.questionGroupId,
      })
      .from(questions)
      .innerJoin(questionExams, eq(questionExams.questionId, questions.id))
      .where(and(...conditions, eq(questionExams.examCode, spec.examCode)))
      .orderBy(sql`RANDOM()`)
      .limit(sampleSize)
      .all();

    if (candidates.length === 0) return [];

    matched = await packRandomSample(candidates, spec.questionCount, fullGroupChildren);
  }

  if (matched.length === 0) return [];

  const questionIds = matched.map((q) => q.id);
  const translationRows = await db
    .select()
    .from(questionTranslations)
    .where(inArray(questionTranslations.questionId, questionIds))
    .all();

  const translationsByQuestion = new Map<
    string,
    Record<string, { questionText: string; options: string[]; explanation: string; content?: Record<string, unknown> | null }>
  >();
  for (const row of translationRows) {
    const forQuestion = translationsByQuestion.get(row.questionId) ?? {};
    forQuestion[row.languageCode] = {
      questionText: row.questionText,
      options: row.options,
      explanation: row.explanation ?? "",
      content: row.content,
    };
    translationsByQuestion.set(row.questionId, forQuestion);
  }

  return matched.map((q) => {
    const translations = translationsByQuestion.get(q.id) ?? {};
    const englishOptions = translations.en?.options ?? Object.values(translations)[0]?.options ?? [];
    const questionType = q.questionType ?? "SINGLE_CHOICE";
    const correctIndex = isIndexBasedType(questionType)
      ? resolveCorrectIndex(q.correctAnswer, englishOptions)
      : null;

    return {
      id: q.id,
      sectionName: spec.title,
      subjectName: q.subjectName,
      correctIndex,
      questionType,
      answerKey: q.answerKey,
      contentStructure: q.contentStructure,
      questionGroupId: q.questionGroupId,
      translations,
    };
  });
}

export type MockTestResultItem = {
  questionId: string;
  subjectName: string;
  questionText: string;
  options: string[];
  selectedIndex: number | null;
  /** Nullable since TASK-2301 Phase P2 Wave A — no meaning for MULTIPLE_CHOICE/TRUE_FALSE. */
  correctIndex: number | null;
  explanation: string;
  markedForReview: boolean;
  /**
   * Milliseconds this question was on screen, or null when it was not measured (§9).
   *
   * Nothing reads it yet -- see practice/useQuestionTimer.ts for why capture starts before
   * the signal is usable. Null, never 0: a zero would claim an instant answer.
   */
  timeMs?: number | null;

  /* -------------------------- Response model (TASK-2301 Phase P2 Wave A) */

  /** "SINGLE_CHOICE" when absent — every question built before this phase is one. */
  questionType?: string | null;
  response?: Record<string, unknown> | null;
  outcome?: string | null;
  scoreFraction?: number | null;
};

export type MockTestAttemptRecord = {
  id: string;
  examCode: string;
  examLabel: string;
  startedAt: number;
  completedAt: number;
  durationSeconds: number;
  timeTakenSeconds: number;
  marksCorrect: number;
  marksWrong: number;
  totalMarksScored: number;
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  totalQuestions: number;
  results: MockTestResultItem[];
  /**
   * TASK-2701 Phase 7.2 — the AI-phrased feedback narrative, cached after first generation so
   * reopening this attempt from history doesn't regenerate it. Null for every attempt before
   * this feature and for any attempt that never had feedback generated (flag off, offline, or
   * generation failed) — a normal, silent state.
   */
  feedbackNarrative?: string | null;
  feedbackGeneratedAt?: number | null;
};

export async function insertMockTestAttempt(attempt: MockTestAttemptRecord): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(mockTestAttempts).values({
      id: attempt.id,
      examCode: attempt.examCode,
      examLabel: attempt.examLabel,
      startedAt: new Date(attempt.startedAt),
      completedAt: new Date(attempt.completedAt),
      durationSeconds: attempt.durationSeconds,
      timeTakenSeconds: attempt.timeTakenSeconds,
      marksCorrect: attempt.marksCorrect,
      marksWrong: attempt.marksWrong,
      totalMarksScored: attempt.totalMarksScored,
      correctCount: attempt.correctCount,
      wrongCount: attempt.wrongCount,
      unattemptedCount: attempt.unattemptedCount,
      totalQuestions: attempt.totalQuestions,
    });

    // Single batch insert (one statement, N value tuples) instead of N
    // separately-awaited inserts — with ~80-100 questions per attempt, doing
    // them one at a time made submitting visibly slow (~7s) purely from
    // per-call bridge overhead, not actual SQLite execution time.
    await tx.insert(mockTestAttemptResults).values(
      attempt.results.map((result, index) => ({
        id: `${attempt.id}:${result.questionId}`,
        attemptId: attempt.id,
        orderIndex: index,
        subjectName: result.subjectName,
        questionId: result.questionId,
        questionText: result.questionText,
        options: result.options,
        selectedIndex: result.selectedIndex,
        correctIndex: result.correctIndex,
        explanation: result.explanation,
        markedForReview: result.markedForReview,
        timeMs: result.timeMs ?? null,
        questionType: result.questionType ?? "SINGLE_CHOICE",
        response: result.response ?? null,
        outcome: result.outcome ?? null,
        scoreFraction: result.scoreFraction ?? null,
      })),
    );
  });

  trackEvent("mock_attempt_completed", {
    examCode: attempt.examCode,
    totalMarksScored: attempt.totalMarksScored,
    totalQuestions: attempt.totalQuestions,
  });
}

export async function getMockTestAttempt(attemptId: string): Promise<MockTestAttemptRecord | null> {
  const attempt = await db.select().from(mockTestAttempts).where(eq(mockTestAttempts.id, attemptId)).get();
  if (!attempt) return null;

  const resultRows = await db
    .select()
    .from(mockTestAttemptResults)
    .where(eq(mockTestAttemptResults.attemptId, attemptId))
    .all();
  resultRows.sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    id: attempt.id,
    examCode: attempt.examCode,
    examLabel: attempt.examLabel,
    startedAt: attempt.startedAt.getTime(),
    completedAt: attempt.completedAt.getTime(),
    durationSeconds: attempt.durationSeconds,
    timeTakenSeconds: attempt.timeTakenSeconds,
    marksCorrect: attempt.marksCorrect,
    marksWrong: attempt.marksWrong,
    totalMarksScored: attempt.totalMarksScored,
    correctCount: attempt.correctCount,
    wrongCount: attempt.wrongCount,
    unattemptedCount: attempt.unattemptedCount,
    totalQuestions: attempt.totalQuestions,
    feedbackNarrative: attempt.feedbackNarrative,
    feedbackGeneratedAt: attempt.feedbackGeneratedAt ? attempt.feedbackGeneratedAt.getTime() : null,
    results: resultRows.map((r) => ({
      questionId: r.questionId,
      subjectName: r.subjectName,
      questionText: r.questionText,
      options: r.options,
      selectedIndex: r.selectedIndex,
      correctIndex: r.correctIndex,
      explanation: r.explanation,
      markedForReview: r.markedForReview,
      timeMs: r.timeMs,
      questionType: r.questionType,
      response: r.response,
      outcome: r.outcome,
      scoreFraction: r.scoreFraction,
    })),
  };
}

export async function loadMockTestAttempts(): Promise<MockTestAttemptRecord[]> {
  const rows = await db.select().from(mockTestAttempts).all();
  rows.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  const full = await Promise.all(rows.map((r) => getMockTestAttempt(r.id)));
  return full.filter((r): r is MockTestAttemptRecord => r !== null);
}

export type MockAttemptSummary = {
  attempted: number;
  bestScore: number;
  avgTimeSeconds: number;
};

/**
 * Backs the exam-list "N/M taken" progress row and the per-exam tier screen's
 * Attempted/Best Score/Avg Time stat row. Deliberately reads only the two columns it
 * needs from mockTestAttempts rather than loadMockTestAttempts()'s full per-question
 * results join — this is a lightweight summary, not a detail view. Returns null (not a
 * zeroed object) when the exam has never been attempted, so the caller can omit the row
 * instead of showing a fabricated 0.
 */
export async function getMockAttemptSummary(examCode: string): Promise<MockAttemptSummary | null> {
  const rows = await db
    .select({ totalMarksScored: mockTestAttempts.totalMarksScored, timeTakenSeconds: mockTestAttempts.timeTakenSeconds })
    .from(mockTestAttempts)
    .where(eq(mockTestAttempts.examCode, examCode))
    .all();

  if (rows.length === 0) return null;

  return {
    attempted: rows.length,
    bestScore: Math.max(...rows.map((r) => r.totalMarksScored)),
    avgTimeSeconds: Math.round(rows.reduce((sum, r) => sum + r.timeTakenSeconds, 0) / rows.length),
  };
}

/**
 * TASK-2701 Phase 7.2 — caches an AI-phrased feedback narrative against an already-saved mock
 * attempt, mirroring `db/practiceSessions.ts`'s `saveSessionFeedback`. A no-op (0 rows
 * affected) if the attempt id doesn't exist locally, which should not happen in practice —
 * `getOrBuildMockFeedback` always calls this against an attempt just written by
 * `insertMockTestAttempt` in the same screen's lifecycle.
 */
export async function saveMockAttemptFeedback(attemptId: string, narrative: string): Promise<void> {
  await db
    .update(mockTestAttempts)
    .set({ feedbackNarrative: narrative, feedbackGeneratedAt: new Date() })
    .where(eq(mockTestAttempts.id, attemptId));
}
