import { DURATION } from "./motion";
import { colors } from "./theme";

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
  // React Navigation's native header defaults to a light bar — without this every
  // Stack header (Practice/Mock Test's own tab header, every drill-down screen,
  // Revise/Account pushed from the root Stack) would stay light against a dark app.
  headerStyle: { backgroundColor: colors.surface },
  headerTitleStyle: { color: colors.text.primary },
  headerTintColor: colors.brand.light,
  headerShadowVisible: false,
  // Every screen's actual background otherwise falls back to the OS default (light
  // gray/white) — cards and text can be perfectly dark-themed and the page still reads
  // as broken if this isn't set, since nothing else paints the space around them.
  contentStyle: { backgroundColor: colors.bg },
} as const;
