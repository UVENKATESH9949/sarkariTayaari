import { apiFetch } from "./client";
import type { AiTaskId } from "../ai/tasks";

/**
 * TASK-2701 Phase 4. Mirrors `GET /api/client-config` (public, no auth) — the channel the Phase
 * 0/1 audit found genuinely did not exist anywhere in this backend (verified by enumerating
 * every controller, twice). Named generically rather than "ai-client-config": today it carries
 * only AI task flags, but the shape is built to gain sibling sections later without a breaking
 * change.
 *
 * `aiTasks` covers every id in the shared registry (`AI_TASK_IDS`), not only the ones with a
 * real generation pipeline today — an admin can flip a task on the moment its implementation
 * ships, with no schema or app change. A task absent from the response (should never happen,
 * but the client must not assume it can't) is treated as disabled by whatever reads this —
 * "unknown means off" per `router.ts`'s own rule.
 */
export type ClientConfig = {
  aiTasks: Partial<Record<AiTaskId, boolean>>;
};

export function getClientConfig(): Promise<ClientConfig> {
  return apiFetch<ClientConfig>("/client-config");
}
