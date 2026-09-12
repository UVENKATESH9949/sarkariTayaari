import { apiFetch } from "./client";
import type { WeaknessRadar } from "../intelligence";

/**
 * The Weakness Radar endpoints (`api/WEAKNESS-RADAR.md`).
 *
 * Paths here start with `/exams/...`, NOT `/api/exams/...`, because `API_BASE_URL` already
 * ends in `/api`. That is not a style preference: this exact mistake shipped once in
 * `api/examGuide.ts` and made the entire Exam Guide feature 404 on every device across three
 * sessions that each believed they had shipped it — the backend's own route really is
 * `/api/exams/...`, so curling it directly looked fine and nobody opened the screen. Compare
 * `api/reference.ts`, which is extensively device-tested and correctly has no prefix.
 */

/**
 * This student's radar for one exam.
 *
 * Requires a token: the response is derived from their own practice history, unlike its
 * neighbours under `/exams/{code}` which are public content.
 */
export async function fetchWeaknessRadar(examCode: string, token: string): Promise<WeaknessRadar> {
  return apiFetch<WeaknessRadar>(`/exams/${encodeURIComponent(examCode)}/weakness-radar`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Forces the server to recompute before answering.
 *
 * For pull-to-refresh, and for the moment just after a progress upload — where the client
 * knows new attempts landed and should not wait for the staleness check to notice.
 */
export async function recomputeWeaknessRadar(
  examCode: string,
  token: string,
): Promise<WeaknessRadar> {
  return apiFetch<WeaknessRadar>(
    `/exams/${encodeURIComponent(examCode)}/weakness-radar/recompute`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
}
