import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./client";
import { mockTestAttemptResults, mockTestAttempts, questionExams, questions, questionTranslations } from "./schema";
import type { SyncedPaper } from "./examStructure";
import { trackEvent } from "../telemetry/analytics";
import { resolveCorrectIndex } from "./answerResolution";

export type MockTestQuestion = {
  id: string;
  sectionName: string;
  subjectName: string;
  correctIndex: number;
  translations: Record<string, { questionText: string; options: string[]; explanation: string }>;
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

    const matched = await db
      .select({
        id: questions.id,
        correctAnswer: questions.correctAnswer,
        subjectName: questions.subjectName,
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
      .limit(section.questionCount)
      .all();

    if (matched.length === 0) continue;

    const questionIds = matched.map((q) => q.id);
    const translationRows = await db
      .select()
      .from(questionTranslations)
      .where(inArray(questionTranslations.questionId, questionIds))
      .all();

    const translationsByQuestion = new Map<string, Record<string, { questionText: string; options: string[]; explanation: string }>>();
    for (const row of translationRows) {
      const forQuestion = translationsByQuestion.get(row.questionId) ?? {};
      forQuestion[row.languageCode] = {
        questionText: row.questionText,
        options: row.options,
        explanation: row.explanation ?? "",
      };
      translationsByQuestion.set(row.questionId, forQuestion);
    }

    for (const q of matched) {
      const translations = translationsByQuestion.get(q.id) ?? {};
      const englishOptions = translations.en?.options ?? Object.values(translations)[0]?.options ?? [];
      const correctIndex = resolveCorrectIndex(q.correctAnswer, englishOptions);

      all.push({
        id: q.id,
        sectionName: section.name,
        subjectName: q.subjectName,
        correctIndex,
        translations,
      });
    }
  }

  return all;
}

export type MockTestResultItem = {
  questionId: string;
  subjectName: string;
  questionText: string;
  options: string[];
  selectedIndex: number | null;
  correctIndex: number;
  explanation: string;
  markedForReview: boolean;
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
    results: resultRows.map((r) => ({
      questionId: r.questionId,
      subjectName: r.subjectName,
      questionText: r.questionText,
      options: r.options,
      selectedIndex: r.selectedIndex,
      correctIndex: r.correctIndex,
      explanation: r.explanation,
      markedForReview: r.markedForReview,
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
