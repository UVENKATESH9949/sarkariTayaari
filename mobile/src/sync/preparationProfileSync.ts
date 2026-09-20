import {
  fetchPreparationProfile,
  uploadPreparationProfile,
  type PreparationProfilePayload,
} from "@sarkaritaiyaari/core/api";
import { loadPreparationProfile, savePreparationProfile } from "../db/onboarding";

/**
 * Sends the preparation profile to the server, and takes the server's back when it is newer.
 *
 * <h2>Why this exists</h2>
 * Onboarding asks how much time the student has each day and writes it to device-local
 * `app_preferences` (migration 0027), before any sign-in, because accounts are optional. The daily
 * planner (`GET /api/me/daily-plan`) runs on the SERVER and cannot budget a day without it — so
 * until this ran, every real account fell back to a declared 60-minute default no matter what the
 * student had actually chosen.
 *
 * <h2>Last write wins, on the moment of the edit</h2>
 * Both sides carry a timestamp and the later one is kept. The device's comes from
 * `profile_updated_at` (migration 0030), stamped when the student edits — not when the upload
 * happens — so an edit made offline and synced three days later still loses to a newer one made
 * elsewhere. The server applies the same rule, and hands back the winner when an upload loses, so
 * one round trip is enough to converge.
 *
 * <h2>What is deliberately not synced</h2>
 * `contentLanguages` (its own table, and a content-rendering preference rather than a planning
 * input), the interface language, theme and zoom — all device preferences. And the two onboarding
 * timestamps, which answer "has this install been onboarded", a question about the device and not
 * about the account.
 */
export async function syncPreparationProfile(token: string): Promise<"uploaded" | "pulled" | "noop"> {
  const local = await loadPreparationProfile();

  /*
   * When the student actually stated this profile.
   *
   * `profileUpdatedAt` only exists from migration 0030 onward, so every install that onboarded
   * before it has none — which is most of them. Falling back to `onboardingCompletedAt` is not a
   * guess: that IS the moment the student answered these questions, and it is already stored.
   *
   * Found by the device pass, not by review. The first version treated a missing timestamp as
   * "nothing to say" and pushed nothing — so a real device carrying a real "1-2 hours" answer from
   * onboarding would have kept it to itself forever, and the planner would have budgeted the
   * 60-minute default for exactly the students this change exists to serve. The instinct behind it
   * was right, but it only matters when the server already holds something, which the ordering
   * below preserves: a genuine later edit on another device still wins, because its timestamp is
   * newer than this onboarding moment.
   */
  const editedAt = local.profileUpdatedAt ?? local.onboardingCompletedAt;

  /*
   * No timestamp at all means this install has never completed onboarding, so there is genuinely
   * nothing to say about this student. Take the server's copy if it has one, and push nothing —
   * inventing a "now" here would beat a real edit made on their other device.
   */
  if (!editedAt) {
    return (await pullIfPresent(token)) ? "pulled" : "noop";
  }

  const payload: PreparationProfilePayload = {
    displayName: local.displayName?.trim() ? local.displayName.trim() : null,
    primaryExamCode: local.primaryExamCode,
    examStageId: local.examStageId,
    targetYear: local.targetYear,
    preparationLevel: local.preparationLevel,
    dailyStudyTime: local.dailyStudyTime,
    updatedAt: editedAt,
  };

  const result = await uploadPreparationProfile(token, payload);

  // The upload lost, and the response already carries the winner — so the correction costs no
  // extra round trip. Writing it locally is what makes the two devices actually converge rather
  // than each keeping its own answer and re-losing on every sync.
  if (!result.stored && result.profile) {
    await applyRemote(result.profile);
    return "pulled";
  }

  return "uploaded";
}

/** True when the server had a profile and it was written locally. */
async function pullIfPresent(token: string): Promise<boolean> {
  const remote = await fetchPreparationProfile(token);
  if (!remote.profile) return false;
  await applyRemote(remote.profile);
  return true;
}

/**
 * Writes the server's profile locally, preserving its own timestamp rather than stamping now —
 * otherwise this device would immediately look like the most recent editor and win a conflict it
 * did not earn.
 */
async function applyRemote(remote: PreparationProfilePayload): Promise<void> {
  await savePreparationProfile({
    displayName: remote.displayName ?? "",
    primaryExamCode: remote.primaryExamCode,
    examStageId: remote.examStageId,
    targetYear: remote.targetYear,
    preparationLevel: remote.preparationLevel as never,
    dailyStudyTime: remote.dailyStudyTime as never,
    // The one caller that passes an explicit timestamp: savePreparationProfile honours it rather
    // than stamping now, so this device does not look like the most recent editor.
    profileUpdatedAt: remote.updatedAt,
  });
}
