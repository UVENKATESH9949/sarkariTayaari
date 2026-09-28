/**
 * Default educational template's visual tokens. Lesson content stays
 * separate from styling — scenes consume this theme rather than
 * hardcoding colors/fonts (see project spec section 22).
 */
export const theme = {
  colors: {
    background: "#FFFFFF",
    surface: "#F5F7FA",
    textPrimary: "#0B1220",
    textSecondary: "#4B5768",
    accent: "#1450FF",
    accentDark: "#0A1F5C",
    success: "#1FA463",
    warning: "#C97A1A",
    border: "#E3E8EF",
  },
  font: {
    family: "Inter, Segoe UI, sans-serif",
    weightBold: 700,
    weightSemibold: 600,
    weightRegular: 400,
  },
} as const;

export type Theme = typeof theme;
