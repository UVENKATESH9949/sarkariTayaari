import { asc, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "./client";
import { practiceSessionResults, practiceSessions } from "./schema";
import { trackEvent } from "../telemetry/analytics";

export type QuestionResult = {
  questionId: string;
  questionText: string;
  options: string[];
  /** Nullable since TASK-2301 Phase P2 Wave A — no meaning for MULTIPLE_CHOICE/TRUE_FALSE. */
  selectedIndex: number | null;
  correctIndex: number | null;
  explanation: string;
  isCorrect: boolean;
  /**
   * Milliseconds this question was on screen, or null when it was not measured (§9).
   *
   * Nothing reads it yet -- see practice/useQuestionTimer.ts for why capture starts before
   * the signal is usable. Null, never 0: a zero would claim an instant answer.
   */
  timeMs?: number | null;

  /* -------------------------- Response model (TASK-2301 Phase P2 Wave A) */

  /** "SINGLE_CHOICE" when absent — every result recorded before this phase is one. */
  questionType?: string | null;
  response?: Record<string, unknown> | null;
  outcome?: string | null;
  scoreFraction?: number | null;
};

export type SessionRecord = {
  id: string;
  completedAt: number;
  /**
   * When the student started answering (migration 0029, TASK-2801). Null for sessions recorded
   * before this field existed, and for any session restored from a server that never held one.
   * Null means "not recorded", never the epoch.
   */
  startedAt: number | null;
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
  /**
   * TASK-2701 Phase 7.1 — the AI-phrased feedback narrative, cached after first
   * generation so reopening this session from History doesn't regenerate it. Null for
   * every session before this feature and for any session that never had feedback
   * generated (flag off, offline, or generation failed) — a normal, silent state.
   */
  feedbackNarrative?: string | null;
  feedbackGeneratedAt?: number | null;
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
      timeMs: r.timeMs,
      questionType: r.questionType,
      response: r.response,
      outcome: r.outcome,
      scoreFraction: r.scoreFraction,
    });
    resultsBySession.set(r.sessionId, bucket);
  }

  return sessionRows.map((row) => ({
    id: row.id,
    completedAt: row.completedAt.getTime(),
    startedAt: row.startedAt ? row.startedAt.getTime() : null,
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
    feedbackNarrative: row.feedbackNarrative,
    feedbackGeneratedAt: row.feedbackGeneratedAt ? row.feedbackGeneratedAt.getTime() : null,
  }));
}

/** Persists a session and trims history back down to the most recent MAX_SESSIONS. */
export async function insertSession(session: SessionRecord): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(practiceSessions).values({
      id: session.id,
      completedAt: new Date(session.completedAt),
      startedAt: session.startedAt === null ? null : new Date(session.startedAt),
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
          timeMs: result.timeMs ?? null,
          questionType: result.questionType ?? "SINGLE_CHOICE",
          response: result.response ?? null,
          outcome: result.outcome ?? null,
          scoreFraction: result.scoreFraction ?? null,
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

/**
 * TASK-2701 Phase 7.1 — caches an AI-phrased feedback narrative against an already-saved
 * session, so Summary doesn't regenerate it every time the session is reopened from
 * History. A no-op (0 rows affected) if the session id doesn't exist locally, which
 * should not happen in practice — `getOrBuildSessionFeedback` always calls this against a
 * session that was just written by `insertSession` in the same screen's lifecycle.
 */
export async function saveSessionFeedback(sessionId: string, narrative: string): Promise<void> {
  await db
    .update(practiceSessions)
    .set({ feedbackNarrative: narrative, feedbackGeneratedAt: new Date() })
    .where(eq(practiceSessions.id, sessionId));
}
