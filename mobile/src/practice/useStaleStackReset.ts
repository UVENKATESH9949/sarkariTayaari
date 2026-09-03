import { useEffect, useRef } from "react";
import { router, useIsFocused } from "expo-router";

/**
 * How long a module has to be unvisited before returning to it collapses its navigation
 * stack back to the module's own home screen. Doc 2 §5 asks for 1-2 minutes.
 */
const IDLE_RESET_MS = 90_000;

/**
 * When each module was last left. Module scope rather than React state on purpose: there
 * is exactly one Practice layout and one Mock Test layout for the life of the process, and
 * a timestamp that nothing renders from has no business causing a re-render.
 */
const lastBlurredAt = new Map<string, number>();

/**
 * Collapses a module's navigation stack when the user comes back to it after a long
 * absence, so Practice does not reopen four screens deep from a session an hour ago.
 *
 * ## What this deliberately does NOT do
 *
 * Doc 2 §5 asks for state inactive for 1-2 minutes to become "eligible for cleanup", and
 * lists "active practice session" and "temporary question state" among what may be
 * cleared. Those two are not treated the same here, because in this app they are not the
 * same kind of thing:
 *
 *  - Navigation depth is genuinely temporary screen state. Resetting it costs the user
 *    three taps and is what §4 is asking for.
 *  - A practice session's answers are the user's UNSAVED WORK. Nothing is written until
 *    the session is finished (see quiz.tsx), so discarding an in-progress session after 90
 *    seconds would silently destroy the work of anyone who took a phone call mid-quiz.
 *
 * So `sessionActive` suppresses the reset entirely. That satisfies both halves of §5's own
 * persistent-vs-temporary split — and its acceptance criterion that cleanup must not
 * delete real progress — rather than the letter of one half at the expense of the other.
 *
 * ## Why the reset happens on RE-ENTRY rather than on a timer
 *
 * A timer firing while the module is off-screen would have to navigate a navigator that
 * is not focused. `router.dismissAll()` resolves against whichever stack currently has
 * focus, so calling it from a background timer would pop whatever the user happens to be
 * looking at instead. Doing it at the moment focus returns means the module's own stack is
 * the focused one, which is the single condition under which that call is well defined —
 * the same constraint documented in quiz.tsx's abandon path.
 *
 * The visible result is identical either way: the user opens Practice and sees Practice.
 */
export function useStaleStackReset(moduleKey: string, sessionActive: boolean) {
  const isFocused = useIsFocused();
  const wasFocusedRef = useRef(isFocused);

  useEffect(() => {
    const wasFocused = wasFocusedRef.current;
    wasFocusedRef.current = isFocused;

    if (wasFocused && !isFocused) {
      lastBlurredAt.set(moduleKey, Date.now());
      return;
    }

    if (!wasFocused && isFocused) {
      const blurredAt = lastBlurredAt.get(moduleKey);
      lastBlurredAt.delete(moduleKey);
      if (blurredAt === undefined) return;
      if (Date.now() - blurredAt < IDLE_RESET_MS) return;
      if (sessionActive) return;
      // canDismiss() is false at the module's root, where there is nothing to collapse.
      if (router.canDismiss()) router.dismissAll();
    }
  }, [isFocused, moduleKey, sessionActive]);
}
