/**
 * The theme-invariant design tokens: spacing and corner radii.
 *
 * Colours, shadows and typography used to live here too, as plain module constants. They
 * now come from `ThemeContext` instead, because they differ between light and dark and
 * font sizes additionally depend on the zoom preference — none of which a value frozen
 * at import time can express. See `palettes.ts` for the two colour sets and
 * `ThemeContext.tsx` for how a component gets them.
 *
 * Spacing and radius stayed here deliberately. They are identical in both themes, they
 * are read by roughly every file in the app, and routing them through a hook would have
 * meant every one of those files taking a dependency on React state for two numbers that
 * cannot change. Import them directly, as before.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  "4xl": 48,
  "5xl": 64,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  /** The redesigned exam/hero cards' corner radius — bigger and softer than xl. */
  "2xl": 20,
  pill: 999,
} as const;
