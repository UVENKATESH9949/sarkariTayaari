import { ApiError, fetchDailyPlan, type DailyPlanResponse } from "@sarkaritaiyaari/core/api";
import { loadSession } from "../db/authSession";
import { dayBoundsInZone, getTopicActivityForDay, todayInZone } from "./dailyPlanProgress";
import { readSnapshot, snapshotKey, writeSnapshot } from "./snapshotStore";

/**
 * Where today's plan comes from (`api/DAILY-PLAN.md`).
 *
 * Same role as `data/weaknessRadarData.ts` and the rest of `src/data/`: one place that decides
 * what a screen gets, so no screen has to. The session is read here rather than passed in, so no
 * screen ever holds a bearer token — `authContext` keeps it private on purpose.
 *
 * <h2>Two deliberate differences from the radar facade</h2>
 *
 * **There is no signed-out fallback.** The radar can be computed on-device because every input
 * is a local attempt row. A daily plan cannot: it is *stored* server-side by design (Phase 6
 * needs a record of what was assigned), and it is built from the roadmap and revision plan,
 * which read cohort timings and curated exam priority this device does not have. Computing a
 * second, quietly different plan locally is exactly the drift this program spent three phases
 * removing. So signing out is a real state with a real answer, not a degraded one.
 *
 * **There IS a cache now, and it is a snapshot — see the policy below.** This used to say there
 * was none, for two reasons that were real and are both answered rather than ignored:
 *
 *   - *"Reading this endpoint is what generates the day, so a cached read would leave the day
 *     unplanned on the server."* Still true for the instant a stale plan is on screen, and it
 *     resolves the moment the background refresh lands. The residual case is a student offline
 *     for a whole NEW day: they see yesterday's snapshot, clearly labelled, and no plan is
 *     generated server-side. That is the correct record — they genuinely were not assigned a
 *     day — and Phase 6's settlement reads `study_tasks`, so it is not confused by the absence.
 *   - *"A plan belongs to a calendar day, so a saved one risks showing yesterday's work as
 *     today's."* Answered by the key: the snapshot is keyed on the plan date in the zone that
 *     was asked for, so yesterday's snapshot can never be mistaken for today's. It is shown only
 *     as an explicitly-labelled fallback, never as today's plan.
 *
 * <h2>The policy</h2>
 *
 * Stale-while-revalidate, with the plan's DEFINITION and its PROGRESS treated separately.
 *
 * The definition — which topics, which purpose, how many questions, why — is what the server
 * decides and the device cannot. That is what gets cached.
 *
 * The progress — `status`, `answeredToday`, `accuracyToday` — is server-computed from real
 * attempts (Phase 6 infers completion; there is deliberately no "mark done" button). Cache those
 * verbatim and a student who answered twelve questions offline still reads "0 of 15", which
 * looks like their work was lost. So a cached plan has its progress RE-DERIVED on the device by
 * `dailyPlanProgress.ts`, which mirrors `TaskOutcomeService`'s rule exactly.
 *
 * **Server values always win when the server answers.** The local derivation fills a gap; it
 * never competes. Anything else would make the same task read one way online and another offline.
 */

export type DailyPlanResult =
  | { status: "signed-out" }
  /** Straight from the server. `fetchedAt` is null because it is now. */
  | { status: "ready"; plan: DailyPlanResponse; fetchedAt: number | null }
  /**
   * A stored snapshot, with its progress re-derived locally. The screen must say so — a student
   * looking at a saved plan should know why the numbers might lag.
   */
  | { status: "cached"; plan: DailyPlanResponse; fetchedAt: number }
  /** Offline with nothing stored, a server error, or an exam the server does not know. */
  | { status: "unavailable"; message: string };

/**
 * The device's IANA time zone, or undefined to let the server apply its documented UTC default.
 *
 * A plan belongs to a calendar day, so this is not cosmetic. `Intl` is present on Hermes in this
 * Expo version, but `resolvedOptions().timeZone` is specified to be able to return undefined and
 * has historically returned junk on some builds — so it is checked for the `Area/Location` shape
 * rather than trusted, because sending a bad value is a 400 and would take the screen down.
 *
 * **The residual risk, stated rather than hidden:** if this ever does fall through, the server
 * plans in UTC. For a student in IST that is a different calendar day between midnight and
 * 05:30, so they would see the previous day's plan. Reporting `planDate` on the screen is what
 * makes that visible instead of silent.
 */
function deviceTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && /^[A-Za-z_]+\/[A-Za-z0-9_+\-/]+$/.test(zone) ? zone : undefined;
  } catch {
    return undefined;
  }
}

const NAMESPACE = "daily-plan";

/**
 * The snapshot key.
 *
 * Every part is load-bearing. The USER because signing in as somebody else must never surface the
 * previous account's plan. The EXAM because switching exams must not evict the other one's
 * snapshot — a student with two exams should find both instantly. The DATE because a plan belongs
 * to a calendar day and yesterday's must never be mistaken for today's. The ZONE because the date
 * is only meaningful in one, and the same instant is two different days either side of midnight.
 */
function keyFor(userId: string, examCode: string, zone: string | undefined): string {
  return snapshotKey(NAMESPACE, userId, examCode, todayInZone(zone), zone);
}

/**
 * Re-derives each task's progress from the device's own history.
 *
 * Only ever applied to a CACHED plan. A fresh server response already carries authoritative
 * figures and must not be second-guessed — see the note above about the same task reading two
 * different ways.
 */
async function withLocalProgress(plan: DailyPlanResponse): Promise<DailyPlanResponse> {
  const topicIds = Array.from(
    new Set(plan.tasks.map((task) => task.topicId).filter((id): id is string => Boolean(id))),
  );
  if (topicIds.length === 0) return plan;

  const { start, end } = dayBoundsInZone(plan.zone);
  const activity = await getTopicActivityForDay(topicIds, start, end);
  if (activity.size === 0) return plan;

  return {
    ...plan,
    tasks: plan.tasks.map((task) => {
      const seen = task.topicId ? activity.get(task.topicId) : undefined;
      if (!seen || seen.answered === 0) return task;
      return {
        ...task,
        answeredToday: seen.answered,
        accuracyToday: Math.round((seen.correct / seen.answered) * 100),
        /*
         * `status` is deliberately NOT recomputed. Settlement is the server's, it only happens
         * once a day is closed, and it applies a threshold (>=60% of the asked questions) that
         * belongs in one place. Re-deriving it here would be a second implementation of a rule
         * the program went out of its way to keep single. The answered count moving is what the
         * student actually needs to see while offline.
         */
      };
    }),
  };
}

/**
 * Today's plan, from the snapshot first and the server right after.
 *
 * Returns twice by design: the promise resolves with whatever can be shown immediately, and
 * `onRefreshed` fires later if the server had something different. A caller that only wants the
 * authoritative answer can ignore the callback; a screen should use it, because that is what
 * turns a 2-3 second wait into an instant open.
 */
export async function getDailyPlan(
  examCode: string,
  onRefreshed?: (result: DailyPlanResult) => void,
): Promise<DailyPlanResult> {
  const session = await loadSession();
  const token = session?.token ?? null;
  if (!token) return { status: "signed-out" };

  const zone = deviceTimeZone();
  const key = keyFor(session!.user.id, examCode, zone);

  const cached = await readSnapshot<DailyPlanResponse>(key);
  if (cached) {
    // Show the snapshot now, and go and check. The refresh is not awaited: awaiting it would
    // reintroduce exactly the wait the cache exists to remove.
    void refresh(token, examCode, zone, key).then((fresh) => onRefreshed?.(fresh));
    return { status: "cached", plan: await withLocalProgress(cached.payload), fetchedAt: cached.fetchedAt };
  }

  return refresh(token, examCode, zone, key);
}

async function refresh(
  token: string,
  examCode: string,
  zone: string | undefined,
  key: string,
): Promise<DailyPlanResult> {
  try {
    const plan = await fetchDailyPlan(token, examCode, zone);
    // Not awaited: the caller is about to render this value, and a slow write should not hold
    // that up. A failed write costs the next open being slow, never this one being wrong.
    void writeSnapshot(key, plan);
    return { status: "ready", plan, fetchedAt: Date.now() };
  } catch (err) {
    /*
     * A 404 is a real, distinct answer — the server does not have this exam — and saying so
     * beats "couldn't load your plan", which sends the student to check their connection over
     * something a retry will never fix.
     */
    if (err instanceof ApiError && err.status === 404) {
      return { status: "unavailable", message: "We don't have a plan for this exam yet." };
    }
    return {
      status: "unavailable",
      message: "We couldn't build today's plan just now. It needs a connection — try again in a moment.",
    };
  }
}
