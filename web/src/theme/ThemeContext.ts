import { createContext, useContext } from "react";
import { DEFAULT_APPEARANCE, type Appearance, type ThemeMode } from "./applyTheme";

/**
 * Kept apart from ThemeProvider.tsx on purpose: a file that exports both a component and a
 * hook breaks React Fast Refresh, which over a multi-phase build costs more than the extra
 * file. `admin/` keeps its provider and hook together and carries that warning as its
 * documented lint baseline; this app starts at zero instead.
 */

export type ThemeContextValue = Appearance & {
  setMode: (mode: ThemeMode) => void;
  setZoom: (zoom: number) => void;
};

export const ThemeContext = createContext<ThemeContextValue>({
  ...DEFAULT_APPEARANCE,
  setMode: () => {},
  setZoom: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}
