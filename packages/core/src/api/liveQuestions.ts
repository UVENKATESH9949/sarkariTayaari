import { apiFetch } from "./client";
import type { QuestionResponse, SyncPage } from "./questions";
import { SUPPORTED_QUESTION_TYPES_PARAM } from "../evaluation";

/**
 * Thin wrappers over the backend's public /live, /counts, /mock-count, /mock-sample
 * endpoints. Styled like questions.ts's syncQuestions; kept separate from it since these back
 * live screen reads, not the bulk sync engine.
 *
 * Moved into the shared package in TASK-2601 Phase 1 (previously mobile's
 * data/liveQuestions.ts, used only by its hybrid local/live facade) because web's Practice
 * screens are online-only and need these directly, with no local/live branch at all.
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
  // Capability negotiation (TASK-2301 Phase P3) — same reasoning as api/questions.ts's syncQuestions.
  query.set("supportedTypes", SUPPORTED_QUESTION_TYPES_PARAM);
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

/**
 * Mock Test Hub's ad-hoc formats narrow the same subject-scoped pool further — all three are
 * optional so the Full-Length-mock-live-path callers above (no narrowing at all) are unaffected.
 */
export type MockNarrowing = {
  topicIds?: string[];
  difficultyCode?: string;
  pyqOnly?: boolean;
};

function appendMockNarrowing(query: URLSearchParams, narrowing?: MockNarrowing) {
  if (!narrowing) return;
  if (narrowing.topicIds && narrowing.topicIds.length > 0) query.set("topicIds", narrowing.topicIds.join(","));
  if (narrowing.difficultyCode) query.set("difficultyCode", narrowing.difficultyCode);
  if (narrowing.pyqOnly) query.set("pyqOnly", "true");
}

export function getMockAvailabilityCount(examCode: string, subjectIds: string[], narrowing?: MockNarrowing) {
  const query = new URLSearchParams({ examCode, subjectIds: subjectIds.join(",") });
  appendMockNarrowing(query, narrowing);
  return apiFetch<{ count: number }>(`/questions/mock-count?${query.toString()}`);
}

export function getMockSample(examCode: string, subjectIds: string[], limit: number, narrowing?: MockNarrowing) {
  const query = new URLSearchParams({ examCode, subjectIds: subjectIds.join(","), limit: String(limit) });
  appendMockNarrowing(query, narrowing);
  return apiFetch<QuestionResponse[]>(`/questions/mock-sample?${query.toString()}`);
}

/** Revision Mock's exact-list hydration, live — the same endpoint the web app and bookmark/session-review screens already use to turn bare question ids into content. */
export function getQuestionsByIds(ids: string[]) {
  if (ids.length === 0) return Promise.resolve<QuestionResponse[]>([]);
  const query = new URLSearchParams({ ids: ids.join(",") });
  return apiFetch<QuestionResponse[]>(`/questions/by-ids?${query.toString()}`);
}
