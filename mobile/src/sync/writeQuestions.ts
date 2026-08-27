import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  difficultyLevels,
  examBadges,
  examPapers,
  examStages,
  examSubjects,
  exams,
  languages,
  paperSections,
  paperTypes,
  questionExams,
  questions,
  questionTranslations,
  sectionSubjects,
  subjects,
  topics,
} from "../db/schema";
import { getLanguages, type QuestionResponse } from "../api/questions";
import {
  getDifficultyLevels,
  getExamBadges,
  getExamStructures,
  getExams,
  getPaperTypes,
  getSubjects,
  getTopics,
} from "../api/reference";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function writeLanguages() {
  const langs = await getLanguages();
  for (const lang of langs) {
    await db
      .insert(languages)
      .values({ code: lang.code, name: lang.name, isActive: true })
      .onConflictDoUpdate({
        target: languages.code,
        set: { name: lang.name },
      });
  }
}

/**
 * Writes exams/subjects/topics — the shared reference data questions are
 * tagged against. Small, changes rarely, and has no delta/since concept on
 * the server, so it's simplest to just refetch and upsert the whole set on
 * every sync (initial or delta) rather than tracking its own sync_meta.
 */
export async function writeReferenceData() {
  const [examList, subjectList, topicList, difficultyList, paperTypeList, badgeList, structures] =
    await Promise.all([
      getExams(),
      getSubjects(),
      getTopics(),
      getDifficultyLevels(),
      getPaperTypes(),
      getExamBadges(),
      getExamStructures(),
    ]);

  for (const exam of examList) {
    // Listed once and reused for both halves of the upsert: a field present in `values`
    // but missing from `set` silently never updates on an existing row, which is the
    // failure mode this shape exists to prevent.
    const fields = {
      name: exam.name,
      imageUrl: exam.imageUrl,
      displayOrder: exam.displayOrder,
      difficulty: exam.difficulty,
      badge: exam.badge,
    };
    await db
      .insert(exams)
      .values({ code: exam.code, ...fields })
      .onConflictDoUpdate({ target: exams.code, set: fields });
  }

  // Subjects and topics are upserted rather than replaced: questions reference them,
  // so wiping the table would break those rows mid-sync.
  for (const subject of subjectList) {
    const fields = {
      name: subject.name,
      displayOrder: subject.displayOrder,
      icon: subject.icon,
      color: subject.color,
      colorBg: subject.colorBg,
    };
    await db
      .insert(subjects)
      .values({ id: subject.id, ...fields })
      .onConflictDoUpdate({ target: subjects.id, set: fields });
  }

  for (const topic of topicList) {
    const fields = {
      subjectId: topic.subjectId,
      subjectName: topic.subjectName,
      name: topic.name,
      displayOrder: topic.displayOrder,
    };
    await db
      .insert(topics)
      .values({ id: topic.id, ...fields })
      .onConflictDoUpdate({ target: topics.id, set: fields });
  }

  // Difficulty levels, paper types and exam badges are small, self-contained lookups
  // with nothing referencing them locally (exams.difficulty/badge are plain text
  // columns), so a full replace is the simplest way to pick up removals and
  // deactivations.
  await db.transaction(async (tx) => {
    await tx.delete(difficultyLevels);
    if (difficultyList.length > 0) {
      await tx.insert(difficultyLevels).values(
        difficultyList.map((level) => ({
          code: level.code,
          label: level.label,
          displayOrder: level.displayOrder,
          color: level.color,
          colorBg: level.colorBg,
          icon: level.icon,
        })),
      );
    }

    await tx.delete(paperTypes);
    if (paperTypeList.length > 0) {
      await tx.insert(paperTypes).values(
        paperTypeList.map((type) => ({
          code: type.code,
          label: type.label,
          mockable: type.mockable,
          displayOrder: type.displayOrder,
        })),
      );
    }

    await tx.delete(examBadges);
    if (badgeList.length > 0) {
      await tx.insert(examBadges).values(
        badgeList.map((badge) => ({
          code: badge.code,
          label: badge.label,
          displayOrder: badge.displayOrder,
          color: badge.color,
          colorBg: badge.colorBg,
        })),
      );
    }
  });

  await writeExamStructures(structures);
}

/**
 * Replaces the whole structure tree rather than upserting it. There's no delta concept
 * for structure on the server, and a stage/paper/section deleted there has to disappear
 * here too — an upsert-only pass would leave orphaned rows behind forever.
 *
 * Rows are gathered first and inserted in one statement per table: the mock-test submit
 * bug showed that awaiting one insert per row against SQLite is what makes this slow.
 */
async function writeExamStructures(structures: Awaited<ReturnType<typeof getExamStructures>>) {
  const syllabusRows: (typeof examSubjects.$inferInsert)[] = [];
  const stageRows: (typeof examStages.$inferInsert)[] = [];
  const paperRows: (typeof examPapers.$inferInsert)[] = [];
  const sectionRows: (typeof paperSections.$inferInsert)[] = [];
  const sectionSubjectRows: (typeof sectionSubjects.$inferInsert)[] = [];

  for (const structure of structures) {
    for (const subject of structure.syllabusSubjects ?? []) {
      syllabusRows.push({ examCode: structure.examCode, subjectId: subject.id });
    }

    for (const stage of structure.stages) {
      stageRows.push({
        id: stage.id,
        examCode: structure.examCode,
        name: stage.name,
        displayOrder: stage.displayOrder,
        effectiveFrom: stage.effectiveFrom,
        versionLabel: stage.versionLabel,
      });

      for (const paper of stage.papers) {
        paperRows.push({
          id: paper.id,
          stageId: stage.id,
          examCode: structure.examCode,
          name: paper.name,
          paperType: paper.paperType,
          isMockable: paper.mockable,
          durationMinutes: paper.durationMinutes,
          totalMarks: paper.totalMarks,
          marksCorrect: paper.marksCorrect,
          marksWrong: paper.marksWrong,
          isQualifying: paper.qualifying,
          qualifyingPercentage: paper.qualifyingPercentage,
          displayOrder: paper.displayOrder,
        });

        for (const section of paper.sections) {
          sectionRows.push({
            id: section.id,
            paperId: paper.id,
            name: section.name,
            questionCount: section.questionCount,
            durationMinutes: section.durationMinutes,
            isSectionallyTimed: section.sectionallyTimed,
            // Store the server-resolved values so scoring never re-derives inheritance.
            marksCorrect: section.effectiveMarksCorrect,
            marksWrong: section.effectiveMarksWrong,
            displayOrder: section.displayOrder,
          });

          for (const subject of section.subjects) {
            sectionSubjectRows.push({ sectionId: section.id, subjectId: subject.id });
          }
        }
      }
    }
  }

  await db.transaction(async (tx) => {
    // Children first — these have real FKs to their parents.
    await tx.delete(sectionSubjects);
    await tx.delete(paperSections);
    await tx.delete(examPapers);
    await tx.delete(examStages);
    await tx.delete(examSubjects);

    if (syllabusRows.length > 0) await tx.insert(examSubjects).values(syllabusRows);
    if (stageRows.length > 0) await tx.insert(examStages).values(stageRows);
    if (paperRows.length > 0) await tx.insert(examPapers).values(paperRows);
    if (sectionRows.length > 0) await tx.insert(paperSections).values(sectionRows);
    if (sectionSubjectRows.length > 0) await tx.insert(sectionSubjects).values(sectionSubjectRows);
  });
}

/**
 * Batches a whole page of questions into a handful of statements instead of
 * awaiting one insert per row per table. At the original ~113-question scale
 * that per-row pattern was invisible; at load-test scale (500/page) it meant
 * thousands of blocked round trips through the SQLite JS bridge per page,
 * stalling both initial and delta sync for minutes on a single page. Same
 * fix already applied to {@link writeExamStructures} for the mock-test submit
 * bug — this path just hadn't been hit at volume until the load test.
 *
 * Children (questionExams, questionTranslations) are cleared and reinserted
 * wholesale per batch, same as writeExamStructures — cheap for a pure join/
 * leaf table and avoids needing `excluded.*` upsert syntax. `questions`
 * itself is upserted, not replaced, since it's the row identity other local
 * tables (bookmarks, practice results) reference by id.
 */
export async function upsertQuestionsBatch(tx: Tx, qs: QuestionResponse[]) {
  if (qs.length === 0) return;

  const ids = qs.map((q) => q.id);

  await tx.delete(questionExams).where(inArray(questionExams.questionId, ids));
  await tx.delete(questionTranslations).where(inArray(questionTranslations.questionId, ids));

  // A single bulk upsert, not one insert per row: onConflictDoUpdate's `set` runs the
  // same clause for every conflicting row, so it references SQLite's `excluded.*`
  // pseudo-table (the incoming row's own values) rather than the closed-over `q`.
  await tx
    .insert(questions)
    .values(
      qs.map((q) => ({
        id: q.id,
        correctAnswer: q.correctAnswer,
        subjectId: q.subjectId,
        subjectName: q.subjectName,
        topicId: q.topicId,
        topicName: q.topicName,
        difficulty: q.difficulty,
        isPremium: q.premium,
        updatedAt: new Date(q.updatedAt),
        isDeleted: q.deleted,
      })),
    )
    .onConflictDoUpdate({
      target: questions.id,
      set: {
        correctAnswer: sql`excluded.correct_answer`,
        subjectId: sql`excluded.subject_id`,
        subjectName: sql`excluded.subject_name`,
        topicId: sql`excluded.topic_id`,
        topicName: sql`excluded.topic_name`,
        difficulty: sql`excluded.difficulty`,
        isPremium: sql`excluded.is_premium`,
        updatedAt: sql`excluded.updated_at`,
        isDeleted: sql`excluded.is_deleted`,
      },
    });

  const examRows = qs.flatMap((q) => q.examCodes.map((examCode) => ({ questionId: q.id, examCode })));
  if (examRows.length > 0) {
    await tx.insert(questionExams).values(examRows);
  }

  const translationRows = qs.flatMap((q) =>
    q.translations.map((t) => ({
      id: `${q.id}:${t.languageCode}`,
      questionId: q.id,
      languageCode: t.languageCode,
      questionText: t.questionText,
      options: t.options,
      explanation: t.explanation,
    })),
  );
  if (translationRows.length > 0) {
    await tx.insert(questionTranslations).values(translationRows);
  }
}

export async function deleteQuestionLocally(tx: Tx, questionId: string) {
  await tx.delete(questionTranslations).where(eq(questionTranslations.questionId, questionId));
  await tx.delete(questionExams).where(eq(questionExams.questionId, questionId));
  await tx.delete(questions).where(eq(questions.id, questionId));
}
