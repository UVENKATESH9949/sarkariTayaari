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
};

/** Most-recent-first, deduped by questionId on first occurrence — retrying the same question later doesn't create duplicate revision entries. */
export function getWrongAnswers(sessions: SessionRecord[]): WrongAnswerItem[] {
  const seen = new Set<string>();
  const items: WrongAnswerItem[] = [];
  for (const session of sessions) {
    for (const result of session.results) {
      if (result.isCorrect) continue;
      if (seen.has(result.questionId)) continue;
      seen.add(result.questionId);
      items.push({
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
