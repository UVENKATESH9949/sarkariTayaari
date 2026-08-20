import type { SyncedPaper } from "../db/examStructure";
import type { MockTestQuestion, SectionAvailability } from "../db/mockTest";
import { resolveCorrectIndex } from "../db/answerResolution";
import { getMockAvailabilityCount, getMockSample } from "./liveQuestions";

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
        translations[t.languageCode] = { questionText: t.questionText, options: t.options, explanation: t.explanation ?? "" };
      }
      const englishOptions = translations.en?.options ?? Object.values(translations)[0]?.options ?? [];
      all.push({
        id: q.id,
        sectionName: section.name,
        subjectName: q.subjectName,
        correctIndex: resolveCorrectIndex(q.correctAnswer, englishOptions),
        translations,
      });
    }
  }

  return all;
}
