import type { SessionRecord } from "../db/practiceSessions";

/**
 * The readiness score, computed the same way Progress already does: correct answers over
 * questions answered, across whatever sessions are given.
 *
 * <p>Extracted here rather than left inline in Progress so Home can reuse the exact same
 * formula instead of inventing a second "readiness" that could quietly disagree with the one
 * students already see on Progress — this is a genuine risk in this app, which has more than
 * once shipped two competing versions of the same computed value (see the trend-model
 * collision `LearningStateService` was built to resolve). Progress itself is left calling this
 * too, so there is exactly one implementation.
 *
 * <p>Home additionally wants this scoped to the student's currently selected exam — Progress
 * deliberately shows the whole-app figure across every exam ever practised, so `examCode` is an
 * optional filter layered on the same formula, not a different one.
 */
export function computeReadiness(sessions: SessionRecord[], examCode?: string | null): {
  readinessPercent: number;
  hasActivity: boolean;
} {
  let totalCorrect = 0;
  let totalQuestions = 0;

  for (const session of sessions) {
    if (examCode && session.examCode !== examCode) continue;
    totalCorrect += session.correctCount;
    totalQuestions += session.totalCount;
  }

  return {
    readinessPercent: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
    hasActivity: totalQuestions > 0,
  };
}
