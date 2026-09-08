/**
 * The Weakness Radar payload shape (Weakness Radar v1 — `api/WEAKNESS-RADAR.md`).
 *
 * Defined here, in `intelligence/`, rather than in `api/` — deliberately. A radar can arrive
 * from three places: the server (signed in, online), this device's `radar_cache` (signed in,
 * offline), or `localRadar.ts` computing it from local attempts (signed out). The screens must
 * not care which, so the type cannot belong to any one of them.
 *
 * Note what is NOT here: **confidence**. The supplied spec's §11 requires it to stay internal
 * — its job is to gate whether a verdict is asserted at all, and by the time a topic reaches
 * this shape it has already done that job. `evidenceLevel` is the student-legible stand-in: a
 * statement about how much they have practised rather than a coefficient. The full
 * mathematics is on the admin endpoint, which is where §22 wants it.
 */

export type TopicHealthStateName =
  | "INSUFFICIENT_DATA"
  | "DEVELOPING"
  | "STRONG"
  | "NEEDS_ATTENTION"
  | "NEEDS_REVISION"
  | "IMPROVING";

export type RadarOverviewStatus =
  | "NO_DATA"
  | "GETTING_STARTED"
  | "BUILDING"
  | "ON_TRACK"
  | "STRONG";

export type RadarOverview = {
  status: RadarOverviewStatus;
  topicsInSyllabus: number;
  topicsWithEvidence: number;
  topicsReliable: number;
  needsAttentionCount: number;
  needsRevisionCount: number;
  improvingCount: number;
  strongCount: number;
  developingCount: number;
  insufficientDataCount: number;
  /**
   * The server's own one-line summary, in English.
   *
   * The screens render their own localised copy keyed off `status` and ignore this — it exists
   * so the payload is self-describing for the admin view and for any client without a string
   * table. Never shown to a student, because this app's Telugu support types `te` as `en`'s
   * shape and a server-authored English sentence would silently become the only language.
   */
  headline: string;
};

export type ActionStep = {
  action: RecommendedActionName;
  /** How many questions this step asks for, or null for concept revision / a timed test. */
  questionCount: number | null;
  /** A real `difficulty_levels.code` when the step cares, never an invented one. */
  difficultyCode: string | null;
};

export type RecommendedActionName =
  | "LEARN_CONCEPT"
  | "PRACTICE_FOUNDATIONAL"
  | "PRACTICE_MEDIUM"
  | "PRACTICE_ADVANCED"
  | "PRACTICE_PYQ"
  | "TIMED_PRACTICE"
  | "REVISION"
  | "MAINTENANCE_PRACTICE"
  | "GATHER_EVIDENCE";

export type RadarReasonCode =
  | "NOT_ENOUGH_PRACTICE"
  | "RECENT_DECLINE"
  | "LOW_ACCURACY"
  | "PYQ_GAP"
  | "HIGH_VARIANCE"
  | "IMPROVING_FAST"
  | "STRONG_AND_STABLE"
  | "PREREQUISITE_GAP"
  | "HIGH_EXAM_WEIGHT"
  | "NO_QUESTIONS_AVAILABLE"
  | "STALE_PRACTICE";

export type PrerequisiteRef = {
  topicId: string;
  topicName: string;
  state: TopicHealthStateName;
};

export type RadarTopic = {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  parentTopicName: string | null;
  state: TopicHealthStateName;
  /** 0-100, already whole (§18 — no fake precision reaches the UI). */
  healthScore: number;
  trend: "IMPROVING" | "STABLE" | "DECLINING" | "NOT_ENOUGH_DATA";
  trendDelta: number | null;
  evidenceLevel: "INSUFFICIENT_DATA" | "EARLY_SIGNAL" | "DEVELOPING_CONFIDENCE" | "RELIABLE";
  attemptedCount: number;
  correctCount: number;
  accuracyPercent: number | null;
  recentAccuracyPercent: number | null;
  historicalAccuracyPercent: number | null;
  pyqAttemptedCount: number;
  pyqAccuracyPercent: number | null;
  /** False under v1 everywhere. The UI must say "not available", never show a default pace. */
  speedAvailable: boolean;
  consistency: "STEADY" | "VARIABLE" | "UNKNOWN";
  /** Epic L's own per-exam topic priority. Null when the topic has never been scored. */
  priority: number | null;
  /** Where this ranks as a next action (§13). Null when priority is unknown. */
  interventionValue: number | null;
  questionCount: number;
  reasonCodes: RadarReasonCode[];
  /** English fallback sentence. The screens prefer their own copy from `reasonCodes`. */
  explanation: string;
  recommendedAction: { primary: RecommendedActionName; steps: ActionStep[] };
  unmetPrerequisites: PrerequisiteRef[];
  lastPracticedAt: string | null;
};

export type WeaknessRadar = {
  examCode: string;
  algorithmVersion: string;
  /** ISO timestamp, or null when nothing has been computed (a student with no attempts). */
  computedAt: string | null;
  overview: RadarOverview;
  /**
   * Every topic in the exam's syllabus, already ordered so that grouping by `state` yields
   * §16's sections in the right order, each internally ranked by intervention value. The
   * screens must not re-sort.
   */
  topics: RadarTopic[];
};

/**
 * Where the radar on screen came from. Shown to the student only as a staleness note, but the
 * distinction matters: `local` means it was computed from this device's attempts alone, so it
 * cannot see practice done on another device.
 */
export type RadarSource = "server" | "cache" | "local";

export type RadarResult = {
  radar: WeaknessRadar;
  source: RadarSource;
  /** When this device last got a server answer, for the cache case. */
  fetchedAtMs: number | null;
};
