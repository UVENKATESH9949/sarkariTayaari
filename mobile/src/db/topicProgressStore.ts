import { eq, sql } from "drizzle-orm";
import { db } from "./client";
import { topicProgress } from "./schema";
import type { TopicProgressState } from "./topicIntelligence";

/**
 * Local writes for per-topic mastery (Epic L / TICKET-2105).
 *
 * The device is what derives the state, not the server: the per-question practice detail lives
 * here and never leaves. The server's job is to store the result and reject transitions that
 * would corrupt it, which is why the same ladder is encoded on both sides.
 *
 * Written locally first and uploaded afterwards, matching bookmarks and practice sessions —
 * finishing a quiz must never wait on the network.
 */

/** Accuracy at or above which a topic is considered mastered. */
const MASTERY_ACCURACY = 80;

/** Below this, a previously-mastered topic has regressed and needs revision. */
const REGRESSION_ACCURACY = 60;

/**
 * Attempts needed before accuracy is trusted enough to call something mastered.
 *
 * Without this, one lucky 5-question quiz at 100% would mark a topic MASTERED and — because
 * MASTERED is what clears a prerequisite — unlock everything downstream of it. Ten is a
 * judgement call, not a derived figure; it is roughly two practice sets.
 */
const MASTERY_MIN_ATTEMPTS = 10;

/**
 * Where a topic sits after a practice session, given its cumulative totals.
 *
 * Cumulative, not per-session: a single weak session should not undo a topic a student has
 * answered a hundred questions on correctly. That is also why the regression path requires the
 * topic to have been MASTERED already — the source spec's §31 treats NEEDS_REVISION as a
 * regression, not as a rung on the ladder.
 */
export function deriveState(
  previous: TopicProgressState,
  attemptedCount: number,
  accuracyPercent: number,
): TopicProgressState {
  if (attemptedCount === 0) return previous;

  if (previous === "MASTERED" || previous === "NEEDS_REVISION") {
    // Once mastered, a topic only moves between MASTERED and NEEDS_REVISION. Dropping it back
    // to LEARNING would lose the fact that it was mastered at all, which is the one thing
    // NEEDS_REVISION exists to record.
    return accuracyPercent < REGRESSION_ACCURACY ? "NEEDS_REVISION" : "MASTERED";
  }

  if (accuracyPercent >= MASTERY_ACCURACY && attemptedCount >= MASTERY_MIN_ATTEMPTS) {
    return "MASTERED";
  }
  // PRACTICING once there is enough history to speak of, LEARNING while there is not. The
  // threshold is shared with mastery on purpose: "enough attempts to judge" is one idea.
  return attemptedCount >= MASTERY_MIN_ATTEMPTS ? "PRACTICING" : "LEARNING";
}

/**
 * Folds one completed practice session into a topic's cumulative progress.
 *
 * Read-modify-write rather than a SQL-side increment. The state transition needs the previous
 * state, and the ladder above is not expressible in SQLite without duplicating it in SQL — one
 * definition of the rules is worth one extra read on a path that runs once per finished quiz.
 *
 * Marks the row unsynced so the next sync picks it up; the upload is fire-and-forget.
 */
export async function recordTopicPractice(params: {
  topicId: string;
  correctCount: number;
  totalCount: number;
  durationMs?: number;
}): Promise<void> {
  const { topicId, correctCount, totalCount } = params;
  if (totalCount <= 0) return;

  const existing = await db
    .select()
    .from(topicProgress)
    .where(eq(topicProgress.topicId, topicId))
    .get();

  const attemptedCount = (existing?.attemptedCount ?? 0) + totalCount;
  const cumulativeCorrect = (existing?.correctCount ?? 0) + correctCount;
  const totalTimeMs = (existing?.totalTimeMs ?? 0) + Math.max(0, params.durationMs ?? 0);

  // Rounded to two places to match the server column's NUMERIC(5,2). Sending more precision
  // than the column holds means the value the server stores differs from the one this device
  // believes it sent, and the next last-write-wins comparison is then between two different
  // numbers that both claim to be current.
  const accuracyPercent =
    Math.round(((cumulativeCorrect / attemptedCount) * 100 + Number.EPSILON) * 100) / 100;

  const previous = (existing?.state ?? "NOT_STARTED") as TopicProgressState;
  const state = deriveState(previous, attemptedCount, accuracyPercent);
  const now = new Date();

  await db
    .insert(topicProgress)
    .values({
      topicId,
      state,
      accuracyPercent,
      attemptedCount,
      correctCount: cumulativeCorrect,
      totalTimeMs,
      lastPracticedAt: now,
      isSynced: false,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: topicProgress.topicId,
      set: {
        state: sql`excluded.state`,
        accuracyPercent: sql`excluded.accuracy_percent`,
        attemptedCount: sql`excluded.attempted_count`,
        correctCount: sql`excluded.correct_count`,
        totalTimeMs: sql`excluded.total_time_ms`,
        lastPracticedAt: sql`excluded.last_practiced_at`,
        isSynced: sql`excluded.is_synced`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

/** Rows waiting to be uploaded. */
export async function loadPendingTopicProgress() {
  return db.select().from(topicProgress).where(eq(topicProgress.isSynced, false)).all();
}

/**
 * Marks the given topics as synced.
 *
 * Scoped to the ids that were actually uploaded rather than a blanket
 * `set isSynced = true where isSynced = false`. A quiz finishing while the upload was in flight
 * would otherwise have its brand-new row marked synced without ever having been sent — a silent
 * loss of progress, and exactly the class of bug the pending-queue pattern exists to avoid.
 */
export async function markTopicProgressSynced(topicIds: string[]): Promise<void> {
  if (topicIds.length === 0) return;
  const { inArray } = await import("drizzle-orm");
  await db
    .update(topicProgress)
    .set({ isSynced: true })
    .where(inArray(topicProgress.topicId, topicIds));
}

/**
 * Replaces local progress with the server's copy, for a fresh install.
 *
 * Rows arrive already synced, so restore does not immediately re-upload what it just downloaded.
 * A `topicId` the device has no topic row for is still stored: the content sync may not have
 * finished, and dropping it would silently lose real history.
 */
export async function restoreTopicProgress(
  rows: {
    topicId: string;
    state: string;
    accuracyPercent: number | null;
    attemptedCount: number;
    correctCount: number;
    totalTimeMs: number;
    lastPracticedAt: string | null;
    updatedAt: string;
  }[],
): Promise<void> {
  if (rows.length === 0) return;

  await db
    .insert(topicProgress)
    .values(
      rows.map((row) => ({
        topicId: row.topicId,
        state: row.state,
        accuracyPercent: row.accuracyPercent,
        attemptedCount: row.attemptedCount,
        correctCount: row.correctCount,
        totalTimeMs: row.totalTimeMs,
        lastPracticedAt: row.lastPracticedAt ? new Date(row.lastPracticedAt) : null,
        isSynced: true,
        updatedAt: new Date(row.updatedAt),
      })),
    )
    .onConflictDoUpdate({
      target: topicProgress.topicId,
      // Only overwrite when the server's copy is genuinely newer. Restore can run after a
      // session was recorded offline, and clobbering that would discard practice the student
      // just did — last-write-wins has to hold in this direction too, not only on upload.
      setWhere: sql`excluded.updated_at > ${topicProgress.updatedAt}`,
      set: {
        state: sql`excluded.state`,
        accuracyPercent: sql`excluded.accuracy_percent`,
        attemptedCount: sql`excluded.attempted_count`,
        correctCount: sql`excluded.correct_count`,
        totalTimeMs: sql`excluded.total_time_ms`,
        lastPracticedAt: sql`excluded.last_practiced_at`,
        isSynced: sql`excluded.is_synced`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}
