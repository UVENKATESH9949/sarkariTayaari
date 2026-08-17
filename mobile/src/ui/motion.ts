import { Easing } from "react-native-reanimated";

/**
 * Shared motion tokens.
 *
 * The thing that makes an app feel considered rather than merely animated is that
 * everything moves the *same* way. One screen easing in over 400ms while another snaps
 * in 120ms reads as sloppy even when each looks fine alone — so durations and curves
 * live here rather than being picked per component.
 *
 * Bias throughout is fast and restrained. Motion should acknowledge a tap and explain
 * where a screen came from; anything a user has time to watch is too slow, because they
 * will see it hundreds of times.
 */

export const DURATION = {
  /** Press feedback. Must feel instant. */
  instant: 110,
  /** Most things: content appearing, values changing. */
  quick: 180,
  /** Entrances that travel a distance, progress bars. */
  base: 260,
  /** Reserved for a deliberate reveal, like a score. */
  emphasis: 420,
} as const;

/** Decelerating — natural for anything arriving on screen. */
export const EASE_OUT = Easing.out(Easing.cubic);

/** Symmetric — for values changing in place, like a progress bar. */
export const EASE_IN_OUT = Easing.inOut(Easing.quad);

/**
 * Press springs. Low damping would wobble, which reads as toy-like; this is tuned to
 * settle immediately while still feeling physical rather than linear.
 */
export const PRESS_SPRING = {
  damping: 18,
  stiffness: 320,
  mass: 0.6,
} as const;

/** How far a card shrinks under a finger. Subtle on purpose — 0.9 looks cartoonish. */
export const PRESS_SCALE = 0.975;

/**
 * Stagger between list items entering.
 *
 * Capped deliberately: at 45ms each, a 25-topic list would take over a second to finish
 * appearing, and the last row would feel broken. After the cap everything arrives
 * together, which nobody notices.
 */
export const STAGGER_MS = 45;
export const STAGGER_MAX_ITEMS = 8;

export function staggerDelay(index: number): number {
  return Math.min(index, STAGGER_MAX_ITEMS) * STAGGER_MS;
}
