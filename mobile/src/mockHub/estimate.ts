import type { MockFormat } from "./types";

// Same pacing assumption the backend's WorkloadEstimator.DEFAULT_SECONDS_PER_QUESTION uses
// for its own DEFAULT tier — one stated "how long does a question take" number for the whole
// app, not a second invented one just for ad-hoc mocks. Kept in sync by comment, not a shared
// constant, since the two live in different languages.
const DEFAULT_SECONDS_PER_QUESTION = 75;
const SPEED_MULTIPLIER = 0.6;

/** How long an ad-hoc mock of `questionCount` questions should run, in minutes. */
export function estimateAdHocMinutes(format: MockFormat, questionCount: number): number {
  const seconds = questionCount * DEFAULT_SECONDS_PER_QUESTION * (format === "speed" ? SPEED_MULTIPLIER : 1);
  return Math.max(1, Math.round(seconds / 60));
}

/** Marking scheme for an ad-hoc mock when the exam has no official Full-Length paper to borrow one from. */
export const DEFAULT_MARKS_CORRECT = 1;
export const DEFAULT_MARKS_WRONG = 0.25;
