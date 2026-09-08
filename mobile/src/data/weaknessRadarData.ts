import { fetchWeaknessRadar, recomputeWeaknessRadar } from "../api/weaknessRadar";
import { loadSession } from "../db/authSession";
import { readCachedRadar, writeCachedRadar } from "../db/radarCache";
import { buildLocalRadar } from "../intelligence/localRadar";
import type { RadarResult } from "../intelligence/types";

/**
 * Where a Weakness Radar comes from (Weakness Radar v1 — `tasks/TASK-2201-weakness-radar.md`).
 *
 * The screens call only this. Same role as `data/examGuideData.ts` and the rest of
 * `src/data/`: one place that decides between the network and the device, so no screen has to.
 *
 * Three cases, in the order they are tried:
 *
 * | Situation | Source | Why |
 * |---|---|---|
 * | Signed in, reachable server | `server` | The server sees every device's attempts and runs the authoritative formula |
 * | Signed in, no network | `cache` | The last server answer, written through on every successful fetch (§15, §21) |
 * | Signed out | `local` | Their attempts exist only on this device, so nothing else could answer |
 *
 * A signed-in student is never served the locally-computed radar, even though the code is
 * right there. Their history spans devices, and a device-only answer would silently contradict
 * the one they saw yesterday on another phone — a stale cache at least says how old it is.
 *
 * The session is read here rather than passed in, so no screen ever holds a bearer token —
 * `authContext` deliberately keeps it private and exposes actions (`pushProgress`) instead of
 * the credential. `loadSession()` is also the honest source: it drops an expired token and is
 * cleared on sign-out, so "is there a token" and "is this student signed in" are the same
 * question.
 */

export async function getRadar(params: {
  examCode: string;
  /** Ask the server to recompute before answering — pull-to-refresh, or after a sync. */
  forceRefresh?: boolean;
}): Promise<RadarResult> {
  const { examCode, forceRefresh = false } = params;
  const token = (await loadSession())?.token ?? null;

  if (!token) {
    // Signed out. No cache involved: the local computation is cheap, always current with this
    // device's attempts, and caching it would just add a way for it to be wrong.
    return { radar: await buildLocalRadar(examCode), source: "local", fetchedAtMs: null };
  }

  try {
    const radar = forceRefresh
      ? await recomputeWeaknessRadar(examCode, token)
      : await fetchWeaknessRadar(examCode, token);
    // Write-through before returning, so the next offline launch has this exact answer.
    // Failing to cache must not fail the read — the student has a perfectly good radar in
    // hand and losing it over a local write would be absurd.
    await writeCachedRadar(radar).catch(() => undefined);
    return { radar, source: "server", fetchedAtMs: Date.now() };
  } catch {
    /*
     * Any failure — offline, a 500, a timeout — falls back to the last cached answer. Not
     * narrowed to ApiError with status 0: the requirement (§21's "offline student") is that
     * the screen shows the last known state rather than an error, and that is the right
     * behaviour for a server hiccup too. The caller can tell the difference from `source`.
     */
    const cached = await readCachedRadar(examCode);
    if (cached) {
      return { radar: cached.radar, source: "cache", fetchedAtMs: cached.fetchedAtMs };
    }
    throw new Error("radar-unavailable");
  }
}
