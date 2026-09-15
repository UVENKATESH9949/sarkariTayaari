import type { SessionRecord } from "./sessionHistory";

export type WrongAnswerItem = {
  id: string;
  questionText: string;
  options: string[];
  /**
   * Nullable since TASK-2301 Phase P2 Wave A — MULTIPLE_CHOICE/TRUE_FALSE have no single
   * index. `OptionList` already falls back to blind (no-reveal) mode for a null value, so
   * a wrong MULTIPLE_CHOICE/TRUE_FALSE answer here just doesn't show its correct answer
   * yet rather than showing a wrong one.
   */
  correctIndex: number | null;
  selectedIndex: number | null;
  explanation: string;
  subjectName: string;
  topicName: string;
  /** Carried through so Revise can still show what was picked for MULTIPLE_CHOICE/TRUE_FALSE — see revise.tsx. */
  questionType?: string | null;
  response?: Record<string, unknown> | null;
  /**
   * How many times this question appears wrong across retained history, not just the once this
   * deduped entry represents. TASK-2701 Phase 7.4 uses it to let `REPEATED_MISTAKE` be counted
   * rather than guessed — it is the one learner fact a model cannot possibly infer on its own.
   */
  timesAnsweredWrong: number;
};

/** Most-recent-first, deduped by questionId on first occurrence — retrying the same question later doesn't create duplicate revision entries. */
export function getWrongAnswers(sessions: SessionRecord[]): WrongAnswerItem[] {
  // Counted over every retained session before the dedupe below, since the dedupe is exactly
  // what would otherwise hide a repeat.
  const wrongCounts = new Map<string, number>();
  for (const session of sessions) {
    for (const result of session.results) {
      if (result.isCorrect) continue;
      wrongCounts.set(result.questionId, (wrongCounts.get(result.questionId) ?? 0) + 1);
    }
  }

  const seen = new Set<string>();
  const items: WrongAnswerItem[] = [];
  for (const session of sessions) {
    for (const result of session.results) {
      if (result.isCorrect) continue;
      if (seen.has(result.questionId)) continue;
      seen.add(result.questionId);
      items.push({
        timesAnsweredWrong: wrongCounts.get(result.questionId) ?? 1,
        id: result.questionId,
        questionText: result.questionText,
        options: result.options,
        correctIndex: result.correctIndex,
        selectedIndex: result.selectedIndex,
        explanation: result.explanation,
        subjectName: session.subjectName,
        topicName: session.topicName,
        questionType: result.questionType,
        response: result.response,
      });
    }
  }
  return items;
}
