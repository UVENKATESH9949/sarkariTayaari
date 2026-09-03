import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";
import {
  DEFAULT_PREFERENCES,
  ZOOM_STEPS,
  loadPreferences,
  savePreferences,
  type ThemeMode,
} from "../db/preferences";
import { darkPalette, darkShadow, lightPalette, lightShadow, type Palette, type ShadowTokens } from "./palettes";
import { radius, spacing } from "./theme";

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

export type Theme = {
  mode: ThemeMode;
  colors: Palette;
  shadow: ShadowTokens;
  typography: ReturnType<typeof buildTypography>;
  spacing: typeof spacing;
  radius: typeof radius;
  /** Content scale multiplier. 1 = 100%. */
  zoom: number;
  /** Scales a font size the same way the style factory does — for the rare inline case. */
  scaleFont: (size: number) => number;
};

/**
 * Typography carries a colour, so it cannot be a module constant any more. Everything
 * else about it is unchanged from the original tokens.
 *
 * Font sizes here are the UNSCALED values: zoom is applied once, centrally, in
 * `useThemedStyles` — see the note there for why it is done at that layer rather than
 * multiplied in at every declaration site.
 */
function buildTypography(colors: Palette) {
  return {
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
}

type ThemeContextValue = Theme & {
  setThemeMode: (mode: ThemeMode) => void;
  /** Steps up or down the ZOOM_STEPS ladder; a no-op at either end. */
  stepZoom: (direction: 1 | -1) => void;
  resetZoom: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
};

function buildTheme(mode: ThemeMode, zoom: number): Theme {
  const colors = mode === "light" ? lightPalette : darkPalette;
  return {
    mode,
    colors,
    shadow: mode === "light" ? lightShadow : darkShadow,
    typography: buildTypography(colors),
    spacing,
    radius,
    zoom,
    scaleFont: (size: number) => scale(size, zoom),
  };
}

const DEFAULT_THEME = buildTheme(DEFAULT_PREFERENCES.themeMode, DEFAULT_PREFERENCES.zoomLevel);

const ThemeContext = createContext<ThemeContextValue>({
  ...DEFAULT_THEME,
  setThemeMode: () => {},
  stepZoom: () => {},
  resetZoom: () => {},
  canZoomIn: true,
  canZoomOut: true,
});

export function useTheme() {
  return useContext(ThemeContext);
}

function scale(value: number, zoom: number): number {
  // One decimal place: React Native accepts fractional sizes, and rounding to whole
  // pixels would make the 0.9 and 1.1 steps collapse onto the base size for small text
  // (12 * 1.1 = 13.2 -> 13, but 12 * 0.9 = 10.8 -> 11), which reads as the control
  // doing nothing.
  return Math.round(value * zoom * 10) / 10;
}

/**
 * Applies the zoom to a finished style sheet, one level deep.
 *
 * Doing it here rather than at each declaration is the whole design. There are 174
 * `fontSize` and 26 `lineHeight` declarations across 43 files; multiplying by a scale
 * factor at each one would be 200 opportunities to miss one, and every future style
 * added by anyone would have to remember to do it. Applied here it is impossible to
 * forget, because it happens to every style the factory returns.
 *
 * Only `fontSize` and `lineHeight` are touched. Box dimensions are deliberately NOT
 * scaled, which is why this cannot break a layout the way a global transform would:
 * text grows inside containers that mostly have no fixed height, so rows get taller
 * rather than clipped. Vector icons keep their size for the same reason — they sit in
 * fixed-size circles, and growing the glyph without the circle looks broken.
 *
 * A style whose value is a nested object (`shadowOffset`, `transform`) is passed through
 * untouched; there are no font properties below the first level.
 */
function applyZoom<T extends NamedStyles>(styles: T, zoom: number): T {
  if (zoom === 1) return styles;
  const out: Record<string, ViewStyle | TextStyle | ImageStyle> = {};
  for (const key of Object.keys(styles)) {
    const style = styles[key] as Record<string, unknown> | undefined;
    if (!style || typeof style !== "object") {
      out[key] = styles[key];
      continue;
    }
    const next: Record<string, unknown> = { ...style };
    if (typeof next.fontSize === "number") next.fontSize = scale(next.fontSize, zoom);
    if (typeof next.lineHeight === "number") next.lineHeight = scale(next.lineHeight, zoom);
    out[key] = next as ViewStyle;
  }
  return out as T;
}

/**
 * Per-factory, per-theme style cache.
 *
 * `StyleSheet.create` used to run once per file at import time. Without a cache it would
 * now run on every render of every component, which is the one way this refactor could
 * plausibly cost real performance. Keyed by the factory function's identity (a
 * module-level `const`, so stable for the process) in a WeakMap, then by theme, so a
 * factory whose module is unloaded does not pin its styles alive.
 */
const styleCache = new WeakMap<object, Map<string, NamedStyles>>();

export function useThemedStyles<T extends NamedStyles>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  const cacheKey = `${theme.mode}:${theme.zoom}`;
  let perFactory = styleCache.get(factory);
  if (!perFactory) {
    perFactory = new Map();
    styleCache.set(factory, perFactory);
  }
  const cached = perFactory.get(cacheKey);
  if (cached) return cached as T;
  const built = applyZoom(StyleSheet.create(factory(theme)), theme.zoom);
  perFactory.set(cacheKey, built);
  return built;
}

/**
 * Preferences live in SQLite, so the first render cannot know them. Rather than flash the
 * default theme and then swap — which for a user who chose light mode is a black screen
 * for a frame on every launch — the provider renders nothing until the read completes. It
 * is a single primary-key read of one row from a database the app has already opened, and
 * it happens behind the migration gate in app/_layout.tsx, which is already showing a
 * screen of its own.
 *
 * `ready` is a separate flag rather than inferring readiness from the values, because a
 * user whose chosen theme genuinely IS dark must be indistinguishable from one who has
 * never chosen.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_PREFERENCES.themeMode);
  const [zoom, setZoom] = useState<number>(DEFAULT_PREFERENCES.zoomLevel);
  const [ready, setReady] = useState(false);
  // Set the moment the user changes anything, so a slow initial read cannot land
  // afterwards and overwrite their choice with what was on disk beforehand.
  const dirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadPreferences().then((prefs) => {
      if (cancelled) return;
      if (!dirtyRef.current) {
        setMode(prefs.themeMode);
        setZoom(prefs.zoomLevel);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: number) => {
    // Fire-and-forget, matching how the rest of the app writes local state: the UI has
    // already changed, and a failed write costs the preference not surviving a restart,
    // not the control appearing broken.
    savePreferences({ zoomLevel: next }).catch((err) => console.warn("Failed to save zoom", err));
  }, []);

  const setThemeMode = useCallback((next: ThemeMode) => {
    dirtyRef.current = true;
    setMode(next);
    savePreferences({ themeMode: next }).catch((err) => console.warn("Failed to save theme", err));
  }, []);

  const stepZoom = useCallback(
    (direction: 1 | -1) => {
      dirtyRef.current = true;
      setZoom((current) => {
        const index = ZOOM_STEPS.indexOf(current as (typeof ZOOM_STEPS)[number]);
        const target = index + direction;
        if (index === -1 || target < 0 || target >= ZOOM_STEPS.length) return current;
        const next = ZOOM_STEPS[target];
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetZoom = useCallback(() => {
    dirtyRef.current = true;
    setZoom(DEFAULT_PREFERENCES.zoomLevel);
    persist(DEFAULT_PREFERENCES.zoomLevel);
  }, [persist]);

  const value = useMemo<ThemeContextValue>(() => {
    const zoomIndex = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);
    return {
      ...buildTheme(mode, zoom),
      setThemeMode,
      stepZoom,
      resetZoom,
      canZoomIn: zoomIndex < ZOOM_STEPS.length - 1,
      canZoomOut: zoomIndex > 0,
    };
  }, [mode, zoom, setThemeMode, stepZoom, resetZoom]);

  if (!ready) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
