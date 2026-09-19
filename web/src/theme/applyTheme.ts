import {
  darkPalette,
  lightPalette,
  darkShadow,
  lightShadow,
  spacing,
  radius,
  type Palette,
  type ShadowTokens,
} from "@sarkaritaiyaari/core/design";

export type ThemeMode = "dark" | "light";

/**
 * Turns the shared palette objects into CSS custom properties on `:root`.
 *
 * The colours themselves live in `@sarkaritaiyaari/core/design`, shared with the phone app, so
 * this file deliberately declares no colour values of its own — hand-writing a `tokens.css`
 * would immediately become a second definition free to drift. Nesting is flattened with `-`,
 * so `text.primary` becomes `--color-text-primary`.
 *
 * Mobile solves the same problem with a WeakMap-cached `useThemedStyles` hook because React
 * Native has no cascade. The web does, so a theme switch here is one attribute flip and a
 * variable rewrite rather than re-running every component's style factory.
 */

function flatten(palette: Palette): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(palette)) {
    if (typeof value === "string") {
      vars[`--color-${kebab(key)}`] = value;
    } else {
      for (const [inner, innerValue] of Object.entries(value)) {
        vars[`--color-${kebab(key)}-${kebab(inner)}`] = innerValue;
      }
    }
  }
  return vars;
}

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

const SCALE_VARS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(spacing).map(([k, v]) => [`--space-${k}`, `${v}px`])),
  ...Object.fromEntries(Object.entries(radius).map(([k, v]) => [`--radius-${k}`, `${v}px`])),
};

/**
 * Converts mobile's React Native shadow shape (shadowColor/shadowOffset/shadowOpacity/
 * shadowRadius) into a CSS box-shadow string, so web gets the same elevation the phone app
 * does rather than a flat, un-shadowed card — the two platforms describe the same physical
 * idea in different vocabularies, and this is the one place that translates it.
 */
function toBoxShadow({ shadowColor, shadowOffset, shadowOpacity, shadowRadius }: ShadowTokens["card"]): string {
  const [r, g, b] = hexToRgb(shadowColor);
  return `${shadowOffset.width}px ${shadowOffset.height}px ${shadowRadius}px rgba(${r}, ${g}, ${b}, ${shadowOpacity})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Six identity colors for `identitySlot()` (see `components/identityColor.ts`) — brighter
 * foregrounds on the dark theme, darker ones on light, the same contrast strategy the
 * shared `semantic` palette already uses for success/warning/error/hot.
 */
const IDENTITY_LIGHT: { fg: string; bg: string }[] = [
  { fg: "#2563EB", bg: "rgba(37, 99, 235, 0.12)" },
  { fg: "#7C3AED", bg: "rgba(124, 58, 237, 0.12)" },
  { fg: "#0D9488", bg: "rgba(13, 148, 136, 0.12)" },
  { fg: "#B45309", bg: "rgba(180, 83, 9, 0.14)" },
  { fg: "#BE123C", bg: "rgba(190, 18, 60, 0.12)" },
  { fg: "#4338CA", bg: "rgba(67, 56, 202, 0.12)" },
];
/** Exported (unlike its light sibling above) because Home's spotlight cards are always
 *  dark, regardless of site theme — the same "fixed regardless of theme" exception the
 *  mobile design system already makes for hero/gradient cards — so they need these real
 *  hex values for a glow effect, not the theme-reactive `--identity-N-fg` CSS vars. */
export const IDENTITY_DARK: { fg: string; bg: string }[] = [
  { fg: "#60A5FA", bg: "rgba(96, 165, 250, 0.16)" },
  { fg: "#A78BFA", bg: "rgba(167, 139, 250, 0.16)" },
  { fg: "#2DD4BF", bg: "rgba(45, 212, 191, 0.16)" },
  { fg: "#FBBF24", bg: "rgba(251, 191, 36, 0.16)" },
  { fg: "#FB7185", bg: "rgba(251, 113, 133, 0.16)" },
  { fg: "#818CF8", bg: "rgba(129, 140, 248, 0.16)" },
];

/** Matches mobile's zoom ladder so a student who scales text on one platform gets the same steps on the other. */
export const ZOOM_STEPS = [0.9, 1, 1.1, 1.2, 1.3] as const;

export type Appearance = { mode: ThemeMode; zoom: number };

/** Dark (black + blue) is the default — matches the mobile app's own default and premium
 *  visual identity; light is the opt-in toggle, not the other way around. */
export const DEFAULT_APPEARANCE: Appearance = { mode: "dark", zoom: 1 };

const STORAGE_KEY = "st_web_appearance";

/**
 * localStorage throws outright in some privacy modes rather than returning null, and a corrupt
 * value is as likely as a missing one — so every failure path falls back to the default
 * instead of crashing the app over a cosmetic preference.
 */
export function readStoredAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    const zoom = ZOOM_STEPS.find((step) => step === parsed.zoom) ?? DEFAULT_APPEARANCE.zoom;
    return {
      mode: parsed.mode === "dark" || parsed.mode === "light" ? parsed.mode : DEFAULT_APPEARANCE.mode,
      zoom,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function writeStoredAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // A preference that cannot be saved is not worth failing the app over.
  }
}

/**
 * Applies a theme synchronously. Called from `main.tsx` *before* React renders, so the first
 * paint is already correct — there is no flash of the wrong background to design around.
 */
export function applyTheme(mode: ThemeMode, zoom = 1): void {
  const root = document.documentElement;
  const palette = mode === "dark" ? darkPalette : lightPalette;
  const shadow = mode === "dark" ? darkShadow : lightShadow;

  for (const [name, value] of Object.entries(flatten(palette as Palette))) {
    root.style.setProperty(name, value);
  }
  for (const [name, value] of Object.entries(SCALE_VARS)) {
    root.style.setProperty(name, value);
  }
  root.style.setProperty("--shadow-card", toBoxShadow(shadow.card));

  const identity = mode === "dark" ? IDENTITY_DARK : IDENTITY_LIGHT;
  identity.forEach(({ fg, bg }, i) => {
    root.style.setProperty(`--identity-${i}-fg`, fg);
    root.style.setProperty(`--identity-${i}-bg`, bg);
  });

  // Text-only scaling, exactly as mobile does it: the zoom multiplies the root font size, and
  // every type size is declared in rem, so boxes and spacing stay put while text grows.
  root.style.setProperty("--font-scale", String(zoom));
  root.dataset.theme = mode;
  root.style.colorScheme = mode;

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", palette.bg);
}
