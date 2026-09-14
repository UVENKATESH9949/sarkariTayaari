import { apiFetch } from "./client";
import type { SessionContext } from "../ai/context/types";

/**
 * TASK-2701 Phase 7.1 — `POST /api/practice-sessions/{sessionId}/feedback`.
 *
 * Sends `SessionContext` verbatim as the request body — the field names match
 * `SessionFeedbackDtos.SessionFeedbackRequest`/`TopicSnapshotDto` on the backend exactly (see
 * that file's own doc comment for why the context is trusted as given rather than re-derived
 * server-side). Requires a token: this is a per-student, on-demand generation call, not public
 * content.
 *
 * Returns `null` whenever the backend declines to generate — the flag is off, the fixture/real
 * provider failed, or validation rejected the output — never an error. A caller sees this
 * exactly like any other `UNAVAILABLE` tier outcome: render nothing extra, the screen is
 * already correct without it.
 */
export async function postSessionFeedback(
  sessionId: string,
  context: SessionContext,
  token: string,
): Promise<string | null> {
  return postFeedback(`/practice-sessions/${encodeURIComponent(sessionId)}/feedback`, context, token);
}

/**
 * TASK-2701 Phase 7.2 — `POST /api/mock-attempts/{attemptId}/feedback`, the Mock Test twin of
 * {@link postSessionFeedback}. Identical request/response shape and identical
 * `SESSION_FEEDBACK` task on the backend (see `MockAttemptFeedbackController`'s own doc comment
 * for why it's a separate endpoint rather than a branch on `sessionKind`) — only the path, and
 * therefore which table the backend opportunistically caches the result onto, differs.
 */
export async function postMockAttemptFeedback(
  attemptId: string,
  context: SessionContext,
  token: string,
): Promise<string | null> {
  return postFeedback(`/mock-attempts/${encodeURIComponent(attemptId)}/feedback`, context, token);
}

async function postFeedback(path: string, context: SessionContext, token: string): Promise<string | null> {
  const response = await apiFetch<{ narrative: string | null }>(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: {
      sessionKind: context.sessionKind,
      examCode: context.examCode,
      answeredCount: context.answeredCount,
      correctCount: context.correctCount,
      accuracyPercent: context.accuracyPercent,
      preferredLanguage: context.preferredLanguage,
      topics: context.topics.map((topic) => ({
        topicId: topic.topicId,
        topicName: topic.topicName,
        subjectName: topic.subjectName,
        state: topic.state,
        healthScore: topic.healthScore,
        trend: topic.trend,
        reasonCodes: topic.reasonCodes,
      })),
    },
  });
  return response.narrative;
}
