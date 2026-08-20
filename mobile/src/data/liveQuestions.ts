import { apiFetch } from "../api/client";
import type { QuestionResponse, SyncPage } from "../api/questions";

/**
 * Thin wrappers over the backend's public /live, /counts, /mock-count, /mock-sample
 * endpoints — the hybrid data layer's only network calls. Styled like api/questions.ts;
 * kept separate from it since these back live screen reads, not the sync engine.
 */

export function getLiveQuestions(params: {
  examCode?: string;
  subjectId?: string;
  topicId?: string;
  difficulty?: string;
  page?: number;
  size?: number;
}) {
  const query = new URLSearchParams();
  if (params.examCode) query.set("examCode", params.examCode);
  if (params.subjectId) query.set("subjectId", params.subjectId);
  if (params.topicId) query.set("topicId", params.topicId);
  if (params.difficulty) query.set("difficulty", params.difficulty);
  query.set("page", String(params.page ?? 0));
  query.set("size", String(params.size ?? 200));
  return apiFetch<SyncPage>(`/questions/live?${query.toString()}`);
}

export type GroupBy = "exam" | "subject" | "topic" | "difficulty";

export function getQuestionCounts(params: {
  groupBy: GroupBy;
  examCode?: string;
  subjectId?: string;
  topicId?: string;
  difficulty?: string;
}) {
  const query = new URLSearchParams({ groupBy: params.groupBy });
  if (params.examCode) query.set("examCode", params.examCode);
  if (params.subjectId) query.set("subjectId", params.subjectId);
  if (params.topicId) query.set("topicId", params.topicId);
  if (params.difficulty) query.set("difficulty", params.difficulty);
  return apiFetch<Record<string, number>>(`/questions/counts?${query.toString()}`);
}

export function getMockAvailabilityCount(examCode: string, subjectIds: string[]) {
  const query = new URLSearchParams({ examCode, subjectIds: subjectIds.join(",") });
  return apiFetch<{ count: number }>(`/questions/mock-count?${query.toString()}`);
}

export function getMockSample(examCode: string, subjectIds: string[], limit: number) {
  const query = new URLSearchParams({ examCode, subjectIds: subjectIds.join(","), limit: String(limit) });
  return apiFetch<QuestionResponse[]>(`/questions/mock-sample?${query.toString()}`);
}
