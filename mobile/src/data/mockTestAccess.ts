import {
  getMockablePapers as getMockablePapersLocal,
  getPaperById as getPaperByIdLocal,
  type SyncedPaper,
} from "../db/examStructure";
import {
  getSectionAvailability as getSectionAvailabilityLocal,
  buildMockTestQuestions as buildMockTestQuestionsLocal,
  type MockTestQuestion,
  type SectionAvailability,
} from "../db/mockTest";
import { getMockablePapersLive, getPaperByIdLive, noteHybridMode } from "./mockTestStructureData";
import { getSectionAvailabilityLive, buildMockTestQuestionsLive } from "./mockTestData";
import type { HybridMode } from "./hybridSource";

export type { SyncedPaper, MockTestQuestion, SectionAvailability };

/**
 * The Mock Test half of the hybrid data layer — the exact counterpart of
 * `practiceData.ts`, and the module that was missing.
 *
 * Before this existed, all four Mock Test screens carried the source decision inline:
 *
 *     const papers = mode === "local" ? await getMockablePapers(code) : await getMockablePapersLive(code);
 *
 * which meant every one of those screen files imported both a SQLite module and an HTTP
 * module and knew the names of both. Practice never did that — its screens pass `mode`
 * down and never branch on it. This closes that inconsistency: from here the screens ask
 * for mock-test data and this module decides where it comes from.
 *
 * `mode === "unavailable"` returns the same empty results the local path would give for a
 * device with nothing synced, so screens keep rendering their existing offline states
 * (see ui/OfflineNoDataNotice for the "why is this empty" distinction).
 */

export async function getMockablePapers(examCode: string, mode: HybridMode): Promise<SyncedPaper[]> {
  noteHybridMode(mode);
  if (mode === "local") return getMockablePapersLocal(examCode);
  if (mode === "unavailable") return [];
  return getMockablePapersLive(examCode);
}

export async function getPaperById(paperId: string, mode: HybridMode): Promise<SyncedPaper | null> {
  noteHybridMode(mode);
  if (mode === "local") return getPaperByIdLocal(paperId);
  if (mode === "unavailable") return null;
  return getPaperByIdLive(paperId);
}

export async function getSectionAvailability(paper: SyncedPaper, mode: HybridMode): Promise<SectionAvailability[]> {
  noteHybridMode(mode);
  if (mode === "local") return getSectionAvailabilityLocal(paper);
  if (mode === "unavailable") return [];
  return getSectionAvailabilityLive(paper);
}

export async function buildMockTestQuestions(paper: SyncedPaper, mode: HybridMode): Promise<MockTestQuestion[]> {
  noteHybridMode(mode);
  if (mode === "local") return buildMockTestQuestionsLocal(paper);
  if (mode === "unavailable") return [];
  return buildMockTestQuestionsLive(paper);
}
