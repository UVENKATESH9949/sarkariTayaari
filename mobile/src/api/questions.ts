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
  /**
   * Epic L / TICKET-2104 — previous-year provenance.
   *
   * Optional on this type rather than required: a device can be running against a backend that
   * predates V13 (the deployed Cloud Run instance, until it is redeployed), and the sync writer
   * has to treat a missing field as "not a PYQ" instead of crashing on undefined.
   */
  pyq?: boolean;
  pyqYear?: number | null;
  pyqShift?: string | null;
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
