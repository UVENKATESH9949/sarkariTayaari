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

/** Call when sync completes or connectivity changes, so a stale live snapshot isn't reused after switching to local mode. */
export function resetStructureCache(): void {
  cachedStructures = null;
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
