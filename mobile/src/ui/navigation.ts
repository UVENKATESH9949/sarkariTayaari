import { DURATION } from "./motion";

/**
 * Shared stack transition options.
 *
 * Drilling Exam → Subject → Topic → Level → Quiz is the spine of the app, and a
 * horizontal push is what makes that hierarchy legible: forward moves in from the right,
 * back slides away to the right. Without it every screen simply replaces the last and the
 * user loses their sense of depth.
 *
 * Android's platform default here is a vertical fade, which reads as "unrelated screen"
 * rather than "one level deeper" — so this is set explicitly rather than left to the OS.
 */
export const STACK_SCREEN_OPTIONS = {
  animation: "slide_from_right",
  // Faster than the platform default. These transitions are crossed dozens of times in a
  // study session, and anything leisurely becomes an irritation rather than a delight.
  animationDuration: DURATION.base,
} as const;
