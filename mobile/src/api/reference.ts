import { apiFetch } from "./client";

export type ExamResponse = {
  code: string;
  name: string;
  imageUrl: string | null;
  active: boolean;
  displayOrder: number;
  /** difficulty_levels code, or null when the exam hasn't been assessed. */
  difficulty: string | null;
  /** exam_badges code, or null when the exam carries no editorial tag. */
  badge: string | null;
};

export type ExamBadgeResponse = {
  code: string;
  label: string;
  displayOrder: number;
  color: string | null;
  colorBg: string | null;
  active: boolean;
};

export type SubjectResponse = {
  id: string;
  name: string;
  displayOrder: number;
  icon: string | null;
  color: string | null;
  colorBg: string | null;
};

export type TopicResponse = {
  id: string;
  subjectId: string;
  subjectName: string;
  name: string;
  displayOrder: number;
  /** Epic L / TICKET-2102. null = top-level topic. */
  parentId: string | null;
  parentName: string | null;
  /** Epic L / TICKET-2103. Topic ids a student should finish first; a DAG, not a tree. */
  prerequisiteTopicIds: string[];
};

/**
 * One topic's per-exam relevance and computed priority — Epic L / TICKET-2101, 2106, 2107.
 *
 * `curatedWeightagePercent` is the admin's own figure; `computedWeightagePercent` is derived
 * from previous-year questions. Both are carried because the whole point of the source spec's
 * §66 is that a human's judgement and a derived value stay distinguishable — the app shows
 * whichever it has and says which it is.
 *
 * Likewise `systemPriority` / `adminOverride` / `finalPriority` are three fields, not one:
 * `finalPriority` is what to rank by, but the app can show that a human overrode the formula.
 */
export type TopicIntelligenceResponse = {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  parentId: string | null;
  parentName: string | null;
  curatedWeightagePercent: number | null;
  computedWeightagePercent: number | null;
  appearanceCount: number;
  windowFromYear: number | null;
  windowToYear: number | null;
  /** RISING | STABLE | FALLING | INSUFFICIENT_DATA */
  trendDirection: string;
  trendScore: number | null;
  systemPriority: number | null;
  adminOverride: number | null;
  finalPriority: number | null;
  algorithmVersion: string;
  computedAt: string | null;
};

export type ExamTopicIntelligenceResponse = {
  examCode: string;
  algorithmVersion: string;
  /**
   * How many of the exam's questions carry a PYQ year at all. The app needs this to tell
   * "nothing is tagged yet" from "every topic genuinely scores the same" — an empty or flat
   * result otherwise looks identical in both cases.
   */
  pyqTaggedCount: number;
  topics: TopicIntelligenceResponse[];
};

export type DifficultyLevelResponse = {
  code: string;
  label: string;
  displayOrder: number;
  color: string | null;
  colorBg: string | null;
  icon: string | null;
  active: boolean;
};

export type PaperTypeResponse = {
  code: string;
  label: string;
  mockable: boolean;
  displayOrder: number;
};

export type SectionSubjectRef = { id: string; name: string };

export type SectionNodeResponse = {
  id: string;
  name: string;
  questionCount: number;
  /** null = shares the paper's overall time. */
  durationMinutes: number | null;
  sectionallyTimed: boolean;
  /** Raw overrides — null means "inherit from the paper". */
  marksCorrect: number | null;
  marksWrong: number | null;
  /** Already resolved by the server; use these for scoring. */
  effectiveMarksCorrect: number | null;
  effectiveMarksWrong: number | null;
  displayOrder: number;
  subjects: SectionSubjectRef[];
};

export type PaperNodeResponse = {
  id: string;
  name: string;
  paperType: string;
  mockable: boolean;
  durationMinutes: number | null;
  totalMarks: number | null;
  marksCorrect: number | null;
  marksWrong: number | null;
  qualifying: boolean;
  qualifyingPercentage: number | null;
  displayOrder: number;
  sections: SectionNodeResponse[];
};

export type StageNodeResponse = {
  id: string;
  name: string;
  displayOrder: number;
  effectiveFrom: string | null;
  /** Epic L / TICKET-2108. null = still current. */
  effectiveTo: string | null;
  versionLabel: string | null;
  /**
   * Whether this version of the stage is the one in force today, resolved server-side.
   *
   * Always true on this endpoint — `/api/exam-structures` now sends only the effective version
   * of each stage, so a device can never generate a mock test from a superseded pattern. Kept
   * on the type because the admin-facing `/api/exams/{code}/structure` sends every version with
   * this flag varying, and both share the shape.
   */
  active: boolean;
  papers: PaperNodeResponse[];
};

export type ExamStructureResponse = {
  examCode: string;
  examName: string;
  /** Every subject the exam covers — present even when no papers are defined yet. */
  syllabusSubjects: SectionSubjectRef[];
  stages: StageNodeResponse[];
};

/** Active-only — same list the mobile-facing exam cards use. */
export function getExams() {
  return apiFetch<ExamResponse[]>("/exams");
}

export function getSubjects() {
  return apiFetch<SubjectResponse[]>("/subjects");
}

export function getTopics(params?: { subjectId?: string }) {
  const query = params?.subjectId ? `?subjectId=${encodeURIComponent(params.subjectId)}` : "";
  return apiFetch<TopicResponse[]>(`/topics${query}`);
}

/** Active-only. Drives the Level screen, which renders whatever it receives. */
export function getDifficultyLevels() {
  return apiFetch<DifficultyLevelResponse[]>("/difficulty-levels");
}

export function getPaperTypes() {
  return apiFetch<PaperTypeResponse[]>("/paper-types");
}

/** Active-only. The badge vocabulary exam cards resolve their tag against. */
export function getExamBadges() {
  return apiFetch<ExamBadgeResponse[]>("/exam-badges");
}

/**
 * Every active exam's structure in one request. Replaces the hardcoded per-exam
 * blueprint — patterns are data now, so a new exam or a changed pattern needs no
 * app release.
 */
export function getExamStructures() {
  return apiFetch<ExamStructureResponse[]>("/exam-structures");
}

/**
 * Epic L / TICKET-2101 + 2106 + 2107 — the ranked topic map for one exam.
 *
 * Deliberately public on the server (no auth), like `/topics` and `/exam-structures`: every
 * field is derived from the published question bank and the admin's own curation, so there is
 * nothing student-specific to protect.
 */
export function getExamTopicIntelligence(examCode: string) {
  return apiFetch<ExamTopicIntelligenceResponse>(
    `/exams/${encodeURIComponent(examCode)}/topic-intelligence`,
  );
}
