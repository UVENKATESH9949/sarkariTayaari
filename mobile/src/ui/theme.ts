import type { TextStyle } from "react-native";

/**
 * Design tokens for the app — black + premium-blue dark theme.
 *
 * Plain exported objects, not a ThemeProvider — matches this codebase's
 * existing pattern (motion.ts, navigation.ts). The app is dark-only by
 * design (no light-mode requirement), so there's no theme-switching logic.
 *
 * `surface*` and `text.onAccent*` are deliberately separate token families,
 * not two names for the same value: a card's dark background and the white
 * text painted on top of a filled blue card are different roles that must
 * be able to diverge. Collapsing them back into one token (as `neutral[0]`
 * did in the previous light-theme pass) is exactly the bug this avoids —
 * see the dark-theme migration plan for the full incident this token
 * structure was designed to prevent.
 */
/**
 * The surface ladder is the primary depth mechanism (see `shadow` below for why it isn't
 * shadows): each step up is a visibly lighter, slightly blue-shifted neutral, so a card
 * reads as lifted off the page purely from its own fill. Values match the redesign
 * reference's dark layered system — cards were previously near-black (#0D1117 on
 * #05070A), which is what made every screen read as flat and "dull".
 */
export const colors = {
  bg: "#0A0D14",
  surface: "#0F131C",
  surfaceElevated: "#12161F",
  surfaceElevated2: "#181D28",
  border: "#1F2530",
  /** Inner borders on nested surfaces (stat pills, chips) — one step lighter than `border`. */
  borderSubtle: "#232938",
  borderAccent: "rgba(59, 130, 246, 0.22)",

  text: {
    primary: "#F3F6FC",
    secondary: "#9AA7BD",
    muted: "#64748B",
    /** White/light text or icon color painted on a filled/dark-accent surface. Never darken this. */
    onAccent: "#FFFFFF",
    onAccentSecondary: "rgba(255, 255, 255, 0.75)",
    onAccentMuted: "rgba(255, 255, 255, 0.4)",
  },

  brand: {
    primary: "#2563EB",
    primaryPressed: "#1D4ED8",
    bright: "#3B82F6",
    light: "#60A5FA",
    glow: "rgba(37, 99, 235, 0.35)",
    glowSoft: "rgba(37, 99, 235, 0.14)",
  },

  semantic: {
    success: "#34D399",
    successBg: "rgba(52, 211, 153, 0.12)",
    warning: "#E8A63C",
    warningBg: "rgba(232, 166, 60, 0.12)",
    error: "#F87171",
    errorBg: "rgba(248, 113, 113, 0.12)",
    /** "Trending"-style badges only — everything else (new/popular/best) reuses success. */
    hot: "#FF8A65",
    hotBg: "rgba(255, 138, 101, 0.14)",
  },
} as const;

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

/**
 * Kept deliberately restrained. Depth in this design comes from the surface-shade
 * ladder (bg -> surfaceElevated -> surfaceElevated2), borders and gradients — not from
 * shadows. Android renders only `elevation`, and a large elevation under a rounded card
 * paints an opaque banded rectangle that reads as a rendering bug rather than depth.
 */
export const shadow = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;

export const typography = {
  pageTitle: { fontSize: 26, fontWeight: "700", lineHeight: 32, color: colors.text.primary },
  sectionTitle: { fontSize: 15, fontWeight: "700", lineHeight: 20, color: colors.text.primary },
  cardTitle: { fontSize: 15, fontWeight: "600", lineHeight: 20, color: colors.text.primary },
  body: { fontSize: 14, fontWeight: "400", lineHeight: 20, color: colors.text.primary },
  secondary: { fontSize: 13, fontWeight: "400", lineHeight: 18, color: colors.text.secondary },
  caption: { fontSize: 12, fontWeight: "400", lineHeight: 16, color: colors.text.muted },
  label: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 16,
    color: colors.text.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
} satisfies Record<string, TextStyle>;
