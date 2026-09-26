import { apiFetch } from "./client";
import type { CompactPracticeResultInsightPayload } from "../analytics/practiceResultAnalytics";
import type { PracticeResultInsight, RecommendedResultAction } from "../ai/schema/types";
import { isRecommendedResultAction } from "../ai/schema/types";

/**
 * The Practice Result screen's "AI Feedback" tab — `POST /api/practice-sessions/{sessionId}/
 * analysis-feedback`. On-demand only: the caller must never invoke this before the student
 * explicitly opens the AI Feedback tab (see `AI_TASKS.PRACTICE_RESULT_INSIGHT`'s own doc comment
 * for why this task has no fallback tier).
 *
 * Sends the compact, already-computed analytics payload — never raw question text or
 * explanations (§10 of the spec). Returns `null` whenever the backend declines to generate: the
 * flag is off, the provider failed, or validation rejected the output — never an error, the same
 * contract every Phase 7 endpoint holds.
 */
export async function postPracticeResultInsight(
  sessionId: string,
  context: {
    examCode: string | null;
    subjectName: string | null;
    topicName: string | null;
    levelLabel: string | null;
    preferredLanguage: string;
  },
  payload: CompactPracticeResultInsightPayload,
  token: string,
): Promise<PracticeResultInsight | null> {
  const response = await apiFetch<{
    summary: string | null;
    strengths: string[] | null;
    weakAreas: string[] | null;
    timeInsight: string | null;
    recommendation: string | null;
    recommendedAction: string | null;
  }>(`/practice-sessions/${encodeURIComponent(sessionId)}/analysis-feedback`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: {
      examCode: context.examCode,
      subjectName: context.subjectName,
      topicName: context.topicName,
      levelLabel: context.levelLabel,
      preferredLanguage: context.preferredLanguage,
      accuracyPercent: payload.accuracyPercent,
      questionsAttempted: payload.questionsAttempted,
      correctCount: payload.correctCount,
      incorrectCount: payload.incorrectCount,
      totalTimeMs: payload.totalTimeMs,
      averageTimeMs: payload.averageTimeMs,
      subtopics: payload.subtopics,
      highTimeQuestions: payload.highTimeQuestions,
      fastAccurateQuestions: payload.fastAccurateQuestions,
      previousPerformance: payload.previousPerformance,
    },
  });

  // A partial payload is never returned by the backend (see PracticeResultInsightValidation) —
  // any missing required field means "nothing to show", the same all-or-nothing contract
  // postMistakeAnalysis holds.
  if (!response.summary || !response.recommendation || !response.recommendedAction) {
    return null;
  }
  if (!isRecommendedResultAction(response.recommendedAction)) {
    return null;
  }

  return {
    taskId: "PRACTICE_RESULT_INSIGHT",
    summary: response.summary,
    strengths: response.strengths ?? [],
    weakAreas: response.weakAreas ?? [],
    timeInsight: response.timeInsight,
    recommendation: response.recommendation,
    recommendedAction: response.recommendedAction as RecommendedResultAction,
  };
}
