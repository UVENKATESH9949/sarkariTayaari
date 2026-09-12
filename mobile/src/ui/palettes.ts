/**
 * Mobile's colour-token entry point — see the note in `theme.ts`.
 *
 * The two palettes and their shadow sets live in `@sarkaritaiyaari/core/design` so mobile and
 * web share one definition of the brand's colours. `ThemeContext.tsx` is what selects between
 * them and hands the result to components.
 */
export {
  darkPalette,
  lightPalette,
  darkShadow,
  lightShadow,
} from "@sarkaritaiyaari/core/design";
export type { Palette, ShadowTokens } from "@sarkaritaiyaari/core/design";
