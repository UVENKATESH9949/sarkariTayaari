import { ApiError, fetchStudyRoadmap, type StudyRoadmapResponse } from "@sarkaritaiyaari/core/api";
import { loadSession } from "../db/authSession";

/**
 * Where the study roadmap comes from (`api/STUDY-ROADMAP.md`).
 *
 * Same shape and the same reasoning as `data/dailyPlanData.ts`, which it deliberately mirrors: the
 * session is read here so no screen ever holds a bearer token, signing out is a real state rather
 * than a degraded one, and there is no cache.
 *
 * **No local fallback.** The order comes from Epic L's curated exam priority and the minutes from
 * cohort timings across all students — neither of which this device has. The app already ships a
 * signed-out backlog for this question (`prepare-plan`, on the Exam Guide screen), so a second,
 * quietly different local answer would be the drift this program spent three phases removing.
 *
 * **No cache**, unlike the radar. The radar caches because a stale diagnosis is still a diagnosis;
 * a roadmap's minutes move with the cohort and its order moves with every session practised, so a
 * saved copy would mostly be wrong in ways a student could not see.
 */

export type StudyRoadmapResult =
  | { status: "signed-out" }
  | { status: "ready"; roadmap: StudyRoadmapResponse }
  | { status: "unavailable"; message: string };

export async function getStudyRoadmap(examCode: string): Promise<StudyRoadmapResult> {
  const token = (await loadSession())?.token ?? null;
  if (!token) return { status: "signed-out" };

  try {
    return { status: "ready", roadmap: await fetchStudyRoadmap(token, examCode) };
  } catch (err) {
    // A 404 is a real answer — the server does not know this exam — and saying so beats sending
    // the student to check a connection that is working fine.
    if (err instanceof ApiError && err.status === 404) {
      return { status: "unavailable", message: "We don't have a roadmap for this exam yet." };
    }
    return {
      status: "unavailable",
      message: "We couldn't build your roadmap just now. It needs a connection — try again in a moment.",
    };
  }
}
