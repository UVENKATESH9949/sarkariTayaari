import { apiFetch } from "./client";
import type { QuestionMediaResponse } from "./questions";

/** Mirrors backend QuestionGroupTranslationResponse (TASK-2301 Phase P3). */
export type QuestionGroupTranslationResponse = {
  languageCode: string;
  passageText: string | null;
};

/** Mirrors backend QuestionGroupResponse (TASK-2301 Phase P3). */
export type QuestionGroupResponse = {
  id: string;
  groupType: string;
  updatedAt: string;
  deleted: boolean;
  translations: QuestionGroupTranslationResponse[];
  media: QuestionMediaResponse[];
};

export type QuestionGroupSyncPage = {
  content: QuestionGroupResponse[];
  totalPages: number;
  totalElements: number;
  number: number;
  size: number;
  last: boolean;
};

/**
 * Groups sync on their own paged endpoint, deliberately not embedded per question (see the
 * architecture proposal's own note — embedding would re-download a shared passage once per
 * child question on every sync page). Deliberately public, same reasoning as
 * `syncQuestions` — a signed-out student's app needs this too.
 */
export function syncQuestionGroups(since: string, page = 0, size = 500) {
  const params = new URLSearchParams({ since, page: String(page), size: String(size) });
  return apiFetch<QuestionGroupSyncPage>(`/question-groups/sync?${params.toString()}`);
}
