import type { SyncedPaper } from "../db/examStructure";
import type { MockTestQuestion, SectionAvailability } from "../db/mockTest";
import type { AdHocMockSpec } from "../mockHub/types";
import { isIndexBasedType, resolveCorrectIndex } from "@sarkaritaiyaari/core/evaluation";
import { getMockAvailabilityCount, getMockSample, getQuestionsByIds } from "@sarkaritaiyaari/core/api";

/**
 * Hybrid (live-API) equivalents of db/mockTest.ts's countAvailable()/
 * buildMockTestQuestions() — used while a device hasn't completed its first sync yet,
 * so Mock Test attempts can start immediately instead of waiting on local SQLite.
 * Backed by the new public /api/questions/mock-count and /mock-sample endpoints,
 * which do the same "random sample across a set of subject ids, for one exam" query
 * server-side that the local path does against SQLite.
 */

export async function getSectionAvailabilityLive(paper: SyncedPaper): Promise<SectionAvailability[]> {
  const results: SectionAvailability[] = [];
  for (const section of paper.sections) {
    const available =
      section.subjectIds.length === 0
        ? 0
        : (await getMockAvailabilityCount(paper.examCode, section.subjectIds)).count;
    results.push({
      sectionName: section.name,
      requested: section.questionCount,
      available: Math.min(available, section.questionCount),
      durationMinutes: section.durationMinutes,
    });
  }
  return results;
}

export async function buildMockTestQuestionsLive(paper: SyncedPaper): Promise<MockTestQuestion[]> {
  const all: MockTestQuestion[] = [];

  for (const section of paper.sections) {
    if (section.subjectIds.length === 0) continue;

    const sample = await getMockSample(paper.examCode, section.subjectIds, section.questionCount);
    for (const q of sample) {
      const translations: MockTestQuestion["translations"] = {};
      for (const t of q.translations) {
        translations[t.languageCode] = {
          questionText: t.questionText,
          options: t.options,
          explanation: t.explanation ?? "",
          content: t.content ?? null,
        };
      }
      const englishOptions = translations.en?.options ?? Object.values(translations)[0]?.options ?? [];
      const questionType = q.questionType ?? "SINGLE_CHOICE";
      all.push({
        id: q.id,
        sectionName: section.name,
        subjectName: q.subjectName,
        correctIndex: isIndexBasedType(questionType) ? resolveCorrectIndex(q.correctAnswer, englishOptions) : null,
        questionType,
        answerKey: q.answerKey ?? null,
        contentStructure: q.contentStructure ?? null,
        questionGroupId: q.questionGroupId ?? null,
        translations,
      });
    }
  }

  return all;
}

/** Live equivalent of `db/mockTest.ts`'s `countAdHocAvailable`/`buildAdHocMockQuestionsLocal` — see those for the shape this mirrors. */
export async function countAdHocMockLive(spec: AdHocMockSpec): Promise<number> {
  if (spec.questionIds && spec.questionIds.length > 0) {
    const rows = await getQuestionsByIds(spec.questionIds);
    return Math.min(rows.length, spec.questionCount);
  }
  if (spec.subjectIds.length === 0) return 0;
  const { count } = await getMockAvailabilityCount(spec.examCode, spec.subjectIds, {
    topicIds: spec.topicIds,
    difficultyCode: spec.difficultyCode,
    pyqOnly: spec.pyqOnly,
  });
  return Math.min(count, spec.questionCount);
}

export async function buildAdHocMockQuestionsLive(spec: AdHocMockSpec): Promise<MockTestQuestion[]> {
  const rows = spec.questionIds && spec.questionIds.length > 0
    ? await getQuestionsByIds(spec.questionIds)
    : spec.subjectIds.length === 0
      ? []
      : await getMockSample(spec.examCode, spec.subjectIds, spec.questionCount, {
          topicIds: spec.topicIds,
          difficultyCode: spec.difficultyCode,
          pyqOnly: spec.pyqOnly,
        });

  return rows.map((q) => {
    const translations: MockTestQuestion["translations"] = {};
    for (const t of q.translations) {
      translations[t.languageCode] = {
        questionText: t.questionText,
        options: t.options,
        explanation: t.explanation ?? "",
        content: t.content ?? null,
      };
    }
    const englishOptions = translations.en?.options ?? Object.values(translations)[0]?.options ?? [];
    const questionType = q.questionType ?? "SINGLE_CHOICE";
    return {
      id: q.id,
      sectionName: spec.title,
      subjectName: q.subjectName,
      correctIndex: isIndexBasedType(questionType) ? resolveCorrectIndex(q.correctAnswer, englishOptions) : null,
      questionType,
      answerKey: q.answerKey ?? null,
      contentStructure: q.contentStructure ?? null,
      questionGroupId: q.questionGroupId ?? null,
      translations,
    };
  });
}
