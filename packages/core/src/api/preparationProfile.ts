import { apiFetch } from "./client";

/**
 * The account-wide preparation profile (see `api/PREPARATION-PROFILE.md`).
 *
 * Onboarding still runs before sign-in and still writes to the device. This is the copy the
 * server-side daily planner reads — without it the planner has no idea how much time the student
 * has and budgets a declared default for everyone.
 */
export type PreparationProfilePayload = {
  displayName: string | null;
  primaryExamCode: string | null;
  examStageId: string | null;
  targetYear: number | null;
  /** JUST_STARTING | LEARNING | PRACTICING | REVISING | EXAM_READY, or null if skipped. */
  preparationLevel: string | null;
  /** UNDER_1H | ONE_TO_TWO | TWO_TO_FOUR | FOUR_TO_SIX | SIX_PLUS, or null if skipped. */
  dailyStudyTime: string | null;
  /**
   * When the STUDENT made this edit — not when it was uploaded. The server resolves two devices
   * by keeping whichever is newer, so an edit made offline and synced three days later must still
   * carry its own moment, or it would win simply by arriving last.
   */
  updatedAt: string;
};

export type PreparationProfileResponse = {
  /** Null for an account that has never uploaded one — a real answer, not an error. */
  profile: PreparationProfilePayload | null;
};

export type PreparationProfileSyncResult = {
  /** False when the server already held something newer; not an error. */
  stored: boolean;
  /** Whatever is authoritative after the call, so a losing device can correct itself. */
  profile: PreparationProfilePayload | null;
};

export function fetchPreparationProfile(token: string) {
  return apiFetch<PreparationProfileResponse>("/me/preparation-profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Safe to retry — the server keeps whichever side carries the later `updatedAt`. */
export function uploadPreparationProfile(token: string, profile: PreparationProfilePayload) {
  return apiFetch<PreparationProfileSyncResult>("/me/preparation-profile", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: profile,
  });
}
