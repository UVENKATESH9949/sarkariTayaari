import { uploadProgress, type MockAttemptPayload, type MockResultPayload } from "@sarkaritaiyaari/core/api";
import type { EvaluationOutcome } from "@sarkaritaiyaari/core/evaluation";
import type { Question } from "../questions/types";

/**
 * A finished Mock Test attempt and where it lives — the same reasoning as
 * `practice/session.ts`, applied to attempts instead of sessions: no local database exists on
 * web, so a completed attempt is held in `sessionStorage` (survives a reload of the tab) and,
 * when signed in, also uploaded via the exact `POST /api/progress/sync` payload shape mobile
 * uses, so a web attempt becomes a real row in the same `user_mock_attempt_results` history
 * the phone app restores.
 */

export type MockResult = {
  question: Question;
  response: Record<string, unknown> | null;
  outcome: EvaluationOutcome;
  markedForReview: boolean;
};

export type CompletedMockAttempt = {
  id: string;
  examCode: string | null;
  examLabel: string | null;
  paperName: string | null;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  timeTakenSeconds: number;
  marksCorrect: number;
  marksWrong: number;
  totalMarksScored: number;
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  totalQuestions: number;
  results: MockResult[];
};

const STORAGE_PREFIX = "st_web_mock_attempt:";

export function newAttemptId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function saveCompletedAttempt(attempt: CompletedMockAttempt): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + attempt.id, JSON.stringify(attempt));
  } catch {
    // The attempt still finished — the student just can't reload the Result screen.
  }
}

export function loadCompletedAttempt(id: string): CompletedMockAttempt | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + id);
    return raw ? (JSON.parse(raw) as CompletedMockAttempt) : null;
  } catch {
    return null;
  }
}

/** Best-effort. A failed upload must never block the student from seeing their own scorecard. */
export async function uploadCompletedAttempt(token: string, attempt: CompletedMockAttempt): Promise<void> {
  const results: MockResultPayload[] = attempt.results.map((r, index) => ({
    orderIndex: index,
    subjectName: r.question.subjectName ?? null,
    questionId: r.question.id,
    selectedIndex: typeof r.response?.selectedOption === "number" ? r.response.selectedOption : null,
    correctIndex: r.question.correctIndex,
    markedForReview: r.markedForReview,
    questionType: r.question.questionType,
    response: r.response,
    outcome: r.outcome,
    scoreFraction: r.outcome === "CORRECT" ? 1 : 0,
  }));

  const payload: MockAttemptPayload = {
    id: attempt.id,
    examCode: attempt.examCode,
    examLabel: attempt.examLabel,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    durationSeconds: attempt.durationSeconds,
    timeTakenSeconds: attempt.timeTakenSeconds,
    marksCorrect: attempt.marksCorrect,
    marksWrong: attempt.marksWrong,
    totalMarksScored: attempt.totalMarksScored,
    correctCount: attempt.correctCount,
    wrongCount: attempt.wrongCount,
    unattemptedCount: attempt.unattemptedCount,
    totalQuestions: attempt.totalQuestions,
    results,
  };

  try {
    await uploadProgress(token, { practiceSessions: [], mockAttempts: [payload] });
  } catch {
    // Silently retried on the student's next sign-in-triggered sync in a later phase.
  }
}
