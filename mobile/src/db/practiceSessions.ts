import { asc, desc, inArray, lt } from "drizzle-orm";
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
  /** Null for sessions recorded before this field existed, and for the "All Government
   * Exams" shortcut, which spans every exam at once. */
  examCode: string | null;
  subjectName: string;
  topicName: string;
  levelLabel: string;
  correctCount: number;
  /**
   * Questions ANSWERED — the denominator of every accuracy figure in the app. Equal to
   * the size of the question set only when the user answered all of it, which stopped
   * being mandatory when early finishing was added (Doc 2 §7).
   */
  totalCount: number;
  /**
   * How many questions the set offered. Null for sessions recorded before this field
   * existed, and for any session read back from the server, which does not carry it.
   *
   * For display only ("17 of 50 attempted"). Deliberately never a denominator: a student
   * who answered 17 and got 15 right has 88% accuracy, not 30%.
   */
  availableCount: number | null;
  /** Null for sessions recorded before this field existed. */
  durationMs: number | null;
  results: QuestionResult[];
};

const MAX_SESSIONS = 50;

/**
 * Two queries total, not 1 + N.
 *
 * This runs at app startup for every user, unconditionally — `SessionHistoryProvider`
 * mounts above the whole tab tree — so its cost is paid on the critical path before
 * anything renders. It previously issued one sequentially-awaited query per session
 * (51 round trips through the SQLite JS bridge at a full history) and had no `LIMIT`
 * despite `MAX_SESSIONS` being declared right above it. `db/mockTest.ts` already used
 * the `inArray` shape this now follows.
 */
export async function loadSessions(): Promise<SessionRecord[]> {
  const sessionRows = await db
    .select()
    .from(practiceSessions)
    .orderBy(desc(practiceSessions.completedAt))
    .limit(MAX_SESSIONS)
    .all();

  if (sessionRows.length === 0) return [];

  const resultRows = await db
    .select()
    .from(practiceSessionResults)
    .where(
      inArray(
        practiceSessionResults.sessionId,
        sessionRows.map((r) => r.id),
      ),
    )
    .orderBy(asc(practiceSessionResults.orderIndex))
    .all();

  // Grouped in one pass rather than a .filter() per session, which would reintroduce the
  // same quadratic scan the N+1 was costing.
  const resultsBySession = new Map<string, QuestionResult[]>();
  for (const r of resultRows) {
    const bucket = resultsBySession.get(r.sessionId) ?? [];
    bucket.push({
      questionId: r.questionId,
      questionText: r.questionText,
      options: r.options,
      selectedIndex: r.selectedIndex,
      correctIndex: r.correctIndex,
      explanation: r.explanation,
      isCorrect: r.isCorrect,
    });
    resultsBySession.set(r.sessionId, bucket);
  }

  return sessionRows.map((row) => ({
    id: row.id,
    completedAt: row.completedAt.getTime(),
    examLabel: row.examLabel,
    examCode: row.examCode,
    subjectName: row.subjectName,
    topicName: row.topicName,
    levelLabel: row.levelLabel,
    correctCount: row.correctCount,
    totalCount: row.totalCount,
    availableCount: row.availableCount,
    durationMs: row.durationMs,
    results: resultsBySession.get(row.id) ?? [],
  }));
}

/** Persists a session and trims history back down to the most recent MAX_SESSIONS. */
export async function insertSession(session: SessionRecord): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(practiceSessions).values({
      id: session.id,
      completedAt: new Date(session.completedAt),
      examLabel: session.examLabel,
      examCode: session.examCode,
      subjectName: session.subjectName,
      topicName: session.topicName,
      levelLabel: session.levelLabel,
      correctCount: session.correctCount,
      totalCount: session.totalCount,
      availableCount: session.availableCount,
      durationMs: session.durationMs,
    });

    // One statement with N value tuples, not N awaited inserts — the same fix already
    // applied in db/mockTest.ts, where per-row awaits made submitting a ~100-question
    // attempt take ~7s purely in bridge overhead.
    if (session.results.length > 0) {
      await tx.insert(practiceSessionResults).values(
        session.results.map((result, index) => ({
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
        })),
      );
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

      if (stale.length > 0) {
        // Two statements rather than two per stale session. Children first: nothing
        // enforces the FK here, but deleting parents first would briefly leave orphaned
        // result rows if the transaction failed between the two.
        const staleIds = stale.map((s) => s.id);
        await tx.delete(practiceSessionResults).where(inArray(practiceSessionResults.sessionId, staleIds));
        await tx.delete(practiceSessions).where(inArray(practiceSessions.id, staleIds));
      }
    }
  });

  trackEvent("practice_session_completed", { correctCount: session.correctCount, totalCount: session.totalCount });
}

export async function clearAllSessions(): Promise<void> {
  await db.delete(practiceSessionResults);
  await db.delete(practiceSessions);
}
