import type { SessionRecord } from "./sessionHistory";

/**
 * Accuracy across every practice session tied to one exam — the exam-list "progress"
 * row. Returns null (not 0) when no session has `examCode` set for this exam, so the
 * card can omit the row entirely rather than show a fabricated 0%. Sessions predating
 * the `examCode` column, and "All Government Exams" sessions (which span every exam at
 * once), are excluded rather than guessed at from the denormalized examLabel text.
 */
export function getExamPracticeProgress(sessions: SessionRecord[], examCode: string): number | null {
  let correct = 0;
  let total = 0;
  for (const session of sessions) {
    if (session.examCode !== examCode) continue;
    correct += session.correctCount;
    total += session.totalCount;
  }
  if (total === 0) return null;
  return Math.round((correct / total) * 100);
}
