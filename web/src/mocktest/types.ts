/**
 * Paper/section shapes for web's Mock Test — an online-only reshaping of
 * `GET /api/exam-structures`, mirroring mobile's `SyncedPaper`/`SyncedSection` (which mobile
 * builds the same way from the same endpoint). No local/live split, since decision 2
 * (online-only) means there is nothing to fall back to.
 */

export type MockSection = {
  id: string;
  name: string;
  questionCount: number;
  /** null = shares the paper's overall time. */
  durationMinutes: number | null;
  isSectionallyTimed: boolean;
  /** Already resolved server-side (effectiveMarksCorrect/effectiveMarksWrong) — never re-derive inheritance client-side. */
  marksCorrect: number | null;
  marksWrong: number | null;
  subjectIds: string[];
};

export type MockPaper = {
  id: string;
  examCode: string;
  examName: string;
  stageName: string;
  name: string;
  paperType: string;
  isMockable: boolean;
  durationMinutes: number | null;
  totalMarks: number | null;
  marksCorrect: number | null;
  marksWrong: number | null;
  isQualifying: boolean;
  qualifyingPercentage: number | null;
  sections: MockSection[];
};

export type SectionAvailability = {
  sectionName: string;
  requested: number;
  available: number;
  durationMinutes: number | null;
};
