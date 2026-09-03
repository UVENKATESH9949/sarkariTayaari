import { apiFetch, ApiError } from "./client";

/**
 * Exam Guide Phase 1 (see the supplied Exam Guide spec). Live-fetched only — unlike the
 * rest of this app's reference data, there is no local SQLite table or sync pipeline for
 * this yet. That is a scope decision, not an oversight: it lets the feature ship and be
 * exercised end to end without a second migration + delta-sync integration in the same
 * pass. See the report for what that costs (no offline access to guide content, no
 * "last updated" staleness indicator) and what §44 would need for a follow-up pass.
 */

export type SourceSummary = {
  id: string;
  sourceName: string;
  sourceType: string;
  url: string | null;
};

export type EligibilitySummary = {
  minimumAge: number | null;
  maximumAge: number | null;
  ageCutoffDate: string | null;
  qualification: string | null;
  nationality: string | null;
  genderRequirement: string | null;
  categoryRelaxation: Record<string, number> | null;
  specialRequirements: string | null;
  sourceId: string | null;
};

export type ImportantDateSummary = {
  id: string;
  eventType: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  official: boolean;
  sourceId: string | null;
};

export type DocumentSummary = {
  id: string;
  documentName: string;
  /** YES | NO | IF_APPLICABLE */
  required: string;
  applicableFor: string | null;
  format: string | null;
  maxSizeKb: number | null;
  dimensions: string | null;
  instructions: string | null;
  /** READY | MISSING | NOT_APPLICABLE | null (null = anonymous, or never set). */
  userStatus: string | null;
  sourceId: string | null;
};

export type ApplicationStepSummary = {
  stepNumber: number;
  title: string;
  description: string | null;
  warning: string | null;
  officialUrl: string | null;
};

export type FeeSummary = {
  category: string;
  amountRupees: number;
  exempted: boolean;
  notes: string | null;
  sourceId: string | null;
};

/** Spec §25/§26 — exam-scoped, not cycle-scoped; see the backend's V19 migration comment. */
export type CareerPostSummary = {
  id: string;
  postTitle: string;
  payLevel: string | null;
  salaryMinRupees: number | null;
  salaryMaxRupees: number | null;
  growthPath: string | null;
  description: string | null;
  sourceId: string | null;
};

export type ExamGuide = {
  examCode: string;
  examName: string;
  recruitmentCycleId: string;
  cycleName: string;
  status: string;
  notificationDate: string | null;
  applicationStart: string | null;
  applicationEnd: string | null;
  examStart: string | null;
  examEnd: string | null;
  vacancyCount: number | null;
  notificationUrl: string | null;
  overviewText: string | null;
  /** MUST be rendered as a visible badge whenever true — see the report on why. */
  demo: boolean;
  lastVerifiedAt: string | null;
  eligibility: EligibilitySummary | null;
  importantDates: ImportantDateSummary[];
  documents: DocumentSummary[];
  applicationSteps: ApplicationStepSummary[];
  applicationMistakes: string[];
  fees: FeeSummary[];
  careerPosts: CareerPostSummary[];
  sources: SourceSummary[];
};

/**
 * Returns null rather than throwing when this exam has no current recruitment cycle
 * configured yet — the common case for every exam except the seeded demo, and a "not yet
 * available" empty state (spec §54) rather than an error screen is the correct response.
 */
export async function getExamGuide(examCode: string, token?: string | null): Promise<ExamGuide | null> {
  try {
    return await apiFetch<ExamGuide>(`/exams/${examCode}/guide`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export type PrepareTopicItem = {
  topicId: string;
  topicName: string;
  subjectName: string;
  finalPriority: number | null;
  /** TopicProgressState name, or null for an anonymous caller / an untouched topic. */
  masteryState: string | null;
  prerequisitesMet: boolean;
  /** True for exactly one topic: the highest-priority one that isn't mastered yet and
   * whose prerequisites are. */
  recommended: boolean;
};

export type PreparePlan = {
  examCode: string;
  topics: PrepareTopicItem[];
};

/**
 * Spec §22 "Personalized Preparation Roadmap" — built as an enhancement to Prepare, not a
 * new "Roadmap" module (this app has no such section in its IA). Derived entirely from
 * Epic L's existing topic-intelligence/mastery data; empty when nothing has been curated
 * for this exam yet, same as topic-intelligence's own empty case.
 */
export function getPreparePlan(examCode: string, token?: string | null): Promise<PreparePlan> {
  return apiFetch<PreparePlan>(`/exams/${examCode}/prepare-plan`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

/**
 * Every active exam's current, published-cycle guide in one request — spec §44's offline
 * cache reads this during the ordinary reference sync, the same way exam structures and
 * topic intelligence already do. No auth header: this is the sync path, which is anonymous
 * by design (personalised document status is refreshed separately, live, on the screen
 * itself when signed in — see exam-guide.tsx).
 */
export function getAllExamGuides(): Promise<ExamGuide[]> {
  return apiFetch<ExamGuide[]>("/exam-guides");
}

export type CycleHistoryEntry = {
  recruitmentCycleId: string;
  cycleName: string;
  status: string;
  notificationDate: string | null;
  applicationStart: string | null;
  applicationEnd: string | null;
  examStart: string | null;
  examEnd: string | null;
  vacancyCount: number | null;
};

/** Exam Guide spec §63. Empty array (not null) when there's nothing but the current cycle. */
export function getCycleHistory(examCode: string): Promise<CycleHistoryEntry[]> {
  return apiFetch<CycleHistoryEntry[]>(`/exams/${examCode}/recruitment-cycles/history`);
}

export type CycleChangeEntry = {
  field: string;
  previousValue: string | null;
  currentValue: string | null;
};

export type CycleComparison = {
  hasPrevious: boolean;
  previousCycleName: string | null;
  changes: CycleChangeEntry[];
};

/** Exam Guide spec §30 "What's Changed This Year" — a field-level diff against the exam's
 * previous published cycle, fetched lazily (only when the user asks), not eagerly with
 * the guide itself. */
export function getChangesFromPrevious(examCode: string, cycleId: string): Promise<CycleComparison> {
  return apiFetch<CycleComparison>(`/exams/${examCode}/recruitment-cycles/${cycleId}/changes-from-previous`);
}

/** READY | MISSING | NOT_APPLICABLE. Requires sign-in — the caller checks for a token first. */
export function setDocumentStatus(documentRequirementId: string, status: string, token: string): Promise<void> {
  return apiFetch<void>(`/user/documents/${documentRequirementId}/status`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: { status },
  });
}
