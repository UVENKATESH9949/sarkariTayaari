import { countAdHocAvailable as countAdHocAvailableLocal, buildAdHocMockQuestionsLocal } from "../db/mockTest";
import type { MockTestQuestion } from "../db/mockTest";
import { countAdHocMockLive, buildAdHocMockQuestionsLive } from "./mockTestData";
import { noteHybridMode } from "./mockTestStructureData";
import type { AdHocMockSpec } from "../mockHub/types";
import type { HybridMode } from "./hybridSource";

export type { AdHocMockSpec, MockFormat } from "../mockHub/types";
export type { MockTestQuestion };

/**
 * The Mock Test Hub's hybrid facade — the exact counterpart of `mockTestAccess.ts`, for the
 * 8 ad-hoc formats (everything except Full Length, which still goes through the existing
 * `SyncedPaper` path unchanged). Same three branches, same reasoning: `unavailable` returns
 * the local path's "nothing synced" shape rather than throwing.
 */

export async function countAdHocMock(spec: AdHocMockSpec, mode: HybridMode): Promise<number> {
  noteHybridMode(mode);
  if (mode === "local") return countAdHocAvailableLocal(spec);
  if (mode === "unavailable") return 0;
  return countAdHocMockLive(spec);
}

export async function buildAdHocMockQuestions(spec: AdHocMockSpec, mode: HybridMode): Promise<MockTestQuestion[]> {
  noteHybridMode(mode);
  if (mode === "local") return buildAdHocMockQuestionsLocal(spec);
  if (mode === "unavailable") return [];
  return buildAdHocMockQuestionsLive(spec);
}
