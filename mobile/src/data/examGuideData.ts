import { getExamGuideLocal } from "../db/examGuideLocal";
import { getExamGuide, type ExamGuide } from "../api/examGuide";
import type { HybridMode } from "./hybridSource";

export type { ExamGuide };

/**
 * Hybrid (local SQLite vs. live backend) equivalent of api/examGuide.ts's getExamGuide —
 * spec §44 "Offline loading / caching". Same pattern as every other hybrid function in
 * this module (see data/practiceData.ts): "local" reads the cache written by
 * writeExamGuides() during the ordinary reference sync, "live" is the existing direct
 * fetch, "unavailable" is null (the screen's existing empty state already covers this).
 */
export async function getExamGuideHybrid(examCode: string, mode: HybridMode): Promise<ExamGuide | null> {
  if (mode === "local") return getExamGuideLocal(examCode);
  if (mode === "unavailable") return null;
  return getExamGuide(examCode);
}
