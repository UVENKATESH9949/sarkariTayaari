import type { TextStyle, ViewStyle } from "react-native";
import type { Theme } from "../ui/ThemeContext";

/**
 * Style shape every OptionList variant fills in. Not every variant uses every key —
 * "plain" (no letter badge) and "radio" (icon instead of a badge box) leave the badge*
 * keys unset, and the component only reads them when `badge="letter"`.
 */
export type OptionListStyles = {
  list: ViewStyle;
  row: ViewStyle;
  rowSelected?: ViewStyle;
  rowCorrect?: ViewStyle;
  rowWrong?: ViewStyle;
  badge?: ViewStyle;
  badgeSelected?: ViewStyle;
  badgeCorrect?: ViewStyle;
  badgeWrong?: ViewStyle;
  badgeText?: TextStyle;
  badgeTextLight?: TextStyle;
  text: TextStyle;
};

/**
 * Each factory below is a straight lift of one screen's pre-existing inline option
 * styles (practice/quiz.tsx, mock-test/test.tsx, mock-test/result.tsx, revise.tsx,
 * practice/summary.tsx) — same values, same tokens, nothing renumbered. They stay as
 * separate named module-level consts, not one parameterised function, because
 * `useThemedStyles`'s cache is keyed on factory identity (see ui/ThemeContext.tsx) and a
 * closure built fresh per render would defeat it.
 */

/** practice/quiz.tsx — letter badge, immediate reveal on selection. */
export function revealLetterComfortableStyles(theme: Theme): OptionListStyles {
  const { colors, spacing, radius } = theme;
  return {
    list: { gap: spacing.md },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md + 2,
    },
    rowCorrect: { borderColor: colors.semantic.success, backgroundColor: colors.semantic.successBg },
    rowWrong: { borderColor: colors.semantic.error, backgroundColor: colors.semantic.errorBg },
    badge: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.surfaceElevated2,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeCorrect: { backgroundColor: colors.semantic.success },
    badgeWrong: { backgroundColor: colors.semantic.error },
    badgeText: { fontSize: 13, fontWeight: "700", color: colors.text.primary },
    badgeTextLight: { color: colors.text.onAccent },
    text: { flex: 1, fontSize: 15, color: colors.text.primary },
  };
}

/** mock-test/test.tsx — letter badge, no reveal (blind); a solid accent marks the pick. */
export function blindLetterComfortableStyles(theme: Theme): OptionListStyles {
  const { colors } = theme;
  return {
    list: { gap: 12 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 14,
    },
    rowSelected: { borderColor: colors.brand.primary, backgroundColor: colors.surfaceElevated2 },
    badge: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.surfaceElevated2,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeSelected: { backgroundColor: colors.brand.primary },
    badgeText: { fontSize: 13, fontWeight: "700", color: colors.text.primary },
    badgeTextLight: { color: colors.text.onAccent },
    text: { flex: 1, fontSize: 15, color: colors.text.primary },
  };
}

/** app/diagnostic-test.tsx — no badge box; a leading radio icon marks the pick, no reveal. */
export function blindRadioStyles(theme: Theme): OptionListStyles {
  const { colors, spacing, radius } = theme;
  return {
    list: {},
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm + 2,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    rowSelected: { borderColor: colors.brand.light, backgroundColor: colors.brand.glowSoft },
    text: { flex: 1, fontSize: 14, color: colors.text.primary },
  };
}

/** practice/summary.tsx — letter badge, reveal, compact density for an expandable card. */
export function revealLetterCompactStyles(theme: Theme): OptionListStyles {
  const { colors, spacing, radius } = theme;
  return {
    list: { gap: spacing.sm },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm + 2,
      backgroundColor: colors.surfaceElevated2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm + 2,
      padding: spacing.sm + 2,
    },
    rowCorrect: { borderColor: colors.semantic.success, backgroundColor: colors.semantic.successBg },
    rowWrong: { borderColor: colors.semantic.error, backgroundColor: colors.semantic.errorBg },
    badge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeCorrect: { backgroundColor: colors.semantic.success },
    badgeWrong: { backgroundColor: colors.semantic.error },
    badgeText: { fontSize: 12, fontWeight: "700", color: colors.text.primary },
    badgeTextLight: { color: colors.text.onAccent },
    text: { flex: 1, fontSize: 13, color: colors.text.primary },
  };
}

/**
 * mock-test/result.tsx and revise.tsx — no badge at all, reveal via row colour plus a
 * trailing icon. The two screens' original values differed by 1px in a couple of places
 * (11 vs spacing.md-1, radius 10 vs radius.sm+2) with no visible difference at either
 * screen's density; this factory takes the token-based values so both keep drawing from
 * the same theme scale instead of a hand-picked pixel.
 */
export function revealPlainStyles(theme: Theme): OptionListStyles {
  const { colors, spacing, radius } = theme;
  return {
    list: { gap: spacing.sm },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm + 2,
      padding: spacing.md - 1,
    },
    rowCorrect: { borderColor: colors.semantic.success, backgroundColor: colors.semantic.successBg },
    rowWrong: { borderColor: colors.semantic.error, backgroundColor: colors.semantic.errorBg },
    text: { fontSize: 13, color: colors.text.primary, flex: 1 },
  };
}
