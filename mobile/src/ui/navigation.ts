import { DURATION } from "./motion";
import type { Palette } from "./palettes";

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
/**
 * Was a module constant; now a function of the palette, because the native header and the
 * scene background are the two things that make a light/dark switch look either complete
 * or half-finished. Every Stack in the app calls this with the live palette.
 */
export const stackScreenOptions = (colors: Palette) =>
  ({
    animation: "slide_from_right",
    // Faster than the platform default. These transitions are crossed dozens of times in a
    // study session, and anything leisurely becomes an irritation rather than a delight.
    animationDuration: DURATION.base,
    // The native header has its own platform default and does not follow the app's
    // palette on its own — without these three lines every Stack header (Practice/Mock
    // Test's own tab header, every drill-down screen, Revise/Account/Settings pushed from
    // the root Stack) keeps that default and disagrees with the theme.
    headerStyle: { backgroundColor: colors.surface },
    headerTitleStyle: { color: colors.text.primary },
    headerTintColor: colors.brand.light,
    headerShadowVisible: false,
    // Every screen's actual background otherwise falls back to the OS default — cards
    // and text can be perfectly themed and the page still reads as broken if this isn't
    // set, since nothing else paints the space around them.
    contentStyle: { backgroundColor: colors.bg },
  }) as const;
