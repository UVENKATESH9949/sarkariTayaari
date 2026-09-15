import { apiFetch } from "./client";
import type { LearnerContext, QuestionContext } from "../ai/context/types";
import type { MistakeAttempt } from "../ai/feedback/mistakeAnalysisTemplate";
import type { MistakeAnalysis, MistakeType } from "../ai/schema/types";

/**
 * TASK-2701 Phase 7.4 — `POST /api/questions/{questionId}/mistake-analysis`. Why this student got
 * this one question wrong, classified into the shared taxonomy.
 *
 * Returns `null` whenever the backend declines to generate — the flag is off, the provider
 * failed, or validation rejected the output — never an error, the same contract
 * `postSessionFeedback` and `postProfileSummary` both hold.
 *
 * Unlike those two this is generated only on an explicit user action, never automatically on a
 * screen opening: the Wrong Answers list can hold hundreds of entries, and generating for each one
 * as it scrolled into view would spend a real model call per row. The caller is expected to cache
 * the result against the question id — a finished wrong answer is immutable history, so it never
 * needs asking twice.
 */
export async function postMistakeAnalysis(
  questionId: string,
  question: QuestionContext,
  learner: LearnerContext | null,
  attempt: MistakeAttempt,
  token: string,
): Promise<MistakeAnalysis | null> {
  const response = await apiFetch<{
    mistakeType: string | null;
    explanation: string | null;
    suggestedAction: string | null;
  }>(`/questions/${encodeURIComponent(questionId)}/mistake-analysis`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: {
      questionText: question.questionText,
      options: question.options,
      correctAnswerText: question.correctAnswer,
      selectedAnswerText: attempt.selectedAnswerText,
      subjectName: question.subjectName,
      topicName: question.topicName,
      // Only the qualitative state is sent, never the score: no numeric statistic about the
      // student reaches the model, so there is none for it to misquote. See
      // MistakeAnalysisValidation's doc comment for why that replaced an output-side check.
      topicState: learner?.topicState ?? null,
      timesAnsweredWrong: attempt.timesAnsweredWrong,
      preferredLanguage: question.languageCode,
    },
  });

  // All three fields are null together when the backend declines — a partial payload is never
  // returned (see MistakeAnalysisDtos), so any missing field means "nothing to show".
  if (!response.mistakeType || !response.explanation || !response.suggestedAction) {
    return null;
  }

  return {
    taskId: "MISTAKE_ANALYSIS",
    mistakeType: response.mistakeType as MistakeType,
    explanation: response.explanation,
    suggestedAction: response.suggestedAction,
  };
}
