import {
  getExams,
  getSubjects,
  getTopics,
  getDifficultyLevels as getDifficultyLevelsApi,
  getExamBadges as getExamBadgesApi,
  getExamStructures,
  getQuestionCounts,
  getLiveQuestions,
  type ExamResponse,
  type DifficultyLevelResponse,
  type ExamBadgeResponse,
} from "@sarkaritaiyaari/core/api";
import { shuffle } from "../questions/shuffle";
import { toQuestion } from "../questions/fromResponse";
import type { Question } from "../questions/types";

/**
 * Web's Practice data layer. Mirrors what `mobile/src/data/practiceData.ts` does in its
 * "live" branch — this app has no local/live split at all, since decision 2 (online-only)
 * means there is nothing to fall back to.
 */

export const ALL_EXAMS = "ALL";
const PRACTICE_QUESTION_LIMIT = 200;

function examFilter(examCode: string | null): string | undefined {
  return examCode && examCode !== ALL_EXAMS ? examCode : undefined;
}

export type ExamOption = ExamResponse & { questionCount: number };

export async function getPracticeExams(): Promise<ExamOption[]> {
  const [exams, counts] = await Promise.all([getExams(), getQuestionCounts({ groupBy: "exam" })]);
  return exams.map((e) => ({ ...e, questionCount: counts[e.code] ?? 0 }));
}

export type DifficultyLevel = DifficultyLevelResponse;
export function getDifficultyLevels(): Promise<DifficultyLevel[]> {
  return getDifficultyLevelsApi();
}

export type ExamBadge = ExamBadgeResponse;
export function getExamBadges(): Promise<ExamBadge[]> {
  return getExamBadgesApi();
}

/** The syllabus subject ids for one exam, or null for "All Exams" (no scoping). */
async function getSyllabusSubjectIds(examCode: string | null): Promise<string[] | null> {
  const exam = examFilter(examCode);
  if (!exam) return null;
  const structures = await getExamStructures();
  const structure = structures.find((s) => s.examCode === exam);
  return structure ? structure.syllabusSubjects.map((s) => s.id) : null;
}

export type SubjectStat = {
  id: string;
  name: string;
  questionCount: number;
  icon: string | null;
  color: string | null;
  colorBg: string | null;
};

export async function getSubjectStats(examCode: string | null): Promise<SubjectStat[]> {
  const exam = examFilter(examCode);
  const [allSubjects, syllabusSubjectIds, counts] = await Promise.all([
    getSubjects(),
    getSyllabusSubjectIds(examCode),
    getQuestionCounts({ groupBy: "subject", examCode: exam }),
  ]);
  const scoped = syllabusSubjectIds ? allSubjects.filter((s) => syllabusSubjectIds.includes(s.id)) : allSubjects;
  return scoped.map((s) => ({
    id: s.id,
    name: s.name,
    questionCount: counts[s.id] ?? 0,
    icon: s.icon,
    color: s.color,
    colorBg: s.colorBg,
  }));
}

export type TopicStat = { id: string; name: string; questionCount: number };

export async function getTopicStats(subjectId: string, examCode: string | null): Promise<TopicStat[]> {
  const exam = examFilter(examCode);
  const [subjectTopics, counts] = await Promise.all([
    getTopics({ subjectId }),
    getQuestionCounts({ groupBy: "topic", subjectId, examCode: exam }),
  ]);
  return subjectTopics.map((t) => ({ id: t.id, name: t.name, questionCount: counts[t.id] ?? 0 }));
}

export async function getDifficultyCounts(topicId: string, examCode: string | null): Promise<Record<string, number>> {
  const exam = examFilter(examCode);
  return getQuestionCounts({ groupBy: "difficulty", topicId, examCode: exam });
}

export async function getPracticeQuestions(
  topicId: string,
  difficulty: string,
  examCode: string | null,
): Promise<Question[]> {
  const exam = examFilter(examCode);
  const page = await getLiveQuestions({
    topicId,
    difficulty: difficulty === "all" ? undefined : difficulty,
    examCode: exam,
    size: PRACTICE_QUESTION_LIMIT,
  });

  const result: Question[] = page.content.map((q) =>
    toQuestion(q, { isPyq: q.pyq ?? false, pyqYear: q.pyqYear ?? null, pyqShift: q.pyqShift ?? null }),
  );
  return shuffle(result);
}
