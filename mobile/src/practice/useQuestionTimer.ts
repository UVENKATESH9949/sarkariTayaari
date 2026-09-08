import { useCallback, useEffect, useRef } from "react";

/**
 * Accumulates how long each question was on screen, for the per-question `timeMs` field
 * added by V24 (Weakness Radar — see `tasks/TASK-2201-weakness-radar.md`).
 *
 * **Nothing consumes this yet, and that is the point.** The supplied spec's §9 wants a speed
 * signal computed as actual-versus-expected time, but this app has never recorded a
 * per-question time and there is no expected-time benchmark anywhere in the schema to compare
 * one against. §9.2 is explicit that a missing signal must not become fake data, so speed is
 * excluded from the v1 health formula entirely. Capture starts now because without it a later
 * version would have no history to derive an empirical benchmark from — and would need the
 * same migration anyway.
 *
 * Measures *display* time, accumulated across visits: both the quiz and the mock test let a
 * student move back and forth between questions, so "time on question 4" is the total of every
 * period question 4 was the one on screen, not the gap between two answers.
 *
 * ## Two honest limitations, recorded rather than papered over
 *
 * 1. **Time with the app backgrounded is included.** A student who takes a phone call mid-
 *    question has that time counted. Rather than add AppState plumbing for a signal nothing
 *    reads yet, each question's total is capped at {@link MAX_QUESTION_MS} — so a backgrounded
 *    app records five minutes, not five hours, and a future benchmark built on medians is
 *    unaffected by the remainder.
 * 2. **Reading and thinking are not separable** from answering. That is inherent to measuring
 *    display time and is fine for a relative "slower than usual for this topic" signal, which
 *    is what §9 actually asks for.
 */

/** Per-question ceiling. See limitation 1 above. */
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
   * question when the student navigates away from it or the screen unmounts — but a session
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
   * Clears `activeRef` as it goes, so the effect cleanup and an explicit `commitCurrent`
   * cannot both count the same period — which is exactly what would happen at the end of a
   * session, where the screen finishes and then unmounts.
   */
  const bank = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    activeRef.current = null;
    const map = accumulated.current;
    const total = (map.get(active.id) ?? 0) + (Date.now() - active.enteredAt);
    map.set(active.id, Math.min(total, MAX_QUESTION_MS));
  }, []);

  /*
   * Refs only, no state — so this cannot trip react-hooks/set-state-in-effect, the rule this
   * codebase has now hit four times. Entering a question records when; leaving it (a
   * navigation, or unmount) banks the period.
   */
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
