import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./client";
import {
  exams,
  practiceSessionResults,
  questionExams,
  questions,
  questionTranslations,
  subjects,
  topics,
} from "./schema";
import { getSyllabusSubjectIds } from "./examStructure";
import { isIndexBasedType, resolveCorrectIndex } from "@sarkaritaiyaari/core/evaluation";

const ALL_EXAMS = "ALL";

/**
 * How many questions one practice session contains.
 *
 * NOW A PRODUCT DECISION, NOT JUST A SAFETY CAP. It was 200 — a ceiling chosen only to stop
 * a crash (see below) — which in practice meant a session was "however many questions this
 * topic happens to have", so a 117-question topic was a 117-question sitting. Twenty is a
 * session a student can actually finish, and it matches `MIXED_PRACTICE_QUESTION_LIMIT`
 * below, so the two kinds of practice session are the same length.
 *
 * The local read draws its set with `ORDER BY RANDOM()`, so consecutive sessions on the
 * same topic are genuinely different questions rather than the same twenty re-shuffled.
 * The LIVE path (before the first sync completes) cannot promise that — it pages the
 * backend deterministically and only shuffles what it got — which is why the Practice
 * screen states the fresh-set promise only when it is reading locally.
 *
 * The original reason for having a cap at all still holds and must not be removed: the
 * `inArray` translation lookup below binds one parameter per matched question, so an
 * uncapped topic with more questions than SQLite's `SQLITE_MAX_VARIABLE_NUMBER` (999 on
 * older builds) would fail outright.
 *
 * Shared with the live path (`data/practiceData.ts`) so local and live can't drift into
 * returning materially different amounts for the same call.
 */
export const PRACTICE_QUESTION_LIMIT = 20;

function examFilter(examCode: string | null) {
  return examCode && examCode !== ALL_EXAMS ? examCode : null;
}

export type ExamOption = {
  code: string;
  name: string;
  questionCount: number;
  /** difficulty_levels code, or null. Resolved to a label/colour/icon at render time. */
  difficulty: string | null;
  /** exam_badges code, or null. */
  badge: string | null;
  /** Admin-uploaded logo, or null to fall back to the exam-family icon. */
  imageUrl: string | null;
};

export async function getSyncedExams(): Promise<ExamOption[]> {
  const list = await db
    .select({
      code: exams.code,
      name: exams.name,
      difficulty: exams.difficulty,
      badge: exams.badge,
      imageUrl: exams.imageUrl,
    })
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

/**
 * How many of each topic's questions the student has actually practised, for one subject.
 *
 * COUNT(DISTINCT question_id), not a running total of answers. `user_topic_progress`'s
 * `attemptedCount` already exists and is the obvious thing to reach for, but it accumulates
 * (`existing + totalCount` on every session), so a student who practises a 117-question topic
 * five times has 100 against 117 and would eventually read past 100%. That figure measures
 * VOLUME of practice; this one measures COVERAGE of the topic, and only the second can honestly
 * drive a 0-100% bar.
 *
 * The predicates here are deliberately identical to `getTopicStats`'s: same subject, same exam
 * filter, same `isDeleted` exclusion. That is what guarantees the numerator is a subset of the
 * denominator — practise a topic under "All exams" and the questions you saw that are not tagged
 * to THIS exam are excluded from both sides, so the bar cannot exceed full.
 *
 * Practice results only, and that is a real limitation rather than an oversight: mock attempts
 * also answer questions, but combining the two needs the UNION of the two id sets, and adding
 * two `count(distinct ...)` results would double-count anything answered in both and could
 * render as "134 of 117". The honest union needs raw SQL this module has no precedent for, or
 * pulling every attempted id into JS. Practice coverage on the Practice screen is the narrower
 * claim, and it is the one the label makes.
 */
export async function getTopicCoverage(
  subjectId: string,
  examCode: string | null,
): Promise<Map<string, number>> {
  const exam = examFilter(examCode);
  const projection = {
    topicId: questions.topicId,
    practised: sql<number>`count(distinct ${practiceSessionResults.questionId})`,
  };

  const rows = exam
    ? await db
        .select(projection)
        .from(practiceSessionResults)
        .innerJoin(questions, eq(questions.id, practiceSessionResults.questionId))
        .innerJoin(questionExams, eq(questionExams.questionId, questions.id))
        .where(
          and(
            eq(questions.subjectId, subjectId),
            eq(questionExams.examCode, exam),
            eq(questions.isDeleted, false),
          ),
        )
        .groupBy(questions.topicId)
        .all()
    : await db
        .select(projection)
        .from(practiceSessionResults)
        .innerJoin(questions, eq(questions.id, practiceSessionResults.questionId))
        .where(and(eq(questions.subjectId, subjectId), eq(questions.isDeleted, false)))
        .groupBy(questions.topicId)
        .all();

  return new Map(rows.map((r) => [r.topicId, r.practised]));
}

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
  /** Assertion & Reason's / Statement-Based's authored content (TASK-2301 Phase P2 Wave A). */
  content?: Record<string, unknown> | null;
};

export type PracticeQuestion = {
  id: string;
  /**
   * Meaningful only for SINGLE_CHOICE/ASSERTION_REASON/STATEMENT_COMBINATION — the three
   * types with a genuine single correct index. `null` for MULTIPLE_CHOICE/TRUE_FALSE, whose
   * `answerKey` below is the only authoritative source of truth (TASK-2301 Phase P2 Wave A).
   * Kept rather than removed: OptionList's `correctIndex` prop and every review screen that
   * already reads it keep working unchanged for the three types that still have one.
   */
  correctIndex: number | null;
  /** "SINGLE_CHOICE" when absent — every question synced before this phase is one. */
  questionType?: string;
  answerKey?: Record<string, unknown> | null;
  /** MATCH's leftKeys/rightKeys, ORDERING's itemKeys — language-independent (TASK-2301 Phase P2 Wave B). */
  contentStructure?: Record<string, unknown> | null;
  /** Set when this question belongs to a shared passage/group (TASK-2301 Phase P3) — null for a standalone question. */
  questionGroupId?: string | null;
  translations: Record<string, PracticeQuestionTranslation>;
  /**
   * Epic L / TICKET-2104 — previous-year provenance, rendered as a badge on the question.
   *
   * Optional rather than required so the live (HTTP) path can omit it when talking to a backend
   * that predates V13, and so nothing that constructs a PracticeQuestion for another purpose
   * has to invent values.
   */
  isPyq?: boolean;
  pyqYear?: number | null;
  pyqShift?: string | null;
  /**
   * Which of the requested topics this question belongs to — set only by
   * `getMixedPracticeQuestions` below. A single-topic session already knows its one topicId
   * from its own route params, so `getPracticeQuestions` leaves this undefined rather than
   * carrying a redundant column on every row.
   */
  topicId?: string;
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

  // The three PYQ columns are added to the existing projection rather than fetched in a second
  // query: they are scalars already on the row this query reads, so carrying them costs nothing,
  // where a follow-up lookup would be a second round trip on the quiz-open path. questionType/
  // answerKey (TASK-2301 Phase P2 Wave A) are the same kind of cheap addition.
  const projection = {
    id: questions.id,
    correctAnswer: questions.correctAnswer,
    isPyq: questions.isPyq,
    pyqYear: questions.pyqYear,
    pyqShift: questions.pyqShift,
    questionType: questions.questionType,
    answerKey: questions.answerKey,
    contentStructure: questions.contentStructure,
    questionGroupId: questions.questionGroupId,
  };

  const matched = exam
    ? await db
        .select(projection)
        .from(questions)
        .innerJoin(questionExams, eq(questionExams.questionId, questions.id))
        .where(and(...baseConditions, eq(questionExams.examCode, exam)))
        .orderBy(sql`RANDOM()`)
        .limit(PRACTICE_QUESTION_LIMIT)
        .all()
    : await db
        .select(projection)
        .from(questions)
        .where(and(...baseConditions))
        .orderBy(sql`RANDOM()`)
        .limit(PRACTICE_QUESTION_LIMIT)
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
      content: row.content,
    };
    translationsByQuestion.set(row.questionId, forQuestion);
  }

  return matched.map((q) => {
    const translations = translationsByQuestion.get(q.id) ?? {};
    const englishOptions = translations.en?.options ?? Object.values(translations)[0]?.options ?? [];
    // MULTIPLE_CHOICE/TRUE_FALSE have no single correct index — correct_answer is a display
    // string for those two ("A,C" / "TRUE"), not a letter matching an option, so resolving it
    // would produce a wrong or meaningless index (TASK-2301 Phase P2 Wave A). answerKey is
    // the only source of truth those two types' evaluators read.
    const questionType = q.questionType ?? "SINGLE_CHOICE";
    const correctIndex = isIndexBasedType(questionType)
      ? resolveCorrectIndex(q.correctAnswer, englishOptions)
      : null;
    return {
      id: q.id,
      correctIndex,
      questionType,
      answerKey: q.answerKey,
      contentStructure: q.contentStructure,
      questionGroupId: q.questionGroupId,
      translations,
      isPyq: q.isPyq,
      pyqYear: q.pyqYear,
      pyqShift: q.pyqShift,
    };
  });
}

/**
 * A "Mixed Topics" session's question set — several topics in one sitting, capped small
 * because this is a quick mixed drill, not a full practice set. Reuses `getPracticeQuestions`'s
 * exact translation-join and answer-resolution logic; the only real difference is `inArray`
 * over a topic set instead of `eq` on one, and carrying `topicId` on each returned row so the
 * caller can tell which topic an answered question belonged to (a single-topic session never
 * needs this — it already knows the one topic from its own route params).
 *
 * The sample size scales a little with how many topics were asked for (more topics, more
 * questions), capped at `PRACTICE_QUESTION_LIMIT`'s usual ceiling divided down — this is a
 * plain, honest random draw across the combined pool, not a per-topic balanced split. A topic
 * with far more question coverage than the others can end up over-represented; stated here
 * rather than quietly assumed even, since building genuine per-topic balancing would mean N
 * separate queries (the N+1 shape this project has fixed as a real bug more than once).
 */
export const MIXED_PRACTICE_QUESTION_LIMIT = 20;

export async function getMixedPracticeQuestions(
  topicIds: string[],
  examCode: string | null,
): Promise<PracticeQuestion[]> {
  if (topicIds.length === 0) return [];
  const exam = examFilter(examCode);
  const baseConditions = [inArray(questions.topicId, topicIds), eq(questions.isDeleted, false)];
  const limit = Math.min(MIXED_PRACTICE_QUESTION_LIMIT, Math.max(10, topicIds.length * 4));

  const projection = {
    id: questions.id,
    correctAnswer: questions.correctAnswer,
    isPyq: questions.isPyq,
    pyqYear: questions.pyqYear,
    pyqShift: questions.pyqShift,
    questionType: questions.questionType,
    answerKey: questions.answerKey,
    contentStructure: questions.contentStructure,
    questionGroupId: questions.questionGroupId,
    topicId: questions.topicId,
  };

  const matched = exam
    ? await db
        .select(projection)
        .from(questions)
        .innerJoin(questionExams, eq(questionExams.questionId, questions.id))
        .where(and(...baseConditions, eq(questionExams.examCode, exam)))
        .orderBy(sql`RANDOM()`)
        .limit(limit)
        .all()
    : await db
        .select(projection)
        .from(questions)
        .where(and(...baseConditions))
        .orderBy(sql`RANDOM()`)
        .limit(limit)
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
      content: row.content,
    };
    translationsByQuestion.set(row.questionId, forQuestion);
  }

  return matched.map((q) => {
    const translations = translationsByQuestion.get(q.id) ?? {};
    const englishOptions = translations.en?.options ?? Object.values(translations)[0]?.options ?? [];
    const questionType = q.questionType ?? "SINGLE_CHOICE";
    const correctIndex = isIndexBasedType(questionType)
      ? resolveCorrectIndex(q.correctAnswer, englishOptions)
      : null;
    return {
      id: q.id,
      correctIndex,
      questionType,
      answerKey: q.answerKey,
      contentStructure: q.contentStructure,
      questionGroupId: q.questionGroupId,
      translations,
      isPyq: q.isPyq,
      pyqYear: q.pyqYear,
      pyqShift: q.pyqShift,
      topicId: q.topicId,
    };
  });
}
