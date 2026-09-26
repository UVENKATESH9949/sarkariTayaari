import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { useT } from "../i18n/I18nContext";

type Props = {
  finalPriority: number | null;
  /** Non-null when a human overrode the computed score — shown as a small person glyph, same convention as `ui/TopicInsightChips.tsx`'s `PriorityChip`. */
  adminOverride?: number | null;
};

/**
 * A four-tier priority badge for the Topic Wise Mock builder's topic cards — deliberately a
 * SEPARATE component from `ui/TopicInsightChips.tsx`'s `PriorityChip`, not a reskin of it.
 * That component intentionally renders nothing below priority 45 ("the long tail doesn't need
 * a label" — see its own comment); this screen's card design has one badge slot per card and
 * wants every topic labelled, so a fourth ("Normal") band was added here rather than changing
 * `PriorityChip`'s behavior for Practice and Syllabus & Trends, which was a deliberate choice
 * made for a different screen shape.
 */
export function TopicPriorityBadge({ finalPriority, adminOverride }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();

  if (finalPriority === null || finalPriority === undefined) return null;

  const band =
    finalPriority >= 70
      ? { label: t("mock.hub.priorityHigh"), color: colors.semantic.error, bg: colors.semantic.errorBg, icon: "alert-circle" as const }
      : finalPriority >= 45
        ? { label: t("mock.hub.priorityMedium"), color: colors.semantic.warning, bg: colors.semantic.warningBg, icon: "time" as const }
        : finalPriority >= 20
          ? { label: t("mock.hub.priorityLow"), color: colors.semantic.success, bg: colors.semantic.successBg, icon: "checkmark-circle" as const }
          : { label: t("mock.hub.priorityNormal"), color: colors.text.secondary, bg: colors.surfaceElevated2, icon: "remove-circle" as const };

  return (
    <View style={[styles.badge, { backgroundColor: band.bg }]}>
      <Ionicons name={band.icon} size={12} color={band.color} />
      <Text style={[styles.badgeText, { color: band.color }]}>{band.label}</Text>
      {adminOverride !== null && adminOverride !== undefined && (
        <Ionicons name="person" size={10} color={band.color} />
      )}
    </View>
  );
}

const buildStyles = (_: Theme) =>
  StyleSheet.create({
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 5,
      borderRadius: radius.pill,
    },
    badgeText: {
      fontSize: 11.5,
      fontWeight: "700",
    },
  });
