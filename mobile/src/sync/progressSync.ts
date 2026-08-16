import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  mockTestAttemptResults,
  mockTestAttempts,
  practiceSessionResults,
  practiceSessions,
  questionTranslations,
} from "../db/schema";
import {
  restoreProgress,
  uploadProgress,
  type MockAttemptPayload,
  type PracticeSessionPayload,
} from "../api/progress";

export type ProgressSyncResult = {
  uploadedSessions: number;
  uploadedAttempts: number;
  restoredSessions: number;
  restoredAttempts: number;
};

const MISSING_QUESTION_TEXT = "This question is no longer available.";

/**
 * Pushes anything not yet accepted by the server.
 *
 * Sessions are written locally the moment they finish and uploaded afterwards, so
 * finishing a practice run never waits on the network. Rows stay flagged unsynced until
 * the server confirms, and the server keys on the device's own ids — so a retry after a
 * lost response overwrites rather than duplicating.
 */
export async function uploadPendingProgress(token: string): Promise<{ sessions: number; attempts: number }> {
  const pendingSessions = await db.select().from(practiceSessions).where(eq(practiceSessions.isSynced, false)).all();
  const pendingAttempts = await db.select().from(mockTestAttempts).where(eq(mockTestAttempts.isSynced, false)).all();

  if (pendingSessions.length === 0 && pendingAttempts.length === 0) {
    return { sessions: 0, attempts: 0 };
  }

  const sessionIds = pendingSessions.map((s) => s.id);
  const attemptIds = pendingAttempts.map((a) => a.id);

  const sessionResults = sessionIds.length
    ? await db.select().from(practiceSessionResults).where(inArray(practiceSessionResults.sessionId, sessionIds)).all()
    : [];
  const attemptResults = attemptIds.length
    ? await db.select().from(mockTestAttemptResults).where(inArray(mockTestAttemptResults.attemptId, attemptIds)).all()
    : [];

  const payload = {
    practiceSessions: pendingSessions.map<PracticeSessionPayload>((session) => ({
      id: session.id,
      completedAt: session.completedAt.toISOString(),
      examLabel: session.examLabel,
      subjectName: session.subjectName,
      topicName: session.topicName,
      levelLabel: session.levelLabel,
      correctCount: session.correctCount,
      totalCount: session.totalCount,
      // Only ids and answers travel — the question text is already on every device.
      results: sessionResults
        .filter((r) => r.sessionId === session.id)
        .map((r) => ({
          orderIndex: r.orderIndex,
          questionId: r.questionId,
          selectedIndex: r.selectedIndex,
          correctIndex: r.correctIndex,
          correct: r.isCorrect,
        })),
    })),
    mockAttempts: pendingAttempts.map<MockAttemptPayload>((attempt) => ({
      id: attempt.id,
      examCode: attempt.examCode,
      examLabel: attempt.examLabel,
      startedAt: attempt.startedAt.toISOString(),
      completedAt: attempt.completedAt.toISOString(),
      durationSeconds: attempt.durationSeconds,
      timeTakenSeconds: attempt.timeTakenSeconds,
      marksCorrect: attempt.marksCorrect,
      marksWrong: attempt.marksWrong,
      totalMarksScored: attempt.totalMarksScored,
      correctCount: attempt.correctCount,
      wrongCount: attempt.wrongCount,
      unattemptedCount: attempt.unattemptedCount,
      totalQuestions: attempt.totalQuestions,
      results: attemptResults
        .filter((r) => r.attemptId === attempt.id)
        .map((r) => ({
          orderIndex: r.orderIndex,
          subjectName: r.subjectName,
          questionId: r.questionId,
          selectedIndex: r.selectedIndex,
          correctIndex: r.correctIndex,
          markedForReview: r.markedForReview,
        })),
    })),
  };

  await uploadProgress(token, payload);

  // Only flag as synced once the server has actually accepted them. A failure here
  // leaves everything pending, and the next attempt sends it again.
  if (sessionIds.length) {
    await db.update(practiceSessions).set({ isSynced: true }).where(inArray(practiceSessions.id, sessionIds));
  }
  if (attemptIds.length) {
    await db.update(mockTestAttempts).set({ isSynced: true }).where(inArray(mockTestAttempts.id, attemptIds));
  }

  return { sessions: pendingSessions.length, attempts: pendingAttempts.length };
}

/**
 * Pulls this account's history down onto a device that does not have it — the point of
 * the whole feature. Rows already present are left alone, so signing in on a device that
 * already has local history merges rather than overwrites.
 */
export async function restoreProgressFromServer(token: string): Promise<{ sessions: number; attempts: number }> {
  const remote = await restoreProgress(token);

  const existingSessions = new Set((await db.select({ id: practiceSessions.id }).from(practiceSessions).all()).map((r) => r.id));
  const existingAttempts = new Set((await db.select({ id: mockTestAttempts.id }).from(mockTestAttempts).all()).map((r) => r.id));

  const newSessions = remote.practiceSessions.filter((s) => !existingSessions.has(s.id));
  const newAttempts = remote.mockAttempts.filter((a) => !existingAttempts.has(a.id));

  // Question text is not stored server-side, so rebuild it from the synced bank.
  const questionIds = [
    ...newSessions.flatMap((s) => s.results.map((r) => r.questionId)),
    ...newAttempts.flatMap((a) => a.results.map((r) => r.questionId)),
  ];
  const textById = await loadQuestionText(questionIds);

  await db.transaction(async (tx) => {
    for (const session of newSessions) {
      await tx.insert(practiceSessions).values({
        id: session.id,
        completedAt: new Date(session.completedAt),
        examLabel: session.examLabel ?? "",
        subjectName: session.subjectName ?? "",
        topicName: session.topicName ?? "",
        levelLabel: session.levelLabel ?? "",
        correctCount: session.correctCount,
        totalCount: session.totalCount,
        isSynced: true,
      });

      if (session.results.length) {
        await tx.insert(practiceSessionResults).values(
          session.results.map((r) => {
            const q = textById.get(r.questionId);
            return {
              id: `${session.id}:${r.orderIndex}`,
              sessionId: session.id,
              orderIndex: r.orderIndex,
              questionId: r.questionId,
              questionText: q?.questionText ?? MISSING_QUESTION_TEXT,
              options: q?.options ?? [],
              selectedIndex: r.selectedIndex,
              correctIndex: r.correctIndex,
              explanation: q?.explanation ?? "",
              isCorrect: r.correct,
            };
          }),
        );
      }
    }

    for (const attempt of newAttempts) {
      await tx.insert(mockTestAttempts).values({
        id: attempt.id,
        examCode: attempt.examCode ?? "",
        examLabel: attempt.examLabel ?? "",
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
        isSynced: true,
      });

      if (attempt.results.length) {
        await tx.insert(mockTestAttemptResults).values(
          attempt.results.map((r) => {
            const q = textById.get(r.questionId);
            return {
              id: `${attempt.id}:${r.orderIndex}`,
              attemptId: attempt.id,
              orderIndex: r.orderIndex,
              subjectName: r.subjectName ?? "",
              questionId: r.questionId,
              questionText: q?.questionText ?? MISSING_QUESTION_TEXT,
              options: q?.options ?? [],
              selectedIndex: r.selectedIndex,
              correctIndex: r.correctIndex,
              explanation: q?.explanation ?? "",
              markedForReview: r.markedForReview,
            };
          }),
        );
      }
    }
  });

  return { sessions: newSessions.length, attempts: newAttempts.length };
}

/** Both directions in one pass: push what's pending, then pull anything missing. */
export async function syncProgress(token: string): Promise<ProgressSyncResult> {
  const uploaded = await uploadPendingProgress(token);
  const restored = await restoreProgressFromServer(token);
  return {
    uploadedSessions: uploaded.sessions,
    uploadedAttempts: uploaded.attempts,
    restoredSessions: restored.sessions,
    restoredAttempts: restored.attempts,
  };
}

type QuestionText = { questionText: string; options: string[]; explanation: string };

async function loadQuestionText(questionIds: string[]): Promise<Map<string, QuestionText>> {
  const unique = [...new Set(questionIds)];
  if (unique.length === 0) return new Map();

  const rows = await db
    .select()
    .from(questionTranslations)
    .where(inArray(questionTranslations.questionId, unique))
    .all();

  const byId = new Map<string, QuestionText>();
  for (const row of rows) {
    // Prefer English; fall back to whichever translation arrived first.
    if (row.languageCode === "en" || !byId.has(row.questionId)) {
      byId.set(row.questionId, {
        questionText: row.questionText,
        options: row.options,
        explanation: row.explanation ?? "",
      });
    }
  }
  return byId;
}
