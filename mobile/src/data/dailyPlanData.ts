import { ApiError, fetchDailyPlan, type DailyPlanResponse } from "@sarkaritaiyaari/core/api";
import { loadSession } from "../db/authSession";

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
 * **There is no cache.** Not an oversight — reading this endpoint is what *generates* the day,
 * so a cached read would hand back a plan while leaving the day unplanned on the server. And a
 * plan belongs to a calendar day: serving a saved one offline risks showing yesterday's work as
 * today's, which is worse than saying plainly that this needs a connection.
 */

export type DailyPlanResult =
  | { status: "signed-out" }
  | { status: "ready"; plan: DailyPlanResponse }
  /** Offline, a server error, or an exam the server does not know. */
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

export async function getDailyPlan(examCode: string): Promise<DailyPlanResult> {
  const token = (await loadSession())?.token ?? null;
  if (!token) return { status: "signed-out" };

  try {
    return { status: "ready", plan: await fetchDailyPlan(token, examCode, deviceTimeZone()) };
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
