import {
  getSyncedExams as getSyncedExamsLocal,
  getSubjectStats as getSubjectStatsLocal,
  getTopicStats as getTopicStatsLocal,
  getDifficultyCounts as getDifficultyCountsLocal,
  getPracticeQuestions as getPracticeQuestionsLocal,
  PRACTICE_QUESTION_LIMIT,
  type ExamOption,
  type SubjectStat,
  type TopicStat,
  type DifficultyCounts,
  type PracticeQuestion,
} from "../db/practiceContent";
import {
  getDifficultyLevels as getDifficultyLevelsLocal,
  getExamBadges as getExamBadgesLocal,
  type DifficultyLevel,
  type ExamBadge,
} from "../db/examStructure";
import {
  getExams,
  getSubjects,
  getTopics,
  getDifficultyLevels as getDifficultyLevelsApi,
  getExamBadges as getExamBadgesApi,
} from "../api/reference";
import { getLiveQuestions, getQuestionCounts } from "./liveQuestions";
import { getSyllabusSubjectIdsLive } from "./mockTestStructureData";
import { resolveCorrectIndex } from "../db/answerResolution";
import type { HybridMode } from "./hybridSource";

export type { ExamOption, SubjectStat, TopicStat, DifficultyCounts, PracticeQuestion, DifficultyLevel, ExamBadge };

const ALL_EXAMS = "ALL";
function examFilter(examCode: string | null): string | undefined {
  return examCode && examCode !== ALL_EXAMS ? examCode : undefined;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Hybrid (local SQLite vs. live backend) equivalents of every db/practiceContent.ts
 * export — used by the Practice screens instead of importing that module directly.
 * `mode === "local"` delegates unchanged to the local functions (zero changes there);
 * `mode === "live"` fetches and reshapes to the identical return type; `"unavailable"`
 * returns an empty result (screens already render an empty state either way — see
 * ui/OfflineNoDataNotice for the distinguishing "why is this empty" messaging).
 */

export async function getSyncedExams(mode: HybridMode): Promise<ExamOption[]> {
  if (mode === "local") return getSyncedExamsLocal();
  if (mode === "unavailable") return [];

  const [list, counts] = await Promise.all([getExams(), getQuestionCounts({ groupBy: "exam" })]);
  return list.map((e) => ({
    code: e.code,
    name: e.name,
    questionCount: counts[e.code] ?? 0,
    difficulty: e.difficulty,
    badge: e.badge,
    imageUrl: e.imageUrl,
  }));
}

export async function getSubjectStats(examCode: string | null, mode: HybridMode): Promise<SubjectStat[]> {
  if (mode === "local") return getSubjectStatsLocal(examCode);
  if (mode === "unavailable") return [];

  const exam = examFilter(examCode);
  const [allSubjects, syllabusSubjectIds, counts] = await Promise.all([
    getSubjects(),
    getSyllabusSubjectIdsLive(exam ?? null),
    getQuestionCounts({ groupBy: "subject", examCode: exam }),
  ]);

  const scopedSubjects = syllabusSubjectIds ? allSubjects.filter((s) => syllabusSubjectIds.includes(s.id)) : allSubjects;
  return scopedSubjects.map((s) => ({
    id: s.id,
    name: s.name,
    questionCount: counts[s.id] ?? 0,
    icon: s.icon,
    color: s.color,
    colorBg: s.colorBg,
  }));
}

export async function getTopicStats(subjectId: string, examCode: string | null, mode: HybridMode): Promise<TopicStat[]> {
  if (mode === "local") return getTopicStatsLocal(subjectId, examCode);
  if (mode === "unavailable") return [];

  const exam = examFilter(examCode);
  const [subjectTopics, counts] = await Promise.all([
    getTopics({ subjectId }),
    getQuestionCounts({ groupBy: "topic", subjectId, examCode: exam }),
  ]);
  return subjectTopics.map((t) => ({ id: t.id, name: t.name, questionCount: counts[t.id] ?? 0 }));
}

export async function getDifficultyCounts(topicId: string, examCode: string | null, mode: HybridMode): Promise<DifficultyCounts> {
  if (mode === "local") return getDifficultyCountsLocal(topicId, examCode);
  if (mode === "unavailable") return {};

  const exam = examFilter(examCode);
  return getQuestionCounts({ groupBy: "difficulty", topicId, examCode: exam });
}

/** Metadata (label/icon/color) for whatever difficulty levels exist — the Levels screen needs this alongside getDifficultyCounts()'s per-level question counts. */
export async function getDifficultyLevels(mode: HybridMode): Promise<DifficultyLevel[]> {
  if (mode === "local") return getDifficultyLevelsLocal();
  if (mode === "unavailable") return [];

  const levels = await getDifficultyLevelsApi();
  return levels.map((l) => ({ code: l.code, label: l.label, color: l.color, colorBg: l.colorBg, icon: l.icon }));
}

/** Metadata for whatever exam badges exist — exam cards resolve their `badge` code against this. */
export async function getExamBadges(mode: HybridMode): Promise<ExamBadge[]> {
  if (mode === "local") return getExamBadgesLocal();
  if (mode === "unavailable") return [];

  const badges = await getExamBadgesApi();
  return badges.map((b) => ({ code: b.code, label: b.label, color: b.color, colorBg: b.colorBg }));
}

export async function getPracticeQuestions(
  topicId: string,
  difficulty: string,
  examCode: string | null,
  mode: HybridMode,
): Promise<PracticeQuestion[]> {
  if (mode === "local") return getPracticeQuestionsLocal(topicId, difficulty, examCode);
  if (mode === "unavailable") return [];

  const exam = examFilter(examCode);
  const page = await getLiveQuestions({
    topicId,
    difficulty: difficulty === "all" ? undefined : difficulty,
    examCode: exam,
    size: PRACTICE_QUESTION_LIMIT,
  });

  const result = page.content.map((q) => {
    const translations: PracticeQuestion["translations"] = {};
    for (const t of q.translations) {
      translations[t.languageCode] = { questionText: t.questionText, options: t.options, explanation: t.explanation ?? "" };
    }
    const englishOptions = translations.en?.options ?? Object.values(translations)[0]?.options ?? [];
    return {
      id: q.id,
      correctIndex: resolveCorrectIndex(q.correctAnswer, englishOptions),
      translations,
      // Epic L / TICKET-2104. `?? false` / `?? null` rather than passed straight through: this is
      // the live path, and the backend it is talking to may predate V13 and omit the fields
      // entirely. Undefined would render the badge as "PYQ undefined".
      isPyq: q.pyq ?? false,
      pyqYear: q.pyqYear ?? null,
      pyqShift: q.pyqShift ?? null,
    };
  });
  return shuffle(result);
}
