import { isAiLanguage, type PracticeResultInsight } from "@sarkaritaiyaari/core/ai";
import { postPracticeResultInsight } from "@sarkaritaiyaari/core/api";
import { toCompactInsightPayload, type PracticeResultAnalytics } from "@sarkaritaiyaari/core/analytics";
import { loadSession } from "../db/authSession";
import { getLocalAiTaskFlags } from "../db/clientConfigLocal";
import { saveResultInsight, type SessionRecord } from "../db/practiceSessions";

/**
 * The Practice Result screen's "AI Feedback" tab. Unlike `getOrBuildSessionFeedback`, this is
 * called from exactly one place — the tab's own mount effect, i.e. only once the student has
 * explicitly tapped it open (§8/§10 of the spec: never call this on page load, never call it
 * automatically). There is no deterministic fallback tier for this task (see
 * `AI_TASKS.PRACTICE_RESULT_INSIGHT`'s own doc comment), so a disabled flag or a failed call both
 * render as an honest "unavailable" state — the Analytics tab beside it is already a complete
 * screen without this.
 */
export type PracticeResultInsightState =
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; insight: PracticeResultInsight };

export async function loadPracticeResultInsight(params: {
  session: SessionRecord;
  analytics: PracticeResultAnalytics;
  examCode: string | null;
  subjectName: string | null;
  topicName: string | null;
  levelLabel: string | null;
  languageCode: string;
}): Promise<PracticeResultInsightState> {
  const { session, analytics, examCode, subjectName, topicName, levelLabel, languageCode } = params;

  // Cached from a previous open of this same session — never regenerate. §10 of the spec.
  if (session.insightJson) {
    const cached = parseCached(session.insightJson);
    if (cached) return { status: "ready", insight: cached };
  }

  const flags = await getLocalAiTaskFlags();
  if (flags.PRACTICE_RESULT_INSIGHT !== true) {
    return { status: "disabled" };
  }

  const token = (await loadSession())?.token ?? null;
  if (!token) {
    return { status: "error" };
  }

  const preferredLanguage = isAiLanguage(languageCode) ? languageCode : "en";
  const payload = toCompactInsightPayload(analytics);

  try {
    const insight = await postPracticeResultInsight(
      session.id,
      { examCode, subjectName, topicName, levelLabel, preferredLanguage },
      payload,
      token,
    );
    if (!insight) {
      return { status: "error" };
    }
    await saveResultInsight(session.id, JSON.stringify(insight)).catch((err) =>
      console.warn("Failed to persist practice result insight", err),
    );
    return { status: "ready", insight };
  } catch (err) {
    console.warn("Failed to generate practice result insight", err);
    return { status: "error" };
  }
}

function parseCached(raw: string): PracticeResultInsight | null {
  try {
    const value = JSON.parse(raw) as PracticeResultInsight;
    if (value && value.taskId === "PRACTICE_RESULT_INSIGHT" && typeof value.summary === "string") {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}
