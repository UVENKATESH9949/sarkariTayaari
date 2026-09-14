import {
  buildSessionContext,
  isAiLanguage,
  routeAiTask,
  sessionFeedbackTemplate,
  type SessionFeedback,
} from "@sarkaritaiyaari/core/ai";
import { postMockAttemptFeedback, postSessionFeedback } from "@sarkaritaiyaari/core/api";
import type { RadarTopic } from "@sarkaritaiyaari/core/intelligence";
import { loadSession } from "../db/authSession";
import { getLocalAiTaskFlags } from "../db/clientConfigLocal";
import { saveMockAttemptFeedback, type MockTestAttemptRecord } from "../db/mockTest";
import { saveSessionFeedback, type SessionRecord } from "../db/practiceSessions";
import { getRadar } from "../data/weaknessRadarData";

/**
 * TASK-2701 Phase 7.1/7.2 — the AI-phrased narrative shown on Practice Summary
 * ({@link getOrBuildSessionFeedback}) and Mock Test Result ({@link getOrBuildMockFeedback}).
 * Both delegate to the same {@link getOrBuildNarrative}, differing only in where the cached
 * narrative/id/counts come from and which endpoint persists the result.
 *
 * ## How this calls the router — deliberately only `cloud`, never `deterministic`
 *
 * `routeAiTask` tries tiers strictly in `TIER_ORDER` (`DETERMINISTIC` before `GENERATED`) and
 * returns as soon as a supplied handler succeeds. `SESSION_FEEDBACK` declares both tiers
 * because the registry requires every declared tier to be genuinely servable — but if this
 * call site handed the router a `deterministic` handler too, the router would serve the
 * canned template on *every* call and the cloud narrative the user actually asked for would
 * never run. So only `cloud` is supplied here; `sessionFeedbackTemplate` is invoked directly,
 * outside the router, purely as the fallback when the router reports `UNAVAILABLE` — offline,
 * no signed-in token, or the backend declined/failed validation. This keeps the router's own
 * "cheapest tier that fully answers" contract intact for any future caller that *does* want
 * the template first, while this screen gets the AI phrasing whenever it's reachable.
 *
 * Nothing here throws: a session with no persisted narrative always gets *something* to show
 * (the template, at worst) unless the task is administratively disabled, in which case this
 * returns null and the screen renders no narrative header at all — matching `groundTruthFallback:
 * null`'s own reasoning that the stat blocks are already a complete screen without one.
 */
export async function getOrBuildSessionFeedback(params: {
  session: SessionRecord;
  /** The single topic this Practice session was scoped to, from the quiz screen's own route
   * params — a session is single-topic by construction, so this never needs a persisted column
   * (see the Phase 7.1 plan's schema-gap note). Null for the "All Government Exams" shortcut. */
  topicId: string | null;
  examCode: string | null;
  /** The app's content-language code (`useAppLanguage()`), not the UI language — may be any of
   * the 11 mock languages the picker lists, most of which have no AI content; anything
   * `SESSION_FEEDBACK` doesn't support falls back to English rather than failing outright. */
  languageCode: string;
}): Promise<string | null> {
  const { session, topicId, examCode, languageCode } = params;

  let sessionTopics: RadarTopic[] = [];
  if (examCode && topicId) {
    try {
      const { radar } = await getRadar({ examCode });
      sessionTopics = radar.topics.filter((t) => t.topicId === topicId);
    } catch {
      // No radar reachable (offline, signed out, server error) — proceed with zero topics.
      // Both the deterministic template and the grounding check tolerate an empty topic list;
      // the narrative just won't be able to name a specific topic.
    }
  }

  return getOrBuildNarrative({
    cachedNarrative: session.feedbackNarrative ?? null,
    sessionKind: "PRACTICE",
    examCode,
    answeredCount: session.totalCount,
    correctCount: session.correctCount,
    languageCode,
    sessionTopics,
    postFeedback: (context, token) => postSessionFeedback(session.id, context, token),
    persist: (narrative) => saveSessionFeedback(session.id, narrative),
  });
}

/**
 * TASK-2701 Phase 7.2 — the Mock Test twin of {@link getOrBuildSessionFeedback}. A mock
 * attempt's stored results carry `subjectName` but no `topicId` (see `db/mockTest.ts`'s
 * `MockTestResultItem`), so — unlike Practice, which is scoped to exactly one topic by
 * construction — there is no reliable way to map a mock attempt onto specific Weakness Radar
 * topics. `sessionTopics` is always empty here: the narrative is accuracy-only, never invents a
 * topic-level diagnosis it cannot ground.
 */
export async function getOrBuildMockFeedback(params: {
  attempt: MockTestAttemptRecord;
  examCode: string | null;
  languageCode: string;
}): Promise<string | null> {
  const { attempt, examCode, languageCode } = params;

  return getOrBuildNarrative({
    cachedNarrative: attempt.feedbackNarrative ?? null,
    sessionKind: "MOCK",
    examCode,
    answeredCount: attempt.totalQuestions,
    correctCount: attempt.correctCount,
    languageCode,
    sessionTopics: [],
    postFeedback: (context, token) => postMockAttemptFeedback(attempt.id, context, token),
    persist: (narrative) => saveMockAttemptFeedback(attempt.id, narrative),
  });
}

/**
 * Shared by both entry points above. See the module doc comment for why this only ever supplies
 * a `cloud` handler to `routeAiTask` — never `deterministic` — even though `SESSION_FEEDBACK`
 * declares both tiers.
 */
async function getOrBuildNarrative(params: {
  cachedNarrative: string | null;
  sessionKind: "PRACTICE" | "MOCK";
  examCode: string | null;
  answeredCount: number;
  correctCount: number;
  languageCode: string;
  sessionTopics: RadarTopic[];
  postFeedback: (context: ReturnType<typeof buildSessionContext>, token: string) => Promise<string | null>;
  persist: (narrative: string) => Promise<void>;
}): Promise<string | null> {
  const { cachedNarrative, sessionKind, examCode, answeredCount, correctCount, languageCode, sessionTopics, postFeedback, persist } =
    params;

  if (cachedNarrative) return cachedNarrative;

  const flags = await getLocalAiTaskFlags();
  if (flags.SESSION_FEEDBACK !== true) return null;

  const preferredLanguage = isAiLanguage(languageCode) ? languageCode : "en";

  const context = buildSessionContext({
    sessionKind,
    examCode,
    answeredCount,
    correctCount,
    preferredLanguage,
    sessionTopics,
  });

  const token = (await loadSession())?.token ?? null;

  const result = await routeAiTask<SessionFeedback>(
    {
      taskId: "SESSION_FEEDBACK",
      languageCode: preferredLanguage,
      context: { session: context },
      capabilities: {
        // No local model exists yet (Phase 5's benchmark ruled it out — see AI_ARCHITECTURE.md);
        // deviceTier is irrelevant here since only `cloud` is ever supplied below. `online` is
        // deliberately optimistic rather than pre-checked: a genuinely offline device just fails
        // the fetch inside the handler, which the router already catches and records as an
        // ERROR attempt — no separate connectivity check is worth adding for that.
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
            const narrative = await postFeedback(context, token);
            return narrative
              ? { status: "SERVED", value: { taskId: "SESSION_FEEDBACK", narrative } }
              : { status: "UNAVAILABLE", detail: "backend declined to generate" };
          },
        }
      : {},
  );

  if (result.status === "SERVED") {
    await persist(result.value.narrative).catch((err) => console.warn("Failed to persist session feedback", err));
    return result.value.narrative;
  }

  // Not persisted: an unreachable cloud tier should retry on the next open of this
  // session/attempt (e.g. once the device is back online), not get stuck on a stale canned
  // sentence forever.
  return sessionFeedbackTemplate(context).narrative;
}
