import { db } from "./client";
import { clientConfigAiTasks } from "./schema";
import type { AiTaskFlags } from "@sarkaritaiyaari/core/ai";

/**
 * TASK-2701 Phase 4 — the offline read behind every AI surface's "is this task turned on"
 * check. Mirrors the server's own "unknown means off" rule (see AiTaskFlagService/router.ts):
 * a task with no locally-synced row (never toggled by an admin, or not yet synced on this
 * device) is simply absent from the returned map, and `AiTaskFlags` is a `Partial` record —
 * `flags[taskId] !== true` already reads that correctly as disabled, the same way the router
 * treats a missing key.
 */
export async function getLocalAiTaskFlags(): Promise<AiTaskFlags> {
  const rows = await db.select().from(clientConfigAiTasks).all();

  const flags: AiTaskFlags = {};
  for (const row of rows) {
    flags[row.taskId as keyof AiTaskFlags] = row.enabled;
  }
  return flags;
}
