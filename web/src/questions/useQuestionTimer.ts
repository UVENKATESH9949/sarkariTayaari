import { useCallback, useEffect, useRef } from "react";

/**
 * Accumulates how long each question was on screen, for the per-question `timeMs` field
 * (`V24`, extended by TASK-2801 Phase 1).
 *
 * ## Why this exists on web at all
 *
 * Mobile has captured this since the Weakness Radar work; `web/` never did, so **every answer
 * given in a browser was permanently unmeasured**. That is not a cosmetic gap: average question
 * time per topic is an input to the workload estimation Phase 4 of the personalization program
 * needs, and a student who practises mainly on the web would contribute none of it.
 *
 * ## Deliberately a mirror of `mobile/src/practice/useQuestionTimer.ts`
 *
 * Same semantics, same cap, same null rule — so a minute measured in a browser means the same
 * thing as a minute measured on a phone, and the two can be averaged together honestly. The two
 * files are separate because this is a React-DOM hook and that one is a React-Native hook;
 * `packages/core` is platform-pure and deliberately holds no React.
 *
 * Measures *display* time, accumulated across visits: both the quiz and the mock test let a
 * student move back and forth between questions, so "time on question 4" is the total of every
 * period question 4 was the one on screen, not the gap between two answers.
 *
 * ## The same two honest limitations mobile records, plus one that is web-specific
 *
 * 1. **Time with the tab in the background is included.** A student who switches tabs
 *    mid-question has that time counted. Rather than add `visibilitychange` plumbing for a
 *    signal nothing consumes yet, each question's total is capped at {@link MAX_QUESTION_MS} —
 *    so a backgrounded tab records five minutes, not five hours, and a future benchmark built on
 *    medians is unaffected by the remainder.
 * 2. **Reading and thinking are not separable** from answering. Inherent to measuring display
 *    time, and fine for a relative "slower than usual for this topic" signal.
 * 3. **A closed tab loses the in-flight period.** Unlike mobile, there is no unmount guarantee
 *    when a browser tab is closed outright — but a session that is never finished is never
 *    uploaded either, so nothing partial reaches the server.
 */

/** Per-question ceiling. See limitation 1. Mirrors mobile's constant of the same name. */
export const MAX_QUESTION_MS = 5 * 60 * 1000;

export type QuestionTimer = {
  /**
   * Milliseconds recorded for one question, or null if none were.
   *
   * Null rather than 0 deliberately: the server column is nullable and every reader treats
   * absence as "unknown". A zero would claim the student answered instantly.
   */
  timeMsFor: (questionId: string) => number | null;
  /**
   * Banks the question currently on screen.
   *
   * Must be called before reading times at the end of a session. The effect below banks a
   * question when the student navigates away from it or the component unmounts — but a session
   * finishes while its last question is still showing, and unmount happens after the results
   * have already been built.
   */
  commitCurrent: () => void;
};

/**
 * @param currentQuestionId the question on screen right now, or null while loading
 */
export function useQuestionTimer(currentQuestionId: string | null): QuestionTimer {
  const accumulated = useRef<Map<string, number>>(new Map());
  /** The question on screen and when it appeared. Null once its period has been banked. */
  const activeRef = useRef<{ id: string; enteredAt: number } | null>(null);

  /**
   * Adds the in-flight period to its question's running total.
   *
   * Clears `activeRef` as it goes, so the effect cleanup and an explicit `commitCurrent` cannot
   * both count the same period — which is exactly what would happen at the end of a session,
   * where the screen finishes and then unmounts.
   */
  const bank = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    activeRef.current = null;
    const map = accumulated.current;
    const total = (map.get(active.id) ?? 0) + (Date.now() - active.enteredAt);
    map.set(active.id, Math.min(total, MAX_QUESTION_MS));
  }, []);

  // Refs only, no state — entering a question records when; leaving it (a navigation, or
  // unmount) banks the period.
  useEffect(() => {
    if (currentQuestionId === null) return;
    activeRef.current = { id: currentQuestionId, enteredAt: Date.now() };
    return bank;
  }, [currentQuestionId, bank]);

  const timeMsFor = useCallback((questionId: string) => {
    const value = accumulated.current.get(questionId);
    return value === undefined ? null : value;
  }, []);

  return { timeMsFor, commitCurrent: bank };
}
