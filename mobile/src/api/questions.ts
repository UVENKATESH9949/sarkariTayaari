import { apiFetch } from "./client";

export type LanguageResponse = {
  code: string;
  name: string;
};

export type TranslationResponse = {
  languageCode: string;
  questionText: string;
  options: string[];
  explanation: string;
};

export type QuestionResponse = {
  id: string;
  correctAnswer: string;
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicName: string;
  difficulty: string;
  examCodes: string[];
  premium: boolean;
  updatedAt: string;
  deleted: boolean;
  translations: TranslationResponse[];
};

export type SyncPage = {
  content: QuestionResponse[];
  totalPages: number;
  totalElements: number;
  number: number;
  size: number;
  last: boolean;
};

export function getLanguages() {
  return apiFetch<LanguageResponse[]>("/languages");
}

/** Always syncs the entire question bank — the server no longer scopes this by exam. */
export function syncQuestions(since: string, page = 0, size = 500) {
  const params = new URLSearchParams({
    since,
    page: String(page),
    size: String(size),
  });
  return apiFetch<SyncPage>(`/questions/sync?${params.toString()}`);
}
