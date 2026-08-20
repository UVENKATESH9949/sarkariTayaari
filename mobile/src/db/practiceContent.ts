import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./client";
import { exams, questionExams, questions, questionTranslations, subjects, topics } from "./schema";
import { getSyllabusSubjectIds } from "./examStructure";
import { resolveCorrectIndex } from "./answerResolution";

const ALL_EXAMS = "ALL";

function examFilter(examCode: string | null) {
  return examCode && examCode !== ALL_EXAMS ? examCode : null;
}

export type ExamOption = { code: string; name: string; questionCount: number };

export async function getSyncedExams(): Promise<ExamOption[]> {
  const list = await db
    .select({ code: exams.code, name: exams.name })
    .from(exams)
    .orderBy(asc(exams.displayOrder))
    .all();

  // One extra count query, not N — the Practice list shows how much is actually
  // synced per exam, which is a truer "is this ready to practice?" signal than a
  // bare name and matters most for an exam that was just added and has nothing yet.
  const rows = await db
    .select({ examCode: questionExams.examCode, cnt: sql<number>`count(*)` })
    .from(questionExams)
    .innerJoin(questions, eq(questions.id, questionExams.questionId))
    .where(eq(questions.isDeleted, false))
    .groupBy(questionExams.examCode)
    .all();
  const countByExam = new Map(rows.map((r) => [r.examCode, r.cnt]));

  return list.map((e) => ({ ...e, questionCount: countByExam.get(e.code) ?? 0 }));
}

export type SubjectStat = {
  id: string;
  name: string;
  questionCount: number;
  icon: string | null;
  color: string | null;
  colorBg: string | null;
};

/**
 * Subjects for an exam, scoped to what that exam's syllabus actually covers.
 *
 * Subjects are global, so this previously listed all of them for every exam — SSC CGL
 * showed Computer Knowledge, which isn't in its pattern. The exam's sections now say
 * which subjects it covers. When an exam has no structure defined yet, everything is
 * shown rather than nothing: that's a missing pattern, not a claim that the exam
 * covers no subjects.
 */
export async function getSubjectStats(examCode: string | null): Promise<SubjectStat[]> {
  const exam = examFilter(examCode);
  const syllabusSubjectIds = await getSyllabusSubjectIds(exam);

  const allSubjects = await db
    .select()
    .from(subjects)
    .orderBy(asc(subjects.displayOrder), asc(subjects.name))
    .all();

  const scopedSubjects = syllabusSubjectIds
    ? allSubjects.filter((s) => syllabusSubjectIds.includes(s.id))
    : allSubjects;

  const rows = exam
    ? await db
        .select({ subjectId: questions.subjectId, cnt: sql<number>`count(*)` })
        .from(questions)
        .innerJoin(questionExams, eq(questionExams.questionId, questions.id))
        .where(and(eq(questionExams.examCode, exam), eq(questions.isDeleted, false)))
        .groupBy(questions.subjectId)
        .all()
    : await db
        .select({ subjectId: questions.subjectId, cnt: sql<number>`count(*)` })
        .from(questions)
        .where(eq(questions.isDeleted, false))
        .groupBy(questions.subjectId)
        .all();

  const countBySubject = new Map(rows.map((r) => [r.subjectId, r.cnt]));
  return scopedSubjects.map((s) => ({
    id: s.id,
    name: s.name,
    questionCount: countBySubject.get(s.id) ?? 0,
    icon: s.icon,
    color: s.color,
    colorBg: s.colorBg,
  }));
}

export type TopicStat = { id: string; name: string; questionCount: number };

export async function getTopicStats(subjectId: string, examCode: string | null): Promise<TopicStat[]> {
  const subjectTopics = await db
    .select()
    .from(topics)
    .where(eq(topics.subjectId, subjectId))
    .orderBy(asc(topics.displayOrder), asc(topics.name))
    .all();
  const exam = examFilter(examCode);

  const rows = exam
    ? await db
        .select({ topicId: questions.topicId, cnt: sql<number>`count(*)` })
        .from(questions)
        .innerJoin(questionExams, eq(questionExams.questionId, questions.id))
        .where(and(eq(questions.subjectId, subjectId), eq(questionExams.examCode, exam), eq(questions.isDeleted, false)))
        .groupBy(questions.topicId)
        .all()
    : await db
        .select({ topicId: questions.topicId, cnt: sql<number>`count(*)` })
        .from(questions)
        .where(and(eq(questions.subjectId, subjectId), eq(questions.isDeleted, false)))
        .groupBy(questions.topicId)
        .all();

  const countByTopic = new Map(rows.map((r) => [r.topicId, r.cnt]));
  return subjectTopics.map((t) => ({ id: t.id, name: t.name, questionCount: countByTopic.get(t.id) ?? 0 }));
}

/** Keyed by difficulty code — whatever levels exist, not a fixed three. */
export type DifficultyCounts = Record<string, number>;

export async function getDifficultyCounts(topicId: string, examCode: string | null): Promise<DifficultyCounts> {
  const exam = examFilter(examCode);

  const rows = exam
    ? await db
        .select({ difficulty: questions.difficulty, cnt: sql<number>`count(*)` })
        .from(questions)
        .innerJoin(questionExams, eq(questionExams.questionId, questions.id))
        .where(and(eq(questions.topicId, topicId), eq(questionExams.examCode, exam), eq(questions.isDeleted, false)))
        .groupBy(questions.difficulty)
        .all()
    : await db
        .select({ difficulty: questions.difficulty, cnt: sql<number>`count(*)` })
        .from(questions)
        .where(and(eq(questions.topicId, topicId), eq(questions.isDeleted, false)))
        .groupBy(questions.difficulty)
        .all();

  const result: DifficultyCounts = {};
  for (const row of rows) {
    result[row.difficulty] = row.cnt;
  }
  return result;
}

export type PracticeQuestionTranslation = {
  questionText: string;
  options: string[];
  explanation: string;
};

export type PracticeQuestion = {
  id: string;
  correctIndex: number;
  translations: Record<string, PracticeQuestionTranslation>;
};

export async function getPracticeQuestions(
  /** A synced difficulty code, or "all" for a mixed set. */
  topicId: string,
  difficulty: string,
  examCode: string | null,
): Promise<PracticeQuestion[]> {
  const exam = examFilter(examCode);
  const baseConditions = [eq(questions.topicId, topicId), eq(questions.isDeleted, false)];
  if (difficulty !== "all") {
    baseConditions.push(eq(questions.difficulty, difficulty));
  }

  const matched = exam
    ? await db
        .select({ id: questions.id, correctAnswer: questions.correctAnswer })
        .from(questions)
        .innerJoin(questionExams, eq(questionExams.questionId, questions.id))
        .where(and(...baseConditions, eq(questionExams.examCode, exam)))
        .orderBy(sql`RANDOM()`)
        .all()
    : await db
        .select({ id: questions.id, correctAnswer: questions.correctAnswer })
        .from(questions)
        .where(and(...baseConditions))
        .orderBy(sql`RANDOM()`)
        .all();

  if (matched.length === 0) return [];

  const questionIds = matched.map((q) => q.id);
  const translationRows = await db
    .select()
    .from(questionTranslations)
    .where(inArray(questionTranslations.questionId, questionIds))
    .all();

  const translationsByQuestion = new Map<string, Record<string, PracticeQuestionTranslation>>();
  for (const row of translationRows) {
    const forQuestion = translationsByQuestion.get(row.questionId) ?? {};
    forQuestion[row.languageCode] = {
      questionText: row.questionText,
      options: row.options,
      explanation: row.explanation ?? "",
    };
    translationsByQuestion.set(row.questionId, forQuestion);
  }

  return matched.map((q) => {
    const translations = translationsByQuestion.get(q.id) ?? {};
    const englishOptions = translations.en?.options ?? Object.values(translations)[0]?.options ?? [];
    return {
      id: q.id,
      correctIndex: resolveCorrectIndex(q.correctAnswer, englishOptions),
      translations,
    };
  });
}
