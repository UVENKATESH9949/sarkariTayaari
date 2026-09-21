import { apiFetch } from "./client";

/**
 * The personalized study roadmap (see `api/STUDY-ROADMAP.md`).
 *
 * Where the daily plan answers "what do I do today", this answers "what is the whole path, in what
 * order, and how much work is it". It computes no new judgement about the student — the order is
 * Epic L's priority, the steps are the radar's own — it adds minutes, subject balance and the
 * exam's clock.
 */

/**
 * The exam's own clock, when it has one.
 *
 * Ten of eleven exams have no published cycle, so `hasExamDate: false` with every other field null
 * is the NORMAL case, not an error state. A client that renders a countdown unconditionally will
 * be wrong most of the time.
 */
export type RoadmapTimeline = {
  hasExamDate: boolean;
  /** ISO date (yyyy-MM-dd). The exam's start, never the application deadline. */
  examDate: string | null;
  /** Null once the date has passed — a negative countdown is not a plan. */
  daysRemaining: number | null;
  /** Arithmetic over an estimate, not a prediction about this student. */
  dailyMinutesRequired: number | null;
  note: string | null;
};

/**
 * How long one question in this topic is assumed to take, and on what basis.
 *
 * `source` is load-bearing, not decoration: `PERSONAL_TOPIC` and `COHORT_TOPIC`/`COHORT_DIFFICULTY`
 * are measured averages, `DEFAULT` is a stated 75-second constant with a `sampleSize` of 0. A UI
 * that shows the minutes without the source presents an assumption as a measurement.
 */
export type WorkloadEstimate = {
  source: "PERSONAL_TOPIC" | "COHORT_TOPIC" | "COHORT_DIFFICULTY" | "DEFAULT";
  secondsPerQuestion: number;
  sampleSize: number;
};

export type RoadmapStep = {
  action: string;
  /** Null for a step that is not a question set. */
  questionCount: number | null;
  difficultyCode: string | null;
  /** Null exactly when `questionCount` is null, and excluded from every total. */
  estimatedMinutes: number | null;
};

export type RoadmapTopic = {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  /**
   * 1-based position by priority ALONE, before subject balancing. When it disagrees with this
   * topic's position in `topics[]`, the interleave moved it — which the contract keeps visible
   * on purpose rather than hiding.
   */
  priorityRank: number;
  examPriority: number | null;
  curriculumState: string;
  performanceState: string | null;
  recommendedAction: string;
  questionCount: number;
  /** False when a prerequisite is not yet mastered. The topic is still listed — advice, not a lock. */
  prerequisitesMet: boolean;
  blockedBy: string[];
  /** Exactly one topic in the plan carries true. */
  recommended: boolean;
  estimatedMinutes: number | null;
  estimate: WorkloadEstimate;
  steps: RoadmapStep[];
};

export type RoadmapSubject = {
  subjectId: string;
  subjectName: string;
  topicCount: number;
  estimatedMinutes: number | null;
};

export type StudyRoadmapResponse = {
  examCode: string;
  healthAlgorithmVersion: string;
  computedAt: string;
  timeline: RoadmapTimeline;
  /** Null only when nothing in the plan could be estimated at all. */
  totalEstimatedMinutes: number | null;
  /** Ordered — the order IS the roadmap. */
  topics: RoadmapTopic[];
  subjects: RoadmapSubject[];
};

/**
 * **This GET can write.** The health model underneath recomputes lazily, so serving a stale
 * student's roadmap rewrites their health rows — the same property `/api/me/learning-state` has.
 * Harmless to call again, but not free.
 */
export function fetchStudyRoadmap(token: string, examCode: string) {
  const query = new URLSearchParams({ examCode });
  return apiFetch<StudyRoadmapResponse>(`/me/study-roadmap?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
