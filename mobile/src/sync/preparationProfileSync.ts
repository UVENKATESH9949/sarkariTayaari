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
 * input), the interface language, theme and zoom — all device preferences. And `onboardingStartedAt`,
 * which only matters to the install that is mid-flow.
 *
 * <h2>Onboarding completion IS synced (V53, 2026-09-24)</h2>
 * This used to be listed above as device-only, on the reasoning that "has this install been
 * onboarded" is a question about the device. That reasoning broke on reinstall: uninstalling wipes
 * the device, so a student who had onboarded was asked everything again. Completion is now an
 * account fact the server keeps monotonically, and an install that has not finished only ever
 * downloads (see below).
 */
export async function syncPreparationProfile(token: string): Promise<"uploaded" | "pulled" | "noop"> {
  const local = await loadPreparationProfile();

  /*
   * AN INSTALL THAT HAS NOT FINISHED ONBOARDING NEVER UPLOADS. It only downloads.
   *
   * Fixed 2026-09-24, and it was a data-loss bug, not a nicety. `savePreparationProfile` stamps
   * `profileUpdatedAt` on every write — including the "onboarding started" stamp written the
   * moment a fresh install launches, and every answer written through mid-flow. So a REINSTALLED
   * app, signing in with an empty profile, carried a timestamp newer than the server's real copy
   * and won last-write-wins: the student's exam, study time and name were overwritten with nulls.
   * The same thing sent half-finished profiles up whenever the app was backgrounded mid-flow.
   *
   * Until this install is stamped complete, the only thing it can usefully do is take the account's
   * copy — which is also how a reinstalled app learns onboarding was already done (see applyRemote).
   */
  if (!local.onboardingCompletedAt) {
    return (await pullIfFinished(token)) ? "pulled" : "noop";
  }

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
   * 60-minute default for exactly the students this change exists to serve.
   */
  const editedAt = local.profileUpdatedAt ?? local.onboardingCompletedAt;

  const payload: PreparationProfilePayload = {
    displayName: local.displayName?.trim() ? local.displayName.trim() : null,
    primaryExamCode: local.primaryExamCode,
    examStageId: local.examStageId,
    targetYear: local.targetYear,
    preparationLevel: local.preparationLevel,
    dailyStudyTime: local.dailyStudyTime,
    updatedAt: editedAt,
    // The server keeps this monotonically (never cleared), so sending it every time is safe.
    onboardingCompletedAt: local.onboardingCompletedAt,
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

/**
 * Whether the server's copy says onboarding was finished, and when.
 *
 * A server from V53 on answers directly (a string, or null for "not finished"). An older server
 * does not send the field at all — the APK and the backend deploy separately, so that window is
 * real. There, a stored profile carrying a display name is taken as finished, matching exactly how
 * V53 backfills: the name is the first answer, and devices only uploaded after completing.
 */
export function remoteCompletedAt(remote: PreparationProfilePayload): string | null {
  if (remote.onboardingCompletedAt !== undefined) return remote.onboardingCompletedAt;
  return remote.displayName?.trim() ? remote.updatedAt : null;
}

/**
 * True when the server held a FINISHED profile and it was written locally.
 *
 * An unfinished server copy is left alone: this install is itself mid-onboarding, and writing a
 * partial remote profile into SQLite would overwrite the answers the student is typing right now.
 */
async function pullIfFinished(token: string): Promise<boolean> {
  const remote = await fetchPreparationProfile(token);
  if (!remote.profile || !remoteCompletedAt(remote.profile)) return false;
  await applyRemote(remote.profile);
  return true;
}

/**
 * Writes the server's profile locally, preserving its own timestamp rather than stamping now —
 * otherwise this device would immediately look like the most recent editor and win a conflict it
 * did not earn.
 */
async function applyRemote(remote: PreparationProfilePayload): Promise<void> {
  const local = await loadPreparationProfile();
  const completedAt = remoteCompletedAt(remote);
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
    // What lets a reinstalled app (or a second phone) skip onboarding: the account says it was
    // finished, so this install is too. Only ever SET here — a remote "not finished" never clears
    // a completion this device stamped itself. OnboardingProvider re-reads this after sign-in.
    ...(completedAt && !local.onboardingCompletedAt ? { onboardingCompletedAt: completedAt } : {}),
  });
}
