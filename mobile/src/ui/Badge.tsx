import { StyleSheet, Text, View } from "react-native";
import { radius, spacing } from "./theme";
import { useTheme, useThemedStyles, type Theme } from "./ThemeContext";

type BadgeVariant = "hot" | "success";

type BadgeProps = {
  label: string;
  /** "hot" = trending/urgent (orange). "success" = popular/new/best (green) — default. */
  variant?: BadgeVariant;
  /** Admin-set colours from the synced exam_badges row. Each falls back to the variant's
   * tone when the admin left it blank, so a badge is always readable. */
  color?: string | null;
  backgroundColor?: string | null;
};

// A function of the palette rather than a module constant: both variants are semantic
// colours, and the dark palette's are unreadable on a light ground (see palettes.ts).
function variantTone(variant: BadgeVariant, colors: Theme["colors"]) {
  return variant === "hot"
    ? { color: colors.semantic.hot, bg: colors.semantic.hotBg }
    : { color: colors.semantic.success, bg: colors.semantic.successBg };
}

/** Small pill-shaped label — "TRENDING" / "POPULAR" / "BEST 142/200" style tags on exam cards. */
export function Badge({ label, variant = "success", color, backgroundColor }: BadgeProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const tone = variantTone(variant, colors);
  return (
    <View style={[styles.badge, { backgroundColor: backgroundColor || tone.bg }]}>
      <Text style={[styles.text, { color: color || tone.color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const buildStyles = (_theme: Theme) =>
  StyleSheet.create({
    badge: {
      paddingHorizontal: spacing.sm + 1,
      paddingVertical: 2,
      borderRadius: radius.pill,
    },
    text: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.4,
    },
  });
