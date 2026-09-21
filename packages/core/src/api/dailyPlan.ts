import { apiFetch } from "./client";

/**
 * Today's plan (see `api/DAILY-PLAN.md`) — the personalization program's student-facing surface.
 *
 * Phases 3, 4 and 7 work out what this student's state is, what there is to do, and what is
 * fading. This is the one that answers "what do I do today", which is the only one of the five
 * a student would ever open on purpose.
 */

/**
 * How much time the planner assumed, and where the figure came from.
 *
 * The student never states minutes — onboarding asks for a band — so `minutes` is always the
 * planner's own inference. `basis` is what keeps that honest: `STATED_BAND` means it came from
 * the band this student chose, `DEFAULT` means no profile reached the server and 60 minutes was
 * assumed for them. A UI that shows the minutes without the basis is asserting something the
 * student never said.
 */
export type DailyPlanBudget = {
  /** UNDER_1H | ONE_TO_TWO | TWO_TO_FOUR | FOUR_TO_SIX | SIX_PLUS, or null with no profile. */
  dailyStudyTime: string | null;
  minutes: number;
  basis: "STATED_BAND" | "DEFAULT";
};

export type DailyPlanTask = {
  taskId: string;
  displayOrder: number;
  /** REVISION (work done and fading) or PRACTICE (new ground). */
  source: "REVISION" | "PRACTICE";
  /** One of RecommendedAction's values — PRACTICE_FOUNDATIONAL, TIMED_PRACTICE, and so on. */
  action: string;
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  difficultyCode: string | null;
  plannedMinutes: number;
  plannedQuestionCount: number;
  /** PERSONAL_TOPIC | COHORT_TOPIC | COHORT_DIFFICULTY | DEFAULT — which tier sized this. */
  estimate: string;
  status: "ASSIGNED" | "COMPLETED" | "PARTIAL" | "SKIPPED";
  /** One deterministic sentence, stored when the task was chosen. Null for pre-V50 tasks. */
  reason: string | null;
  answeredToday: number;
  /** Null when nothing was answered. Never decides `status` — see the contract. */
  accuracyToday: number | null;
  createdAt: string;
};

export type DailyPlanResponse = {
  examCode: string;
  planDate: string;
  zone: string;
  budget: DailyPlanBudget;
  plannedMinutes: number;
  /** False when this day had already been planned — the same rows come back unchanged. */
  generated: boolean;
  settledTaskCount: number;
  tasks: DailyPlanTask[];
};

/**
 * **This GET writes.** The first read for a (student, day, exam) generates the day and persists
 * it; later reads return the same task ids with `generated: false`. So it is safe to call again,
 * but it is not free of side effects — do not fire it speculatively for an exam the student is
 * not actually looking at.
 *
 * `zone` must be a real IANA zone; an unknown one is a 400 rather than a silent UTC fallback,
 * because quietly planning a different calendar day is worse than failing.
 */
export function fetchDailyPlan(token: string, examCode: string, zone?: string) {
  const query = new URLSearchParams({ examCode });
  if (zone) query.set("zone", zone);

  return apiFetch<DailyPlanResponse>(`/me/daily-plan?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
