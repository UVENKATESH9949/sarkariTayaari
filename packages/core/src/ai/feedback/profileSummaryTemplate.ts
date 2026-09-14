/**
 * `PROFILE_SUMMARY`'s `DETERMINISTIC` tier — a canned-sentence template, not "nothing", the
 * exact same reasoning `sessionFeedbackTemplate.ts` documents for itself: every tier a task
 * declares must be genuinely servable (`registryViolations` in `../tasks.ts`), so this is what a
 * student sees when the flag is off, the model is unavailable, or generation fails validation.
 * `GENERATED` is strictly a phrasing upgrade over these same facts.
 *
 * Operates on the already-built `LearnerProfileContext` (post `buildLearnerProfileContext`),
 * not a raw `WeaknessRadar` — the same "pure projection over already-computed values" posture
 * `SessionContext`'s own builder takes, so this template has no ranking logic of its own.
 */

import type { LearnerProfileContext, TopicSnapshot } from "../context/types";
import type { ProfileSummary } from "../schema/types";

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

export function profileSummaryTemplate(context: LearnerProfileContext): ProfileSummary {
  const coverageLine = `You've practised ${context.topicsWithEvidence} of ${context.topicsInSyllabus} topics in this exam's syllabus.`;

  const sentences = [coverageLine];
  const weak = context.weaknesses[0];
  const strong = context.strengths[0];
  if (weak) sentences.push(topicLine(weak));
  if (strong) sentences.push(topicLine(strong));

  return { taskId: "PROFILE_SUMMARY", narrative: sentences.join(" ") };
}
