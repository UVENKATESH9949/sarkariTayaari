import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "./theme";

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

const VARIANT_STYLE: Record<BadgeVariant, { color: string; bg: string }> = {
  hot: { color: colors.semantic.hot, bg: colors.semantic.hotBg },
  success: { color: colors.semantic.success, bg: colors.semantic.successBg },
};

/** Small pill-shaped label — "TRENDING" / "POPULAR" / "BEST 142/200" style tags on exam cards. */
export function Badge({ label, variant = "success", color, backgroundColor }: BadgeProps) {
  const tone = VARIANT_STYLE[variant];
  return (
    <View style={[styles.badge, { backgroundColor: backgroundColor || tone.bg }]}>
      <Text style={[styles.text, { color: color || tone.color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
