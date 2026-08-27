import { asc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import {
  difficultyLevels,
  examBadges,
  examPapers,
  examStages,
  examSubjects,
  paperSections,
  sectionSubjects,
} from "./schema";

export type SyncedSection = {
  id: string;
  name: string;
  questionCount: number;
  /** null = shares the paper's overall time. */
  durationMinutes: number | null;
  isSectionallyTimed: boolean;
  /** Already resolved server-side, so inheritance is never re-derived here. */
  marksCorrect: number | null;
  marksWrong: number | null;
  subjectIds: string[];
};

export type SyncedPaper = {
  id: string;
  examCode: string;
  stageId: string;
  stageName: string;
  name: string;
  paperType: string;
  isMockable: boolean;
  durationMinutes: number | null;
  totalMarks: number | null;
  marksCorrect: number | null;
  marksWrong: number | null;
  isQualifying: boolean;
  qualifyingPercentage: number | null;
  sections: SyncedSection[];
};

export type DifficultyLevel = {
  code: string;
  label: string;
  color: string | null;
  colorBg: string | null;
  icon: string | null;
};

export type ExamBadge = {
  code: string;
  label: string;
  color: string | null;
  colorBg: string | null;
};

/** Every paper in an exam's structure, ordered by stage then paper. */
export async function getExamPapers(examCode: string): Promise<SyncedPaper[]> {
  const paperRows = await db
    .select({
      id: examPapers.id,
      stageId: examPapers.stageId,
      stageName: examStages.name,
      stageOrder: examStages.displayOrder,
      examCode: examPapers.examCode,
      name: examPapers.name,
      paperType: examPapers.paperType,
      isMockable: examPapers.isMockable,
      durationMinutes: examPapers.durationMinutes,
      totalMarks: examPapers.totalMarks,
      marksCorrect: examPapers.marksCorrect,
      marksWrong: examPapers.marksWrong,
      isQualifying: examPapers.isQualifying,
      qualifyingPercentage: examPapers.qualifyingPercentage,
      displayOrder: examPapers.displayOrder,
    })
    .from(examPapers)
    .innerJoin(examStages, eq(examStages.id, examPapers.stageId))
    .where(eq(examPapers.examCode, examCode))
    .all();

  if (paperRows.length === 0) return [];

  paperRows.sort((a, b) => a.stageOrder - b.stageOrder || a.displayOrder - b.displayOrder);

  const paperIds = paperRows.map((p) => p.id);
  const sectionRows = await db
    .select()
    .from(paperSections)
    .where(inArray(paperSections.paperId, paperIds))
    .orderBy(asc(paperSections.displayOrder))
    .all();

  const sectionIds = sectionRows.map((s) => s.id);
  const subjectLinks = sectionIds.length
    ? await db.select().from(sectionSubjects).where(inArray(sectionSubjects.sectionId, sectionIds)).all()
    : [];

  const subjectsBySection = new Map<string, string[]>();
  for (const link of subjectLinks) {
    const existing = subjectsBySection.get(link.sectionId) ?? [];
    existing.push(link.subjectId);
    subjectsBySection.set(link.sectionId, existing);
  }

  const sectionsByPaper = new Map<string, SyncedSection[]>();
  for (const row of sectionRows) {
    const existing = sectionsByPaper.get(row.paperId) ?? [];
    existing.push({
      id: row.id,
      name: row.name,
      questionCount: row.questionCount,
      durationMinutes: row.durationMinutes,
      isSectionallyTimed: row.isSectionallyTimed,
      marksCorrect: row.marksCorrect,
      marksWrong: row.marksWrong,
      subjectIds: subjectsBySection.get(row.id) ?? [],
    });
    sectionsByPaper.set(row.paperId, existing);
  }

  return paperRows.map((p) => ({
    id: p.id,
    examCode: p.examCode,
    stageId: p.stageId,
    stageName: p.stageName,
    name: p.name,
    paperType: p.paperType,
    isMockable: p.isMockable,
    durationMinutes: p.durationMinutes,
    totalMarks: p.totalMarks,
    marksCorrect: p.marksCorrect,
    marksWrong: p.marksWrong,
    isQualifying: p.isQualifying,
    qualifyingPercentage: p.qualifyingPercentage,
    sections: sectionsByPaper.get(p.id) ?? [],
  }));
}

/**
 * Only papers a test can actually be generated from: the type must allow it and the
 * paper must have at least one section to draw from. Descriptive and interview papers
 * are part of the pattern but are not mock tests.
 */
export async function getMockablePapers(examCode: string): Promise<SyncedPaper[]> {
  const papers = await getExamPapers(examCode);
  return papers.filter((p) => p.isMockable && p.sections.length > 0);
}

export async function getPaperById(paperId: string): Promise<SyncedPaper | null> {
  const row = await db.select({ examCode: examPapers.examCode }).from(examPapers).where(eq(examPapers.id, paperId)).get();
  if (!row) return null;
  const papers = await getExamPapers(row.examCode);
  return papers.find((p) => p.id === paperId) ?? null;
}

/**
 * The subject ids an exam's syllabus covers.
 *
 * Read from the explicit `exam_subjects` mapping rather than derived from sections: a
 * subject belongs to many exams, and an exam can cover a subject before any paper
 * pattern exists for it. Deriving it from sections meant an exam without a pattern had
 * no syllabus at all.
 *
 * Returns null when the exam has no syllabus recorded — the caller falls back to
 * showing everything rather than an empty screen, since that means "not filled in yet",
 * not "this exam covers nothing".
 */
export async function getSyllabusSubjectIds(examCode: string | null): Promise<string[] | null> {
  if (!examCode) return null;

  const rows = await db
    .select({ subjectId: examSubjects.subjectId })
    .from(examSubjects)
    .where(eq(examSubjects.examCode, examCode))
    .all();

  if (rows.length === 0) return null;
  return [...new Set(rows.map((r) => r.subjectId))];
}

/** Whatever levels were synced, in display order — no hardcoded set. */
export async function getDifficultyLevels(): Promise<DifficultyLevel[]> {
  return db
    .select({
      code: difficultyLevels.code,
      label: difficultyLevels.label,
      color: difficultyLevels.color,
      colorBg: difficultyLevels.colorBg,
      icon: difficultyLevels.icon,
    })
    .from(difficultyLevels)
    .orderBy(asc(difficultyLevels.displayOrder))
    .all();
}

/** Whatever badges were synced, in display order — same no-hardcoded-set reasoning. */
export async function getExamBadges(): Promise<ExamBadge[]> {
  return db
    .select({
      code: examBadges.code,
      label: examBadges.label,
      color: examBadges.color,
      colorBg: examBadges.colorBg,
    })
    .from(examBadges)
    .orderBy(asc(examBadges.displayOrder))
    .all();
}
