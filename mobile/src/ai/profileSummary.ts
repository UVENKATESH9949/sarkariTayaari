import {
  buildLearnerProfileContext,
  isAiLanguage,
  profileSummaryTemplate,
  routeAiTask,
  type ProfileSummary,
} from "@sarkaritaiyaari/core/ai";
import { postProfileSummary } from "@sarkaritaiyaari/core/api";
import type { RadarResult } from "@sarkaritaiyaari/core/intelligence";
import { loadSession } from "../db/authSession";
import { getLocalAiTaskFlags } from "../db/clientConfigLocal";

/**
 * TASK-2701 Phase 7.3 — the AI-phrased narrative shown on the Preparation Radar screen, the
 * `PROFILE_SUMMARY` counterpart to `ai/sessionFeedback.ts`'s `SESSION_FEEDBACK` functions. Not
 * folded into that same module: `LearnerProfileContext` (strengths/weaknesses/coverage) has no
 * overlap with `SessionContext` (answered/correct/accuracy for one just-finished session), so
 * there is no shared shape worth generalising over — see `getOrBuildNarrative` there for the
 * amount of sharing that *did* pay for itself between Practice and Mock Test.
 *
 * Same router discipline as `sessionFeedback.ts`: only a `cloud` handler is ever supplied to
 * `routeAiTask`, never `deterministic`, even though the task declares both tiers — otherwise the
 * router would always serve the canned template and the AI phrasing this screen wants would
 * never run. `profileSummaryTemplate` is invoked directly as the fallback only when the router
 * reports `UNAVAILABLE`.
 *
 * Unlike session feedback, there is deliberately no local or server-side cache here — see
 * `postProfileSummary`'s own doc comment for why a profile summary has no natural row to persist
 * onto, and why the underlying facts change too often for a cache to be worth the invalidation
 * logic it would need.
 */
export async function getOrBuildProfileSummary(params: {
  radar: NonNullable<RadarResult["radar"]>;
  examCode: string;
  languageCode: string;
}): Promise<string | null> {
  const { radar, examCode, languageCode } = params;

  // Nothing to summarise yet — the screen itself already shows an invitation rather than a
  // radar in this state (§21's first edge case); don't spend a model call to say the same thing
  // less clearly.
  if (radar.overview.topicsWithEvidence === 0) return null;

  const flags = await getLocalAiTaskFlags();
  if (flags.PROFILE_SUMMARY !== true) return null;

  const preferredLanguage = isAiLanguage(languageCode) ? languageCode : "en";
  const context = buildLearnerProfileContext(radar, { preferredLanguage });

  const token = (await loadSession())?.token ?? null;

  const result = await routeAiTask<ProfileSummary>(
    {
      taskId: "PROFILE_SUMMARY",
      languageCode: preferredLanguage,
      context: { learnerProfile: context },
      capabilities: {
        // Same reasoning as sessionFeedback.ts: no local model exists yet, deviceTier is
        // irrelevant since only `cloud` is supplied, and `online` is optimistic rather than
        // pre-checked — an offline device just fails the fetch, which the router already
        // records as an ERROR attempt.
        deviceTier: "MID",
        online: true,
        localModelReady: false,
        cloudEnabled: true,
      },
      flags,
    },
    token
      ? {
          cloud: async () => {
            const narrative = await postProfileSummary(examCode, context, token);
            return narrative
              ? { status: "SERVED", value: { taskId: "PROFILE_SUMMARY", narrative } }
              : { status: "UNAVAILABLE", detail: "backend declined to generate" };
          },
        }
      : {},
  );

  if (result.status === "SERVED") {
    return result.value.narrative;
  }

  return profileSummaryTemplate(context).narrative;
}
