import type { QuestionResponse } from "@sarkaritaiyaari/core/api";
import { resolveCorrectIndex, isIndexBasedType } from "@sarkaritaiyaari/core/evaluation";
import type { Question } from "./types";

/**
 * The one place a server `QuestionResponse` becomes the shared `Question` shape
 * `QuestionBody` renders. Extracted in Phase 3 (TASK-2601) when a third call site
 * (history/bookmark hydration via `/questions/by-ids`) needed the exact same conversion
 * `practiceApi.ts` and `mocktest/mockTestApi.ts` already each had their own copy of —
 * three copies of "resolve correctIndex, reshape translations" is exactly the kind of
 * drift this codebase has repeatedly caught and collapsed elsewhere (see the shared
 * evaluator/topic-health package itself). Practice- and Mock-Test-only fields
 * (`isPyq`/`sectionName`/etc.) are passed in by the caller, which is the only one that
 * knows them.
 */
export function toQuestion(q: QuestionResponse, extra?: Partial<Pick<Question, "isPyq" | "pyqYear" | "pyqShift" | "sectionName" | "subjectName">>): Question {
  const translations: Question["translations"] = {};
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
    correctIndex: isIndexBasedType(questionType) ? resolveCorrectIndex(q.correctAnswer, englishOptions) : null,
    questionType,
    answerKey: q.answerKey ?? null,
    contentStructure: q.contentStructure ?? null,
    questionGroupId: q.questionGroupId ?? null,
    translations,
    ...extra,
  };
}
