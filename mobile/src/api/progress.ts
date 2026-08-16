import { apiFetch } from "./client";

export type PracticeResultPayload = {
  orderIndex: number;
  questionId: string;
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
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
  /** null = left unattempted. */
  selectedIndex: number | null;
  correctIndex: number;
  markedForReview: boolean;
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
