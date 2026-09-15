import { useCallback, useMemo, useState, type ReactNode } from "react";
import { applyTheme, readStoredAppearance, writeStoredAppearance, type Appearance } from "./applyTheme";
import { ThemeContext, type ThemeContextValue } from "./ThemeContext";

/**
 * Theme and text-zoom state.
 *
 * Mobile persists the same two preferences to a SQLite `app_preferences` row; web uses
 * localStorage, because these are per-device conveniences that never need to reach the server.
 * Both read their colours from the same shared palette, so the platforms cannot drift.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(readStoredAppearance);

  const persist = useCallback((next: Appearance) => {
    setAppearance(next);
    applyTheme(next.mode, next.zoom);
    writeStoredAppearance(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...appearance,
      setMode: (mode) => persist({ ...appearance, mode }),
      setZoom: (zoom) => persist({ ...appearance, zoom }),
    }),
    [appearance, persist],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
