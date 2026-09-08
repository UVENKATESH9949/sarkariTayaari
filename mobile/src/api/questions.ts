import { apiFetch } from "./client";
import { SUPPORTED_QUESTION_TYPES_PARAM } from "../evaluation/supportedQuestionTypes";

export type LanguageResponse = {
  code: string;
  name: string;
};

export type TranslationResponse = {
  languageCode: string;
  questionText: string;
  options: string[];
  explanation: string;
  /** Assertion & Reason's / Statement-Based's authored content (TASK-2301 Phase P2 Wave A). Absent for every other type and for a backend that predates V26. */
  content?: Record<string, unknown> | null;
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
  /**
   * Multi-type question foundation (TASK-2301, Phase P1). Optional for the same reason as
   * the PYQ fields above — a backend that predates V25 omits these entirely. `correctAnswer`
   * stays authoritative; nothing reads `answerKey`/`answerConfig`/`contentStructure` yet.
   */
  questionType?: string;
  answerKey?: Record<string, unknown> | null;
  answerConfig?: Record<string, unknown> | null;
  contentStructure?: Record<string, unknown> | null;
  /**
   * Shared content / groups (TASK-2301 Phase P3). `questionGroupId` is null for a standalone
   * question — the entire bank as of this phase's own migration, and most future content too.
   */
  questionGroupId?: string | null;
  groupOrder?: number | null;
  media?: QuestionMediaResponse[];
};

/** Mirrors backend QuestionMediaResponse (TASK-2301 Phase P3). */
export type QuestionMediaResponse = {
  id: string;
  mediaType: string;
  url: string;
  mimeType: string | null;
  displayOrder: number;
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

/**
 * Always syncs the entire question bank — the server no longer scopes this by exam.
 *
 * `supportedTypes` is always sent (TASK-2301 Phase P3 capability negotiation) — omitting it
 * would tell a negotiation-aware backend this client predates every type past SINGLE_CHOICE,
 * silently hiding every Wave A/B question and any future shared-content group from this app.
 */
export function syncQuestions(since: string, page = 0, size = 500) {
  const params = new URLSearchParams({
    since,
    page: String(page),
    size: String(size),
    supportedTypes: SUPPORTED_QUESTION_TYPES_PARAM,
  });
  return apiFetch<SyncPage>(`/questions/sync?${params.toString()}`);
}
