/**
 * Mobile's design-token entry point.
 *
 * The tokens themselves live in `@sarkaritaiyaari/core/design` as of TASK-2601 Phase 0, so
 * that the web app renders from the same spacing scale, radii and palettes rather than a
 * drifting second copy. This file stays because roughly fifty screens and components already
 * import `ui/theme`, and because it is the right place to add a genuinely mobile-only token
 * if one is ever needed — the shared package must stay platform-independent.
 *
 * Why spacing and radius are plain constants while colours come from `ThemeContext`: these
 * two are identical in both themes and cannot change at runtime, so routing them through a
 * hook would make every consumer take a React-state dependency for two frozen numbers. See
 * `palettes.ts` for the colour sets and `ThemeContext.tsx` for how a component gets them.
 */
export { spacing, radius } from "@sarkaritaiyaari/core/design";
