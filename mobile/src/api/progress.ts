import { apiFetch } from "./client";

export type PracticeResultPayload = {
  orderIndex: number;
  questionId: string;
  /** Nullable since backend V26 (TASK-2301 Phase P2 Wave A) — no meaning for MULTIPLE_CHOICE/TRUE_FALSE. */
  selectedIndex: number | null;
  correctIndex: number | null;
  correct: boolean;
  /**
   * Optional per-question time in milliseconds (backend V24).
   *
   * Omitted by any build before that release, and the server column is nullable, so absence
   * means "not recorded" rather than zero. Nothing consumes it in v1 -- see
   * practice/useQuestionTimer.ts.
   */
  timeMs?: number | null;

  /* -------------------------- Response model (backend V26, TASK-2301 Phase P2 Wave A) */

  /** Omitted by a build before this release — the server defaults it to "SINGLE_CHOICE". */
  questionType?: string | null;
  response?: Record<string, unknown> | null;
  outcome?: string | null;
  scoreFraction?: number | null;
};

export type PracticeSessionPayload = {
  id: string;
  completedAt: string;
  examLabel: string | null;
  subjectName: string | null;
  topicName: string | null;
  levelLabel: string | null;
  correctCount: number;
  totalCount: number;
  results: PracticeResultPayload[];
};

export type MockResultPayload = {
  orderIndex: number;
  subjectName: string | null;
  questionId: string;
  /** null = left unattempted (or a MULTIPLE_CHOICE/TRUE_FALSE answer, which has no single index). */
  selectedIndex: number | null;
  /** Nullable since backend V26 — no meaning for MULTIPLE_CHOICE/TRUE_FALSE. */
  correctIndex: number | null;
  markedForReview: boolean;
  /**
   * Optional per-question time in milliseconds (backend V24).
   *
   * Omitted by any build before that release, and the server column is nullable, so absence
   * means "not recorded" rather than zero. Nothing consumes it in v1 -- see
   * practice/useQuestionTimer.ts.
   */
  timeMs?: number | null;

  /* -------------------------- Response model (backend V26, TASK-2301 Phase P2 Wave A) */

  questionType?: string | null;
  response?: Record<string, unknown> | null;
  outcome?: string | null;
  scoreFraction?: number | null;
};

export type MockAttemptPayload = {
  id: string;
  examCode: string | null;
  examLabel: string | null;
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
  results: MockResultPayload[];
};

export type SyncPayload = {
  practiceSessions: PracticeSessionPayload[];
  mockAttempts: MockAttemptPayload[];
};

export type SyncResult = {
  practiceSessionsStored: number;
  mockAttemptsStored: number;
};

export type RestoreResult = {
  practiceSessions: PracticeSessionPayload[];
  mockAttempts: MockAttemptPayload[];
};

/** Safe to retry — the server keys on the ids the device generated. */
export function uploadProgress(token: string, payload: SyncPayload) {
  return apiFetch<SyncResult>("/progress/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: payload,
  });
}

export function restoreProgress(token: string) {
  return apiFetch<RestoreResult>("/progress", {
    headers: { Authorization: `Bearer ${token}` },
  });
}
