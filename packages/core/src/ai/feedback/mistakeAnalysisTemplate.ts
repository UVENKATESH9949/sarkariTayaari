/**
 * `MISTAKE_ANALYSIS`'s `DETERMINISTIC` tier — the same reasoning `sessionFeedbackTemplate.ts` and
 * `profileSummaryTemplate.ts` both document: every tier a task declares must be genuinely
 * servable (`registryViolations` in `../tasks.ts`), so this is what a student sees when the flag
 * is off, the model is unavailable, or generation fails validation. `GENERATED` is a phrasing and
 * classification upgrade over these same facts, never a different set of facts.
 *
 * ## Why the deterministic classification is deliberately timid
 * Only two mistake types can be established without a model actually reading the question:
 * `REPEATED_MISTAKE` (countable from the student's own history) and `KNOWLEDGE_GAP` (the plainest
 * reading of a wrong answer). Everything else in the taxonomy — `MISREADING`,
 * `CALCULATION_ERROR`, `SIMILAR_OPTION_CONFUSION` — requires understanding the question and its
 * distractors, which is exactly the judgement the `GENERATED` tier exists to add. Picking between
 * them here would produce a confident-sounding diagnosis with nothing behind it, which is worse
 * than an honest general one.
 */

import type { LearnerContext, QuestionContext } from "../context/types";
import type { MistakeAnalysis } from "../schema/types";

export type MistakeAttempt = {
  /** `null` when the question was left unanswered — normal in a Mock Test. */
  selectedAnswerText: string | null;
  /** How many times this student has got this same question wrong, from their own history. */
  timesAnsweredWrong: number | null;
};

export function mistakeAnalysisTemplate(
  question: QuestionContext,
  learner: LearnerContext | null,
  attempt: MistakeAttempt,
): MistakeAnalysis {
  const repeated = (attempt.timesAnsweredWrong ?? 0) > 1;
  const unanswered = attempt.selectedAnswerText === null || attempt.selectedAnswerText.trim() === "";

  const explanation = repeated
    ? "You've got this one wrong before, so it's worth slowing down on it rather than moving past it again."
    : unanswered
      ? "You left this one unanswered, so there's nothing to correct here — only the gap to close."
      : `The correct answer is ${question.correctAnswer}. Worth re-reading the reasoning rather than memorising the option.`;

  // The only learner fact used, and only when it is actually known: a topic already flagged as
  // needing attention makes "practise the topic" the honest next step rather than "revisit this
  // question". Nothing else from LearnerContext is cited, because an unvalidated template quoting
  // scores back at a student is exactly what PROFILE_SUMMARY's prompt rules already warn against.
  const topicNeedsWork =
    learner?.topicState === "NEEDS_ATTENTION" || learner?.topicState === "NEEDS_REVISION";

  const suggestedAction = topicNeedsWork
    ? `${question.topicName} needs more attention generally — practise a few more questions from it, not just this one.`
    : `Go back over ${question.topicName} and try a few more questions like this one.`;

  return {
    taskId: "MISTAKE_ANALYSIS",
    mistakeType: repeated ? "REPEATED_MISTAKE" : "KNOWLEDGE_GAP",
    explanation,
    suggestedAction,
  };
}
