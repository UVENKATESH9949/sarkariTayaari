import { asc, desc, eq, lt } from "drizzle-orm";
import { db } from "./client";
import { practiceSessionResults, practiceSessions } from "./schema";
import { trackEvent } from "../telemetry/analytics";

export type QuestionResult = {
  questionId: string;
  questionText: string;
  options: string[];
  selectedIndex: number;
  correctIndex: number;
  explanation: string;
  isCorrect: boolean;
};

export type SessionRecord = {
  id: string;
  completedAt: number;
  examLabel: string;
  subjectName: string;
  topicName: string;
  levelLabel: string;
  correctCount: number;
  totalCount: number;
  /** Null for sessions recorded before this field existed. */
  durationMs: number | null;
  results: QuestionResult[];
};

const MAX_SESSIONS = 50;

export async function loadSessions(): Promise<SessionRecord[]> {
  const sessionRows = await db.select().from(practiceSessions).orderBy(desc(practiceSessions.completedAt)).all();

  const sessions: SessionRecord[] = [];
  for (const row of sessionRows) {
    const resultRows = await db
      .select()
      .from(practiceSessionResults)
      .where(eq(practiceSessionResults.sessionId, row.id))
      .orderBy(asc(practiceSessionResults.orderIndex))
      .all();

    sessions.push({
      id: row.id,
      completedAt: row.completedAt.getTime(),
      examLabel: row.examLabel,
      subjectName: row.subjectName,
      topicName: row.topicName,
      levelLabel: row.levelLabel,
      correctCount: row.correctCount,
      totalCount: row.totalCount,
      durationMs: row.durationMs,
      results: resultRows.map((r) => ({
        questionId: r.questionId,
        questionText: r.questionText,
        options: r.options,
        selectedIndex: r.selectedIndex,
        correctIndex: r.correctIndex,
        explanation: r.explanation,
        isCorrect: r.isCorrect,
      })),
    });
  }
  return sessions;
}

/** Persists a session and trims history back down to the most recent MAX_SESSIONS. */
export async function insertSession(session: SessionRecord): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(practiceSessions).values({
      id: session.id,
      completedAt: new Date(session.completedAt),
      examLabel: session.examLabel,
      subjectName: session.subjectName,
      topicName: session.topicName,
      levelLabel: session.levelLabel,
      correctCount: session.correctCount,
      totalCount: session.totalCount,
      durationMs: session.durationMs,
    });

    for (const [index, result] of session.results.entries()) {
      await tx.insert(practiceSessionResults).values({
        id: `${session.id}:${result.questionId}`,
        sessionId: session.id,
        orderIndex: index,
        questionId: result.questionId,
        questionText: result.questionText,
        options: result.options,
        selectedIndex: result.selectedIndex,
        correctIndex: result.correctIndex,
        explanation: result.explanation,
        isCorrect: result.isCorrect,
      });
    }

    const overflow = await tx
      .select({ completedAt: practiceSessions.completedAt })
      .from(practiceSessions)
      .orderBy(desc(practiceSessions.completedAt))
      .limit(1)
      .offset(MAX_SESSIONS)
      .get();

    if (overflow) {
      const stale = await tx
        .select({ id: practiceSessions.id })
        .from(practiceSessions)
        .where(lt(practiceSessions.completedAt, overflow.completedAt))
        .all();

      for (const s of stale) {
        await tx.delete(practiceSessionResults).where(eq(practiceSessionResults.sessionId, s.id));
        await tx.delete(practiceSessions).where(eq(practiceSessions.id, s.id));
      }
    }
  });

  trackEvent("practice_session_completed", { correctCount: session.correctCount, totalCount: session.totalCount });
}

export async function clearAllSessions(): Promise<void> {
  await db.delete(practiceSessionResults);
  await db.delete(practiceSessions);
}
