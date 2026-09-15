import {
  getExams,
  getExamStructures,
  getMockAvailabilityCount,
  getMockSample,
  type ExamResponse,
  type ExamStructureResponse,
} from "@sarkaritaiyaari/core/api";
import { toQuestion } from "../questions/fromResponse";
import type { Question } from "../questions/types";
import type { MockPaper, MockSection, SectionAvailability } from "./types";

/**
 * Web's Mock Test data layer — built entirely from the already-public
 * `GET /api/exam-structures` plus the `/mock-count`/`/mock-sample` pair, exactly the
 * endpoints Phase 1's research identified as needing zero new backend work. No hybrid
 * local/live cache-invalidation logic (mobile's `mockTestStructureData.ts` needs one because
 * it also serves an offline-first local database; a browser tab reloading is the only
 * "refresh" this app needs, so a plain per-call fetch is enough).
 */

function toMockPaper(structure: ExamStructureResponse): MockPaper[] {
  const papers: MockPaper[] = [];
  for (const stage of structure.stages) {
    for (const paper of stage.papers) {
      const sections: MockSection[] = paper.sections.map((section) => ({
        id: section.id,
        name: section.name,
        questionCount: section.questionCount,
        durationMinutes: section.durationMinutes,
        isSectionallyTimed: section.sectionallyTimed,
        marksCorrect: section.effectiveMarksCorrect,
        marksWrong: section.effectiveMarksWrong,
        subjectIds: section.subjects.map((s) => s.id),
      }));
      papers.push({
        id: paper.id,
        examCode: structure.examCode,
        examName: structure.examName,
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

function mockablePapersOf(structure: ExamStructureResponse): MockPaper[] {
  return toMockPaper(structure).filter((p) => p.isMockable && p.sections.length > 0);
}

export type MockExamOption = ExamResponse & { mockablePaperCount: number };

/** Exams that have at least one mockable paper — the exam picker only shows these. */
export async function getMockTestExams(): Promise<MockExamOption[]> {
  const [exams, structures] = await Promise.all([getExams(), getExamStructures()]);
  const countByCode = new Map(structures.map((s) => [s.examCode, mockablePapersOf(s).length]));
  return exams
    .map((e) => ({ ...e, mockablePaperCount: countByCode.get(e.code) ?? 0 }))
    .filter((e) => e.mockablePaperCount > 0);
}

export async function getMockablePapers(examCode: string): Promise<MockPaper[]> {
  const structures = await getExamStructures();
  const match = structures.find((s) => s.examCode === examCode);
  return match ? mockablePapersOf(match) : [];
}

export async function getPaperById(paperId: string): Promise<MockPaper | null> {
  const structures = await getExamStructures();
  for (const structure of structures) {
    const match = toMockPaper(structure).find((p) => p.id === paperId);
    if (match) return match;
  }
  return null;
}

export async function getSectionAvailability(paper: MockPaper): Promise<SectionAvailability[]> {
  const results: SectionAvailability[] = [];
  for (const section of paper.sections) {
    const available =
      section.subjectIds.length === 0 ? 0 : (await getMockAvailabilityCount(paper.examCode, section.subjectIds)).count;
    results.push({
      sectionName: section.name,
      requested: section.questionCount,
      available: Math.min(available, section.questionCount),
      durationMinutes: section.durationMinutes,
    });
  }
  return results;
}

/** Total attempt duration: the sum of section times if sectionally timed, else the paper's own duration. */
export function totalDurationMinutes(paper: MockPaper): number {
  const sectional = paper.sections.filter((s) => s.isSectionallyTimed && s.durationMinutes !== null);
  if (sectional.length === paper.sections.length && sectional.length > 0) {
    return sectional.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
  }
  return paper.durationMinutes ?? 60;
}

export async function buildMockTestQuestions(paper: MockPaper): Promise<Question[]> {
  const all: Question[] = [];

  for (const section of paper.sections) {
    if (section.subjectIds.length === 0) continue;

    const sample = await getMockSample(paper.examCode, section.subjectIds, section.questionCount);
    for (const q of sample) {
      all.push(toQuestion(q, { sectionName: section.name, subjectName: q.subjectName }));
    }
  }

  return all;
}
