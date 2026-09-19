import { uploadProgress, type PracticeResultPayload, type PracticeSessionPayload } from "@sarkaritaiyaari/core/api";
import type { EvaluationOutcome } from "@sarkaritaiyaari/core/evaluation";
import type { Question } from "../questions/types";

/**
 * A finished Practice session and where it lives.
 *
 * Decision 2 (online-only) plus the signed-out-session decision from TASK-2601's scoping
 * mean there is no local database to write a session into. Instead:
 *
 * - It is held in `sessionStorage` (survives a reload of this tab, gone when the tab
 *   closes) under a generated id, and the Summary screen is addressed by that id
 *   (`/practice/summary?sessionId=...`) rather than carrying the whole result set in the
 *   URL or in fragile router state that a reload would drop.
 * - If the student is signed in, it is ALSO uploaded to the server via the same
 *   `POST /api/progress/sync` endpoint mobile uses, in the exact payload shape the backend
 *   expects — so a web practice session becomes a real row in the same
 *   `user_practice_session_results` history the phone app restores. Write-once: the
 *   client-generated id is reused on retry, matching `api/USER-PROGRESS.md`'s documented
 *   conflict rule for this endpoint.
 *
 * Reading history back (a "past sessions" list on web) is Phase 3's job, once the backend
 * has a paginated read — `GET /api/progress` returns a student's *entire* history
 * unpaginated, which is fine for mobile's one-time restore into SQLite and not for a
 * browser screen. Not attempted here.
 */

export type PracticeResult = {
  question: Question;
  response: Record<string, unknown> | null;
  outcome: EvaluationOutcome;
  scoreFraction: number;
  /**
   * How long this question was on screen, in milliseconds (TASK-2801 Phase 1), or null when it
   * was not measured. Null, never 0 — a zero would claim the student answered instantly, and
   * every reader of `time_ms` treats absence as unknown.
   *
   * Optional so a session already sitting in this tab's `sessionStorage` from before this
   * release still parses.
   */
  timeMs?: number | null;
};

export type CompletedPracticeSession = {
  id: string;
  completedAt: string;
  examLabel: string | null;
  subjectName: string | null;
  topicName: string | null;
  levelLabel: string | null;
  correctCount: number;
  totalCount: number;
  results: PracticeResult[];
};

const STORAGE_PREFIX = "st_web_practice_session:";

export function newSessionId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function saveCompletedSession(session: CompletedPracticeSession): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + session.id, JSON.stringify(session));
  } catch {
    // A session that cannot be cached for the Summary screen still finished — the student
    // just cannot reload that screen. Not worth failing the quiz over.
  }
}

export function loadCompletedSession(id: string): CompletedPracticeSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + id);
    return raw ? (JSON.parse(raw) as CompletedPracticeSession) : null;
  } catch {
    return null;
  }
}

/** Best-effort. A failed upload must never block the student from seeing their own results. */
export async function uploadCompletedSession(token: string, session: CompletedPracticeSession): Promise<void> {
  const results: PracticeResultPayload[] = session.results.map((r, index) => ({
    orderIndex: index,
    questionId: r.question.id,
    selectedIndex: typeof r.response?.selectedOption === "number" ? r.response.selectedOption : null,
    correctIndex: r.question.correctIndex,
    correct: r.outcome === "CORRECT",
    timeMs: r.timeMs ?? null,
    questionType: r.question.questionType,
    response: r.response,
    outcome: r.outcome,
    scoreFraction: r.scoreFraction,
  }));

  const payload: PracticeSessionPayload = {
    id: session.id,
    completedAt: session.completedAt,
    examLabel: session.examLabel,
    subjectName: session.subjectName,
    topicName: session.topicName,
    levelLabel: session.levelLabel,
    correctCount: session.correctCount,
    totalCount: session.totalCount,
    results,
  };

  try {
    await uploadProgress(token, { practiceSessions: [payload], mockAttempts: [] });
  } catch {
    // Silently retried on the student's next sign-in-triggered sync in a later phase; this
    // is exactly the "safe to retry, keyed on the device-generated id" contract the upload
    // endpoint documents.
  }
}
