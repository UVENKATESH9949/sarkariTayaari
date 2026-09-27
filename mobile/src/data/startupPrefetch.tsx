import { useEffect, useRef } from "react";
import { useActiveExam } from "../examsModule/activeExamContext";
import { useAuth } from "../practice/authContext";
import { getDailyPlan } from "./dailyPlanData";

/**
 * Kicks off background preparation of core Home data, the moment it is safe to — signed in, and
 * the active exam known — without ever holding up the app's own render.
 *
 * <h2>Why this exists</h2>
 *
 * `getDailyPlan()` already implements exactly the "prepare before it's needed" policy this is
 * meant to generalise: read the on-device snapshot first, return it instantly, and refresh from
 * the server in the background (see `data/dailyPlanData.ts`'s own doc comment). What it did NOT
 * do is get *called* until the Daily Plan screen mounted — so the very first time a student ever
 * opens it (no snapshot yet), or the first time on a new day (a stale snapshot), that instant
 * open was really "wait for whichever is slower, a fresh generation or a background refresh"
 * happening AT the tap. This component exists purely to move that first call earlier, to the
 * moment the app is usable at all, so by the time a student actually taps Today's Plan the
 * snapshot this same function writes has usually already landed.
 *
 * <h2>Why this is not "prefetch everything"</h2>
 *
 * Only the Daily Plan is warmed here. Two things this was deliberately NOT extended to, and why:
 *
 * - **Readiness** needs no prefetch at all — it is computed entirely on-device from
 *   `useSessionHistory()` (already loaded for the whole app via `SessionHistoryProvider`), so
 *   there is no network round trip to hide in the first place.
 * - **The Study Roadmap** (`data/studyRoadmapData.ts`) is explicitly documented as having NO
 *   cache — its order moves with every session practised and its minutes move with the cohort,
 *   so a saved copy would often be silently wrong. Prefetching it here would spend a real
 *   request on data that is thrown away the instant it is not the freshest possible answer, for
 *   a screen most students open rarely. The Preparation Radar is local-first for the same reason
 *   `getDailyPlan` has no signed-out fallback does NOT apply to it — it already answers from
 *   on-device computation before touching the network.
 *
 * So this stays a short, named list of genuinely core, genuinely cacheable data — exactly the
 * "a small number of important features, not every possible one" instruction this was built to.
 * Adding another prefetched call later means one more line here, not a new mechanism.
 *
 * <h2>Why this cannot double-fire or race the screen's own call</h2>
 *
 * `getDailyPlan` itself is what decides whether a real network request happens (snapshot found →
 * background revalidate only; nothing found → one real fetch) — this component does not
 * duplicate that decision, it just calls the same function once earlier. The ref below stops
 * *this component* re-firing for the same (user, exam) pair across re-renders; it does not need
 * to coordinate with the Daily Plan screen's own later call, because by the time that runs, the
 * snapshot this call already wrote is what it will read back first.
 */
export function StartupPrefetch() {
  const { user } = useAuth();
  const { activeExam } = useActiveExam();
  const examCode = activeExam?.code ?? null;

  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !examCode) return;
    const key = `${user.id}:${examCode}`;
    if (firedFor.current === key) return;
    firedFor.current = key;
    // Deliberately not awaited and its result deliberately unused here — this call exists only
    // for its side effect (writing the snapshot getDailyPlan reads back), never to hold up
    // anything else that renders. A failure here is silent by design: getDailyPlan's own
    // "unavailable" path is what the Daily Plan screen shows if this genuinely could not reach
    // the server, and duplicating that message here would just be a second place to keep it
    // truthful.
    void getDailyPlan(examCode);
  }, [user, examCode]);

  return null;
}
