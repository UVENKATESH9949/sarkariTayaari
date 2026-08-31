import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./client";
import { examTopicIntelligence, topicPrerequisites, topicProgress, topics } from "./schema";

/**
 * Local reads for Epic L's topic model — hierarchy, per-exam weightage and priority,
 * prerequisites, and this device's mastery state.
 *
 * Kept separate from `practiceContent.ts` deliberately. That module answers "what content is
 * available"; this one answers "what does the app know about a topic". Folding these queries in
 * there would make every Practice screen that only needs counts pay for joins it never reads.
 */

/** The mastery ladder from the source spec's §31, mirrored from the server's enum. */
export type TopicProgressState =
  | "NOT_STARTED"
  | "LEARNING"
  | "PRACTICING"
  | "MASTERED"
  | "NEEDS_REVISION";

export type TopicTrendDirection = "RISING" | "STABLE" | "FALLING" | "INSUFFICIENT_DATA";

/**
 * Everything the app knows about one topic, for the Practice topic list.
 *
 * Nullable throughout below the name, because "not computed yet" is a real and common state —
 * an exam whose topic map has never been curated, or a device whose first sync has not finished.
 * The UI renders absence as absence rather than substituting a zero, which would read as a
 * genuine score of zero.
 */
export type TopicInsight = {
  topicId: string;
  parentId: string | null;
  parentName: string | null;
  /** The admin's curated share of the paper. */
  curatedWeightagePercent: number | null;
  /** Derived from previous-year questions — deliberately distinct from the curated figure. */
  computedWeightagePercent: number | null;
  appearanceCount: number;
  windowFromYear: number | null;
  windowToYear: number | null;
  trendDirection: TopicTrendDirection | null;
  trendScore: number | null;
  finalPriority: number | null;
  /** Non-null when a human overrode the computed score — the UI says so explicitly. */
  adminOverride: number | null;
  systemPriority: number | null;
  state: TopicProgressState;
  accuracyPercent: number | null;
  attemptedCount: number;
  /** Prerequisite topics not yet at MASTERED. Empty when the topic is ready to study. */
  unmetPrerequisites: { topicId: string; topicName: string; state: TopicProgressState }[];
};

/**
 * Insight rows for every topic in one subject, keyed by topic id.
 *
 * Four queries, not one per topic. The alternative — a query per topic for intelligence,
 * progress and prerequisites — is the 1+N shape this codebase has now fixed four times; on a
 * subject with 30 topics it would be ~90 round trips through the SQLite JS bridge on a screen
 * that is meant to open instantly.
 *
 * `examCode` may be null ("All Government Exams"), in which case there is no per-exam
 * intelligence to show and only progress and prerequisites are returned. That is correct rather
 * than a degradation: weightage and priority are per-exam by definition, and inventing an
 * average across exams would be a number nobody curated.
 */
export async function getTopicInsights(
  subjectId: string,
  examCode: string | null,
): Promise<Map<string, TopicInsight>> {
  const subjectTopics = await db
    .select({
      id: topics.id,
      name: topics.name,
      parentId: topics.parentId,
      parentName: topics.parentName,
    })
    .from(topics)
    .where(eq(topics.subjectId, subjectId))
    .all();

  if (subjectTopics.length === 0) return new Map();

  const topicIds = subjectTopics.map((t) => t.id);
  const nameById = new Map(subjectTopics.map((t) => [t.id, t.name]));

  const [intelligenceRows, progressRows, prerequisiteRows] = await Promise.all([
    examCode
      ? db
          .select()
          .from(examTopicIntelligence)
          .where(
            and(
              eq(examTopicIntelligence.examCode, examCode),
              inArray(examTopicIntelligence.topicId, topicIds),
            ),
          )
          .all()
      : Promise.resolve([]),
    db.select().from(topicProgress).where(inArray(topicProgress.topicId, topicIds)).all(),
    db
      .select()
      .from(topicPrerequisites)
      .where(inArray(topicPrerequisites.topicId, topicIds))
      .all(),
  ]);

  const intelligenceByTopic = new Map(intelligenceRows.map((r) => [r.topicId, r]));
  const progressByTopic = new Map(progressRows.map((r) => [r.topicId, r]));

  /*
   * A prerequisite can live in a different subject than the topic that needs it, so its state
   * is not necessarily in `progressRows` above. Rather than a second scoped query, resolve the
   * ones we are missing in one extra lookup — and treat an unknown prerequisite as NOT_STARTED,
   * which is the truthful reading: no local progress row means this device has no record of the
   * student having studied it.
   */
  const prerequisiteIds = [...new Set(prerequisiteRows.map((r) => r.prerequisiteTopicId))];
  const missingIds = prerequisiteIds.filter((id) => !progressByTopic.has(id));

  const [extraProgress, prerequisiteNames] = await Promise.all([
    missingIds.length > 0
      ? db.select().from(topicProgress).where(inArray(topicProgress.topicId, missingIds)).all()
      : Promise.resolve([]),
    prerequisiteIds.length > 0
      ? db
          .select({ id: topics.id, name: topics.name })
          .from(topics)
          .where(inArray(topics.id, prerequisiteIds))
          .all()
      : Promise.resolve([]),
  ]);

  for (const row of extraProgress) progressByTopic.set(row.topicId, row);
  for (const row of prerequisiteNames) nameById.set(row.id, row.name);

  const prerequisitesByTopic = new Map<string, string[]>();
  for (const row of prerequisiteRows) {
    const list = prerequisitesByTopic.get(row.topicId) ?? [];
    list.push(row.prerequisiteTopicId);
    prerequisitesByTopic.set(row.topicId, list);
  }

  const insights = new Map<string, TopicInsight>();
  for (const topic of subjectTopics) {
    const intelligence = intelligenceByTopic.get(topic.id);
    const progress = progressByTopic.get(topic.id);

    const unmetPrerequisites = (prerequisitesByTopic.get(topic.id) ?? [])
      .map((prerequisiteId) => {
        const state = (progressByTopic.get(prerequisiteId)?.state ??
          "NOT_STARTED") as TopicProgressState;
        return { topicId: prerequisiteId, topicName: nameById.get(prerequisiteId) ?? "", state };
      })
      // MASTERED is the only state that clears a prerequisite. PRACTICING deliberately does
      // not: the point of the gate is that fundamentals are solid before the advanced topic is
      // recommended, and "still practising" is not that.
      .filter((p) => p.state !== "MASTERED")
      // Drop anything whose name could not be resolved — a prerequisite the device has not
      // synced yet would otherwise render as a blank row that looks like a bug.
      .filter((p) => p.topicName.length > 0);

    insights.set(topic.id, {
      topicId: topic.id,
      parentId: topic.parentId,
      parentName: topic.parentName,
      curatedWeightagePercent: intelligence?.curatedWeightagePercent ?? null,
      computedWeightagePercent: intelligence?.computedWeightagePercent ?? null,
      appearanceCount: intelligence?.appearanceCount ?? 0,
      windowFromYear: intelligence?.windowFromYear ?? null,
      windowToYear: intelligence?.windowToYear ?? null,
      trendDirection: (intelligence?.trendDirection as TopicTrendDirection | null) ?? null,
      trendScore: intelligence?.trendScore ?? null,
      finalPriority: intelligence?.finalPriority ?? null,
      adminOverride: intelligence?.adminOverride ?? null,
      systemPriority: intelligence?.systemPriority ?? null,
      state: (progress?.state ?? "NOT_STARTED") as TopicProgressState,
      accuracyPercent: progress?.accuracyPercent ?? null,
      attemptedCount: progress?.attemptedCount ?? 0,
      unmetPrerequisites,
    });
  }
  return insights;
}

export type PriorityTopic = {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  finalPriority: number | null;
  trendDirection: TopicTrendDirection | null;
  curatedWeightagePercent: number | null;
  computedWeightagePercent: number | null;
  state: TopicProgressState;
  accuracyPercent: number | null;
};

/**
 * The highest-priority topics for one exam — the Preparation Plan's first visible slice.
 *
 * Ordered by the server's `finalPriority`, which already resolves admin override over computed
 * score. The app does not re-derive that precedence: one place decides it, exactly as the
 * marks-inheritance rule is resolved server-side for the exam structure.
 */
export async function getPriorityTopics(
  examCode: string,
  limit = 10,
): Promise<PriorityTopic[]> {
  const rows = await db
    .select({
      topicId: examTopicIntelligence.topicId,
      topicName: topics.name,
      subjectId: topics.subjectId,
      subjectName: topics.subjectName,
      finalPriority: examTopicIntelligence.finalPriority,
      trendDirection: examTopicIntelligence.trendDirection,
      curatedWeightagePercent: examTopicIntelligence.curatedWeightagePercent,
      computedWeightagePercent: examTopicIntelligence.computedWeightagePercent,
      state: topicProgress.state,
      accuracyPercent: topicProgress.accuracyPercent,
    })
    .from(examTopicIntelligence)
    .innerJoin(topics, eq(topics.id, examTopicIntelligence.topicId))
    // Left join: a topic the student has never touched has no progress row, and it is exactly
    // those topics a plan most needs to surface. An inner join would hide them.
    .leftJoin(topicProgress, eq(topicProgress.topicId, examTopicIntelligence.topicId))
    .where(eq(examTopicIntelligence.examCode, examCode))
    // NULLS LAST via raw SQL: drizzle's asc/desc helpers do not express null ordering, and in
    // SQLite NULLs sort first by default — an uncomputed topic would otherwise top the list.
    .orderBy(sql`${examTopicIntelligence.finalPriority} DESC NULLS LAST`, asc(topics.name))
    .limit(limit)
    .all();

  return rows.map((r) => ({
    ...r,
    trendDirection: (r.trendDirection as TopicTrendDirection | null) ?? null,
    state: (r.state ?? "NOT_STARTED") as TopicProgressState,
  }));
}

/** Per-state counts across every topic this device has a progress row for. */
export async function getMasterySummary(): Promise<Record<TopicProgressState, number>> {
  const rows = await db
    .select({ state: topicProgress.state, count: sql<number>`count(*)` })
    .from(topicProgress)
    .groupBy(topicProgress.state)
    .all();

  const summary: Record<TopicProgressState, number> = {
    NOT_STARTED: 0,
    LEARNING: 0,
    PRACTICING: 0,
    MASTERED: 0,
    NEEDS_REVISION: 0,
  };
  for (const row of rows) {
    if (row.state in summary) summary[row.state as TopicProgressState] = row.count;
  }
  return summary;
}
