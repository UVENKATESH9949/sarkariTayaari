/**
 * The two colour palettes. Identical shape by construction — `LightPalette` is typed as
 * the dark palette's type, so a token added to one and forgotten in the other is a
 * compile error rather than an `undefined` that renders as a transparent hole.
 *
 * Read the token names as ROLES, not as literal lightness. Two consequences that look
 * like mistakes until you know why:
 *
 *  - The `surface*` ladder runs in opposite directions in the two themes. In dark, each
 *    step up is lighter (a card lifts off the page by being brighter than it). In light,
 *    the page is a soft blue-grey and each step up is *whiter*, with `surfaceElevated2`
 *    — the chip/pill/icon-circle tint — going slightly DARKER than white instead. The
 *    role ("a nested, visually recessed fill") is preserved; the direction is not.
 *
 *  - `text.onAccent*` is white in BOTH themes and must stay that way. It is the text
 *    painted on a filled brand-blue surface, which is dark in both themes. This is
 *    exactly why `surface*` and `text.onAccent*` were kept as separate token families
 *    rather than aliases (see the note in theme.ts): collapsing them is what broke the
 *    previous light-theme attempt, and a light palette is precisely where that bug
 *    would resurface.
 *
 * `brand.bright` and `brand.light` also flip direction, for legibility rather than
 * aesthetics: on a dark ground the brand blue has to get *lighter* to be readable, and
 * on a white ground it has to get *darker*. `brand.primary` is the brand itself and is
 * the same value in both.
 */
export const darkPalette = {
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

export type Palette = {
  -readonly [K in keyof typeof darkPalette]: typeof darkPalette[K] extends string
    ? string
    : { -readonly [J in keyof typeof darkPalette[K]]: string };
};

/**
 * Contrast was the constraint here, not taste. The dark palette's `semantic` colours are
 * all deliberately bright so they read on near-black; every one of them fails against
 * white (#34D399 on #FFFFFF is 1.9:1, unreadable as text), so each has a darker
 * counterpart chosen to clear WCAG AA for body text on `surface`, while its `*Bg`
 * translucent wash stays the same idea at the same low alpha.
 *
 * `text.muted` is the one value shared verbatim with the dark palette: #64748B happens
 * to sit at 4.8:1 on white and 4.6:1 on #F2F5FA, so it clears AA on both grounds.
 */
export const lightPalette: Palette = {
  bg: "#F2F5FA",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  // Goes DARKER than white, not lighter — see the note on role vs. lightness above.
  surfaceElevated2: "#EAEFF7",
  border: "#DBE2EC",
  borderSubtle: "#E7ECF4",
  borderAccent: "rgba(37, 99, 235, 0.28)",

  text: {
    primary: "#0D1524",
    secondary: "#475569",
    muted: "#64748B",
    // White in both themes: this is the text on a filled brand-blue surface.
    onAccent: "#FFFFFF",
    onAccentSecondary: "rgba(255, 255, 255, 0.78)",
    onAccentMuted: "rgba(255, 255, 255, 0.45)",
  },

  brand: {
    primary: "#2563EB",
    primaryPressed: "#1D4ED8",
    // Darker rather than lighter than `primary`, the reverse of the dark palette.
    bright: "#1D4ED8",
    light: "#1E40AF",
    glow: "rgba(37, 99, 235, 0.18)",
    glowSoft: "rgba(37, 99, 235, 0.07)",
  },

  semantic: {
    success: "#0F855C",
    successBg: "rgba(15, 133, 92, 0.12)",
    warning: "#A16207",
    warningBg: "rgba(161, 98, 7, 0.12)",
    error: "#DC2626",
    errorBg: "rgba(220, 38, 38, 0.10)",
    hot: "#D2542F",
    hotBg: "rgba(210, 84, 47, 0.12)",
  },
};

/**
 * Depth cues have to be re-tuned per theme, not just recoloured. The dark theme leans on
 * the surface ladder and keeps shadows almost invisible; on a light ground the ladder has
 * far less room to work (white on near-white), so the shadow does more of the lifting —
 * but at a fraction of the opacity, because a 0.4-alpha black shadow that reads as subtle
 * depth on #0A0D14 reads as a dirty smudge on #F2F5FA.
 */
export type ShadowTokens = {
  card: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
};

export const darkShadow: ShadowTokens = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
};

export const lightShadow: ShadowTokens = {
  card: {
    shadowColor: "#0D1524",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
};
