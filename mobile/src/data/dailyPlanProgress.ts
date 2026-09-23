import { and, eq, gte, inArray, lt, notInArray, or, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  mockTestAttemptResults,
  mockTestAttempts,
  practiceSessionResults,
  practiceSessions,
  questions,
} from "../db/schema";

/** What the student did on one topic today: answers that counted, and how many were right. */
export type TopicActivity = { answered: number; correct: number };

/**
 * Per-topic activity for one calendar day, computed on the device.
 *
 * <h2>Why this exists at all</h2>
 *
 * A cached daily plan freezes whatever progress the server reported when the snapshot was taken.
 * Show that offline and a student who has just answered twelve questions still reads "0 of 15",
 * which is worse than showing nothing — it looks like their work was lost. So the cache stores
 * the plan's DEFINITION (which topics, which purpose, how many questions, why) and this derives
 * the PROGRESS half locally from the device's own history.
 *
 * <h2>This is not a second planner</h2>
 *
 * Nothing here decides what to study. It counts answers that already happened. The distinction
 * matters: duplicating the allocation rules would be the drift D5.1 exists to prevent, whereas
 * counting a student's own attempts is something the device is the *first* to know about — those
 * rows are written locally and only later synced.
 *
 * <h2>It deliberately mirrors the server's rule, line for line</h2>
 *
 * `TaskOutcomeService.observedOn` sums `practiceByTopicInWindow` + `mockByTopicInWindow`, both
 * bounded by the session/attempt's `completedAt` within the day and both excluding
 * `UNATTEMPTED` and `PENDING_REVIEW` (`TaskOutcomeRepository.COUNTED`). This matches all three:
 * both sources, the same window, the same exclusions.
 *
 * Getting that wrong would be worse than not having it. The screen shows server figures whenever
 * the server is reachable and these only when it is not, so a different rule here would make the
 * same task read one way online and another way offline — a contradiction the student would see
 * and could not explain.
 *
 * TWO HONEST DIVERGENCES, neither avoidable on the device:
 *
 * 1. The server reads `topic_id` frozen onto each result row at upload (V47), so retagging a
 *    question later cannot rewrite history. Local result rows carry no topic, so this joins
 *    `questions` live — which means a retagged question moves in this count and not in the
 *    server's. Rare, self-correcting on the next successful fetch, and it only affects a figure
 *    shown while offline.
 * 2. A null `outcome` is COUNTED here. Practice rows written before migration 0020 have no
 *    outcome, and a practice result row only exists for a question that was actually answered —
 *    so treating null as "answered" is right for practice. Mock rows genuinely can be
 *    unattempted, and those carry a real `UNATTEMPTED` outcome, so they are excluded correctly.
 */
const NOT_COUNTED = ["UNATTEMPTED", "PENDING_REVIEW"];

export async function getTopicActivityForDay(
  topicIds: string[],
  dayStart: Date,
  dayEnd: Date,
): Promise<Map<string, TopicActivity>> {
  const totals = new Map<string, TopicActivity>();
  if (topicIds.length === 0) return totals;

  const add = (topicId: string | null, answered: number, correct: number) => {
    if (!topicId) return;
    const current = totals.get(topicId) ?? { answered: 0, correct: 0 };
    totals.set(topicId, { answered: current.answered + answered, correct: current.correct + correct });
  };

  try {
    const practice = await db
      .select({
        topicId: questions.topicId,
        answered: sql<number>`count(*)`,
        correct: sql<number>`sum(case when ${practiceSessionResults.isCorrect} then 1 else 0 end)`,
      })
      .from(practiceSessionResults)
      .innerJoin(practiceSessions, eq(practiceSessions.id, practiceSessionResults.sessionId))
      .innerJoin(questions, eq(questions.id, practiceSessionResults.questionId))
      .where(
        and(
          gte(practiceSessions.completedAt, dayStart),
          lt(practiceSessions.completedAt, dayEnd),
          inArray(questions.topicId, topicIds),
          // Null counts — see divergence 2 above.
          or(isNull(practiceSessionResults.outcome), notInArray(practiceSessionResults.outcome, NOT_COUNTED)),
        ),
      )
      .groupBy(questions.topicId)
      .all();

    for (const row of practice) add(row.topicId, row.answered, row.correct ?? 0);

    const mock = await db
      .select({
        topicId: questions.topicId,
        answered: sql<number>`count(*)`,
        // `outcome`, never `selectedIndex = correctIndex`: both are null for a real, answered
        // MULTIPLE_CHOICE/TRUE_FALSE result, which the index comparison scores as wrong. Same
        // fix as the backend's own mock query — see localEvidence.ts, which hit this first.
        correct: sql<number>`sum(case when ${mockTestAttemptResults.outcome} = 'CORRECT' then 1 else 0 end)`,
      })
      .from(mockTestAttemptResults)
      .innerJoin(mockTestAttempts, eq(mockTestAttempts.id, mockTestAttemptResults.attemptId))
      .innerJoin(questions, eq(questions.id, mockTestAttemptResults.questionId))
      .where(
        and(
          gte(mockTestAttempts.completedAt, dayStart),
          lt(mockTestAttempts.completedAt, dayEnd),
          inArray(questions.topicId, topicIds),
          or(isNull(mockTestAttemptResults.outcome), notInArray(mockTestAttemptResults.outcome, NOT_COUNTED)),
        ),
      )
      .groupBy(questions.topicId)
      .all();

    for (const row of mock) add(row.topicId, row.answered, row.correct ?? 0);
  } catch (err) {
    // A failure here costs the offline progress overlay, never the plan itself. The caller
    // renders the cached definition regardless.
    console.warn("Failed to derive local daily-plan progress", err);
  }

  return totals;
}

/**
 * The start and end of a calendar day in a named zone, as instants.
 *
 * A plan belongs to a calendar DAY, and which day that is depends on the zone — so this has to
 * agree with the zone the server was asked to plan in, or the overlay counts the wrong window.
 * `en-CA` is used because it formats as `YYYY-MM-DD`, and the offset is recovered by asking the
 * same formatter what that wall-clock time is in UTC terms rather than by assuming one.
 *
 * Falls back to the device's own local day if the zone is unusable, which is the same thing the
 * rest of the app does rather than guessing at UTC.
 */
export function dayBoundsInZone(zone: string | undefined, now: Date = new Date()): { start: Date; end: Date } {
  if (!zone) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
  }
  try {
    // Wall-clock "now" in the target zone, read back as if it were UTC — the difference between
    // that and the real instant is the zone's current offset.
    const asUtc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
    const asZone = new Date(now.toLocaleString("en-US", { timeZone: zone }));
    const offsetMs = asZone.getTime() - asUtc.getTime();
    const zoned = new Date(now.getTime() + offsetMs);
    const startZoned = Date.UTC(zoned.getUTCFullYear(), zoned.getUTCMonth(), zoned.getUTCDate());
    const start = new Date(startZoned - offsetMs);
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
  } catch {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
  }
}

/** Today's date in a zone, as `YYYY-MM-DD` — the cache key's day component. */
export function todayInZone(zone: string | undefined, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", zone ? { timeZone: zone } : undefined).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA").format(now);
  }
}
