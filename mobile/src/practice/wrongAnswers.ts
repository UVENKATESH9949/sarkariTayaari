import type { SessionRecord } from "./sessionHistory";

export type WrongAnswerItem = {
  id: string;
  questionText: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number | null;
  explanation: string;
  subjectName: string;
  topicName: string;
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
      });
    }
  }
  return items;
}
