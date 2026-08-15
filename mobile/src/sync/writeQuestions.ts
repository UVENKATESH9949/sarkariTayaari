import { eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  difficultyLevels,
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
  const [examList, subjectList, topicList, difficultyList, paperTypeList, structures] = await Promise.all([
    getExams(),
    getSubjects(),
    getTopics(),
    getDifficultyLevels(),
    getPaperTypes(),
    getExamStructures(),
  ]);

  for (const exam of examList) {
    await db
      .insert(exams)
      .values({ code: exam.code, name: exam.name, imageUrl: exam.imageUrl, displayOrder: exam.displayOrder })
      .onConflictDoUpdate({
        target: exams.code,
        set: { name: exam.name, imageUrl: exam.imageUrl, displayOrder: exam.displayOrder },
      });
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

  // Difficulty levels and paper types are small, self-contained lookups with nothing
  // referencing them locally (questions.difficulty is a plain text column), so a full
  // replace is the simplest way to pick up removals and deactivations.
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

export async function upsertQuestion(tx: Tx, q: QuestionResponse) {
  await tx
    .insert(questions)
    .values({
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
    })
    .onConflictDoUpdate({
      target: questions.id,
      set: {
        correctAnswer: q.correctAnswer,
        subjectId: q.subjectId,
        subjectName: q.subjectName,
        topicId: q.topicId,
        topicName: q.topicName,
        difficulty: q.difficulty,
        isPremium: q.premium,
        updatedAt: new Date(q.updatedAt),
        isDeleted: q.deleted,
      },
    });

  // The server always sends the full exam_codes list for a question, so it's
  // simplest (and correct) to replace this question's join rows wholesale
  // rather than diff against what's already stored locally.
  await tx.delete(questionExams).where(eq(questionExams.questionId, q.id));
  for (const examCode of q.examCodes) {
    await tx.insert(questionExams).values({ questionId: q.id, examCode });
  }

  for (const t of q.translations) {
    await tx
      .insert(questionTranslations)
      .values({
        id: `${q.id}:${t.languageCode}`,
        questionId: q.id,
        languageCode: t.languageCode,
        questionText: t.questionText,
        options: t.options,
        explanation: t.explanation,
      })
      .onConflictDoUpdate({
        target: questionTranslations.id,
        set: {
          questionText: t.questionText,
          options: t.options,
          explanation: t.explanation,
        },
      });
  }
}

export async function deleteQuestionLocally(tx: Tx, questionId: string) {
  await tx.delete(questionTranslations).where(eq(questionTranslations.questionId, questionId));
  await tx.delete(questionExams).where(eq(questionExams.questionId, questionId));
  await tx.delete(questions).where(eq(questions.id, questionId));
}
