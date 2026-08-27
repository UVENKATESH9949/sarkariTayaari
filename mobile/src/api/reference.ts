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
  versionLabel: string | null;
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
