import { apiFetch } from "./client";
import type { LearnerProfileContext } from "../ai/context/types";

/**
 * TASK-2701 Phase 7.3 — `POST /api/exams/{examCode}/profile-summary`. The narrative behind the
 * Preparation Radar screen's strengths/weaknesses, mirroring `postSessionFeedback`'s shape but
 * over `LearnerProfileContext` instead of `SessionContext` — see `SessionFeedbackDtos`'s doc
 * comment for why the context is trusted as given rather than re-derived server-side.
 *
 * Returns `null` whenever the backend declines to generate — the flag is off, the provider
 * failed, or validation rejected the output — never an error. Unlike session feedback, this
 * result is not opportunistically cached server-side: a profile summary has no natural row to
 * cache onto (it's a snapshot over the whole exam, not one completed session/attempt), and the
 * underlying facts (topic health/trend) change far more often than a finished session's facts
 * ever could — a v1 without a cache-invalidation story is a simpler, honest choice than one that
 * silently serves a stale narrative.
 */
export async function postProfileSummary(
  examCode: string,
  context: LearnerProfileContext,
  token: string,
): Promise<string | null> {
  const response = await apiFetch<{ narrative: string | null }>(
    `/exams/${encodeURIComponent(examCode)}/profile-summary`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: {
        examCode: context.examCode,
        overviewStatus: context.overviewStatus,
        topicsInSyllabus: context.topicsInSyllabus,
        topicsWithEvidence: context.topicsWithEvidence,
        preferredLanguage: context.preferredLanguage,
        strengths: context.strengths.map(toTopicDto),
        weaknesses: context.weaknesses.map(toTopicDto),
      },
    },
  );
  return response.narrative;
}

function toTopicDto(topic: LearnerProfileContext["strengths"][number]) {
  return {
    topicId: topic.topicId,
    topicName: topic.topicName,
    subjectName: topic.subjectName,
    state: topic.state,
    healthScore: topic.healthScore,
    trend: topic.trend,
    reasonCodes: topic.reasonCodes,
  };
}
