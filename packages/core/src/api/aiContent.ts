import { apiFetch } from "./client";

/**
 * TASK-2701 Phase 3. Mirrors `GET /api/ai-content/sync` (`api/AI-CONTENT.md`) — the public,
 * unauthenticated feed of AI-generated question/topic explanations, following exactly the same
 * "the reference sync reads this, no since parameter needed at today's volume" convention
 * `getAllExamGuides` already established.
 *
 * `payload` is present only when `published` is true. A row that is DRAFT, in REVIEW, or was
 * unpublished after once being live still appears here — with `published: false` and no
 * payload — so a device that already cached it while it was live can drop it, the same
 * tombstone role a deleted flag plays for every other synced entity.
 */
export type AiContentSyncEntry = {
  id: string;
  taskId: string;
  questionId: string | null;
  topicId: string | null;
  languageCode: string;
  published: boolean;
  payload: Record<string, unknown> | null;
  updatedAt: string;
};

export function getAiContentSync(): Promise<AiContentSyncEntry[]> {
  return apiFetch<AiContentSyncEntry[]>("/ai-content/sync?since=0");
}
