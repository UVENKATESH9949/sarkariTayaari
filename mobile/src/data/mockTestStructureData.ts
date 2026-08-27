import { getExamStructures, type ExamStructureResponse } from "../api/reference";
import type { SyncedPaper, SyncedSection } from "../db/examStructure";

/**
 * Hybrid (live-API) equivalents of db/examStructure.ts's local reads — built entirely
 * from the already-public GET /api/exam-structures (no new backend endpoint needed:
 * it returns every active exam's whole Stage->Paper->Section->Subjects tree in one
 * call). Reshapes into the exact same SyncedPaper/SyncedSection types the local path
 * exports, so callers don't need to know which source answered.
 */

let cachedStructures: Promise<ExamStructureResponse[]> | null = null;

/**
 * All hybrid structure reads for one screen-render cycle share a single in-flight
 * fetch — Practice's subject/topic screens and Mock Test's browsing screens can all
 * ask for structure data within the same render pass, and this is a whole-exam-list
 * payload anyway (same shape the local path gets once via sync and reuses many times).
 */
function fetchStructures(): Promise<ExamStructureResponse[]> {
  if (!cachedStructures) {
    cachedStructures = getExamStructures().catch((err) => {
      cachedStructures = null; // don't cache a failure — the next call should retry
      throw err;
    });
  }
  return cachedStructures;
}

/** Drops the shared snapshot so the next read refetches. */
export function resetStructureCache(): void {
  cachedStructures = null;
}

let lastSeenMode: string | null = null;

/**
 * Invalidates the snapshot when the hybrid mode changes.
 *
 * `resetStructureCache` existed with a doc comment saying to call it "when sync completes
 * or connectivity changes" and **nothing ever called it** — so the module-level cache was
 * never invalidated for the whole process lifetime. Rather than leave the dead function
 * (or delete it and keep the latent staleness), the mock-test facade now routes every
 * structure read through here, which is the one chokepoint all of them share.
 *
 * Partial by design, and worth knowing: `practiceData.ts`'s `getSyllabusSubjectIdsLive`
 * reads the same cache without going through the facade, so a mode flip triggered only by
 * a Practice-screen read still won't invalidate it. Covering that too means giving
 * Practice the same chokepoint; not done here to keep this change scoped to Mock Test.
 */
export function noteHybridMode(mode: string): void {
  if (lastSeenMode !== null && lastSeenMode !== mode) {
    resetStructureCache();
  }
  lastSeenMode = mode;
}

function toSyncedPaper(structure: ExamStructureResponse): SyncedPaper[] {
  const papers: SyncedPaper[] = [];
  for (const stage of structure.stages) {
    for (const paper of stage.papers) {
      const sections: SyncedSection[] = paper.sections.map((section) => ({
        id: section.id,
        name: section.name,
        questionCount: section.questionCount,
        durationMinutes: section.durationMinutes,
        isSectionallyTimed: section.sectionallyTimed,
        // Server-resolved values, same as the local sync path stores — never re-derive inheritance client-side.
        marksCorrect: section.effectiveMarksCorrect,
        marksWrong: section.effectiveMarksWrong,
        subjectIds: section.subjects.map((s) => s.id),
      }));
      papers.push({
        id: paper.id,
        examCode: structure.examCode,
        stageId: stage.id,
        stageName: stage.name,
        name: paper.name,
        paperType: paper.paperType,
        isMockable: paper.mockable,
        durationMinutes: paper.durationMinutes,
        totalMarks: paper.totalMarks,
        marksCorrect: paper.marksCorrect,
        marksWrong: paper.marksWrong,
        isQualifying: paper.qualifying,
        qualifyingPercentage: paper.qualifyingPercentage,
        sections,
      });
    }
  }
  return papers;
}

export async function getSyllabusSubjectIdsLive(examCode: string | null): Promise<string[] | null> {
  if (!examCode) return null;
  const structures = await fetchStructures();
  const match = structures.find((s) => s.examCode === examCode);
  if (!match || match.syllabusSubjects.length === 0) return null;
  return [...new Set(match.syllabusSubjects.map((s) => s.id))];
}

export async function getExamPapersLive(examCode: string): Promise<SyncedPaper[]> {
  const structures = await fetchStructures();
  const match = structures.find((s) => s.examCode === examCode);
  return match ? toSyncedPaper(match) : [];
}

export async function getMockablePapersLive(examCode: string): Promise<SyncedPaper[]> {
  const papers = await getExamPapersLive(examCode);
  return papers.filter((p) => p.isMockable && p.sections.length > 0);
}

export async function getPaperByIdLive(paperId: string): Promise<SyncedPaper | null> {
  const structures = await fetchStructures();
  for (const structure of structures) {
    const match = toSyncedPaper(structure).find((p) => p.id === paperId);
    if (match) return match;
  }
  return null;
}
