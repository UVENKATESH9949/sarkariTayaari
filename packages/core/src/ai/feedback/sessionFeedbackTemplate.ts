/**
 * `SESSION_FEEDBACK`'s `DETERMINISTIC` tier — a canned-sentence template, not "nothing". Every
 * tier a task declares must be genuinely servable (`registryViolations` in `../tasks.ts`), so
 * this is what a student sees when the flag is off, the model is unavailable, or generation
 * fails validation. `GENERATED` is strictly a phrasing upgrade over these same facts.
 *
 * Tone mirrors `mobile/src/intelligence/localRadar.ts`'s `explain()` deliberately — the topic
 * needs attention, the student is not deficient — so a student never notices which tier
 * actually answered.
 */

import type { SessionContext, TopicSnapshot } from "../context/types";
import type { SessionFeedback } from "../schema/types";

function topicLine(topic: TopicSnapshot): string {
  switch (topic.state) {
    case "NEEDS_REVISION":
      return `${topic.topicName} used to be one of your stronger topics and has slipped recently.`;
    case "NEEDS_ATTENTION":
      return `${topic.topicName} needs more attention right now.`;
    case "IMPROVING":
      return `${topic.topicName} is improving clearly.`;
    case "STRONG":
      return `${topic.topicName} is one of your reliable topics.`;
    default:
      return `${topic.topicName} is still coming along.`;
  }
}

const WEAK_STATES = new Set<TopicSnapshot["state"]>(["NEEDS_ATTENTION", "NEEDS_REVISION"]);
const STRONG_STATES = new Set<TopicSnapshot["state"]>(["STRONG", "IMPROVING"]);

export function sessionFeedbackTemplate(context: SessionContext): SessionFeedback {
  const scoreLine = `You answered ${context.correctCount} of ${context.answeredCount} correctly (${context.accuracyPercent}%).`;

  const weak = context.topics.find((t) => WEAK_STATES.has(t.state));
  const strong = context.topics.find(
    (t) => STRONG_STATES.has(t.state) && t.topicId !== weak?.topicId,
  );

  const sentences = [scoreLine];
  if (weak) sentences.push(topicLine(weak));
  if (strong) sentences.push(topicLine(strong));

  return { taskId: "SESSION_FEEDBACK", narrative: sentences.join(" ") };
}
