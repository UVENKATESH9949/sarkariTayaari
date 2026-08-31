import { inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  difficultyLevels,
  examBadges,
  examPapers,
  examStages,
  examSubjects,
  examTopicIntelligence,
  exams,
  languages,
  paperSections,
  paperTypes,
  questionExams,
  questions,
  questionTranslations,
  sectionSubjects,
  subjects,
  topicPrerequisites,
  topics,
} from "../db/schema";
import { ApiError } from "../api/client";
import { getLanguages, type QuestionResponse } from "../api/questions";
import {
  getDifficultyLevels,
  getExamBadges,
  getExamStructures,
  getExamTopicIntelligence,
  getExams,
  getPaperTypes,
  getSubjects,
  getTopics,
  type TopicResponse,
} from "../api/reference";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function writeLanguages() {
  const langs = await getLanguages();
  if (langs.length === 0) return;
  await db
    .insert(languages)
    .values(langs.map((lang) => ({ code: lang.code, name: lang.name, isActive: true })))
    .onConflictDoUpdate({ target: languages.code, set: { name: sql`excluded.name` } });
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

  // One bulk upsert per table rather than one awaited statement per row. These run on
  // *every* sync, initial and delta, outside any transaction, and topics are
  // admin-authored so that list grows without bound — the same per-row-await cost that
  // made question writes stall sync for minutes at load-test scale. `excluded.*` is
  // required here (not a closed-over value) because one `set` clause is applied to every
  // conflicting row; see upsertQuestionsBatch below for the same reasoning.
  if (examList.length > 0) {
    await db
      .insert(exams)
      .values(
        examList.map((exam) => ({
          code: exam.code,
          name: exam.name,
          imageUrl: exam.imageUrl,
          displayOrder: exam.displayOrder,
          difficulty: exam.difficulty,
          badge: exam.badge,
        })),
      )
      .onConflictDoUpdate({
        target: exams.code,
        set: {
          name: sql`excluded.name`,
          imageUrl: sql`excluded.image_url`,
          displayOrder: sql`excluded.display_order`,
          difficulty: sql`excluded.difficulty`,
          badge: sql`excluded.badge`,
        },
      });
  }

  // Subjects and topics are upserted rather than replaced: questions reference them,
  // so wiping the table would break those rows mid-sync.
  if (subjectList.length > 0) {
    await db
      .insert(subjects)
      .values(
        subjectList.map((subject) => ({
          id: subject.id,
          name: subject.name,
          displayOrder: subject.displayOrder,
          icon: subject.icon,
          color: subject.color,
          colorBg: subject.colorBg,
        })),
      )
      .onConflictDoUpdate({
        target: subjects.id,
        set: {
          name: sql`excluded.name`,
          displayOrder: sql`excluded.display_order`,
          icon: sql`excluded.icon`,
          color: sql`excluded.color`,
          colorBg: sql`excluded.color_bg`,
        },
      });
  }

  if (topicList.length > 0) {
    await db
      .insert(topics)
      .values(
        topicList.map((topic) => ({
          id: topic.id,
          subjectId: topic.subjectId,
          subjectName: topic.subjectName,
          name: topic.name,
          displayOrder: topic.displayOrder,
          // Epic L / TICKET-2102. `?? null` rather than a bare read: a backend that predates
          // V12 omits these fields entirely, and writing `undefined` into a column drizzle
          // typed as nullable text is not the same as writing null.
          parentId: topic.parentId ?? null,
          parentName: topic.parentName ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: topics.id,
        set: {
          subjectId: sql`excluded.subject_id`,
          subjectName: sql`excluded.subject_name`,
          name: sql`excluded.name`,
          parentId: sql`excluded.parent_id`,
          parentName: sql`excluded.parent_name`,
          displayOrder: sql`excluded.display_order`,
        },
      });
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
  await writeTopicPrerequisites(topicList);
  // Depends on the exam and topic rows written above (both are real FKs locally), so it runs
  // last rather than in the Promise.all at the top of this function.
  await writeTopicIntelligence(examList.map((exam) => exam.code));
}

/**
 * Replaces the whole prerequisite graph (Epic L / TICKET-2103).
 *
 * A full replace rather than an upsert, same reasoning as writeExamStructures: the server sends
 * each topic's complete prerequisite list on every sync and there is no delta concept, so an
 * upsert-only pass would leave an edge an admin deleted on the server alive on the device
 * forever — and a stale prerequisite silently misorders Epic D's sequencing.
 *
 * Edges pointing at a topic this device has not synced yet are dropped rather than inserted.
 * `topic_prerequisites.prerequisite_topic_id` has no local FK precisely so that a mid-sync
 * device is not broken by one, but inserting a dangling edge would still make every read of it
 * return a prerequisite with no name to show.
 */
async function writeTopicPrerequisites(topicList: TopicResponse[]) {
  const knownTopicIds = new Set(topicList.map((topic) => topic.id));
  const rows: (typeof topicPrerequisites.$inferInsert)[] = [];

  for (const topic of topicList) {
    for (const prerequisiteTopicId of topic.prerequisiteTopicIds ?? []) {
      if (!knownTopicIds.has(prerequisiteTopicId)) continue;
      rows.push({ topicId: topic.id, prerequisiteTopicId });
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(topicPrerequisites);
    if (rows.length > 0) await tx.insert(topicPrerequisites).values(rows);
  });
}

/**
 * Pulls each exam's computed topic intelligence (Epic L / TICKET-2101, 2106, 2107).
 *
 * One request per exam, because the endpoint is per-exam server-side — there are 11 exams, so
 * this is a fixed small cost, and they are issued together rather than in sequence.
 *
 * A failure for one exam must not fail the whole sync: this data is decoration on the Practice
 * screen, not something the app cannot run without, and an older backend has no such endpoint
 * at all. So each request is caught individually and a failed exam simply contributes no rows.
 * The screens already handle an empty intelligence table, since that is also what a freshly
 * installed app looks like before its first sync.
 */
/**
 * Set once the server has told us this endpoint does not exist, so we stop asking.
 *
 * Module-level, i.e. per app session. It is reset by an app restart and nothing else, which is
 * the right granularity: whether the backend has the endpoint changes on deploy, not minute to
 * minute. A deploy mid-session therefore needs an app restart before the chips appear — a fair
 * trade for not re-issuing a known-dead request on every sync.
 */
let topicIntelligenceUnsupported = false;

async function writeTopicIntelligence(examCodes: string[]) {
  // Without this, a device pointed at a backend that predates TICKET-2106 issues one request per
  // exam on *every* sync, and this runs inside writeReferenceData - which the first-launch gate
  // waits on. Section 9 spent real effort making that phase fast; spending it on requests already
  // known to 404 would quietly give some of that back.
  if (topicIntelligenceUnsupported) return;

  const results = await Promise.all(
    examCodes.map(async (examCode) => {
      try {
        return await getExamTopicIntelligence(examCode);
      } catch (err) {
        // Only a 404 means "this server does not have the feature". A network failure or a 500
        // is transient, and treating it as unsupported would disable the feature for the rest of
        // the session over a momentary blip - the failure mode that matters here, since the
        // reference sync also runs while connectivity is coming back.
        if (err instanceof ApiError && err.status === 404) {
          topicIntelligenceUnsupported = true;
        }
        return null;
      }
    }),
  );

  const rows: (typeof examTopicIntelligence.$inferInsert)[] = [];
  for (const result of results) {
    if (!result) continue;
    for (const topic of result.topics) {
      rows.push({
        examCode: result.examCode,
        topicId: topic.topicId,
        curatedWeightagePercent: topic.curatedWeightagePercent,
        computedWeightagePercent: topic.computedWeightagePercent,
        appearanceCount: topic.appearanceCount,
        windowFromYear: topic.windowFromYear,
        windowToYear: topic.windowToYear,
        trendDirection: topic.trendDirection,
        trendScore: topic.trendScore,
        systemPriority: topic.systemPriority,
        adminOverride: topic.adminOverride,
        finalPriority: topic.finalPriority,
        algorithmVersion: topic.algorithmVersion,
      });
    }
  }

  // Only clear what was actually re-fetched. Wiping the table first would mean an exam whose
  // request failed loses the rows it already had, turning a transient network error into
  // missing data on a screen that was working a moment ago.
  const refreshedExamCodes = results.filter((r) => r !== null).map((r) => r!.examCode);
  if (refreshedExamCodes.length === 0) return;

  await db.transaction(async (tx) => {
    await tx
      .delete(examTopicIntelligence)
      .where(inArray(examTopicIntelligence.examCode, refreshedExamCodes));
    if (rows.length > 0) await tx.insert(examTopicIntelligence).values(rows);
  });
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
        // Epic L / TICKET-2104. Defaulted rather than passed through, because an older backend
        // omits these fields and `is_pyq` is NOT NULL locally — an undefined would fail the
        // insert for the whole page, taking 500 questions down with it.
        isPyq: q.pyq ?? false,
        pyqYear: q.pyqYear ?? null,
        pyqShift: q.pyqShift ?? null,
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
        isPyq: sql`excluded.is_pyq`,
        pyqYear: sql`excluded.pyq_year`,
        pyqShift: sql`excluded.pyq_shift`,
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

/**
 * Hard-deletes a batch of questions and their children — three statements total,
 * regardless of batch size. Previously one call per question (three awaited statements
 * each), which at a full 500-row page of tombstones was 1,500 sequential round trips
 * through the SQLite bridge inside a single transaction.
 *
 * Children first: nothing enforces these FKs at the SQLite level, but deleting parents
 * first would leave orphaned translation/tag rows if the transaction failed between
 * statements.
 */
export async function deleteQuestionsLocally(tx: Tx, questionIds: string[]) {
  if (questionIds.length === 0) return;
  await tx.delete(questionTranslations).where(inArray(questionTranslations.questionId, questionIds));
  await tx.delete(questionExams).where(inArray(questionExams.questionId, questionIds));
  await tx.delete(questions).where(inArray(questions.id, questionIds));
}
