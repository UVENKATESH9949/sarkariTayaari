import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "./theme";

type PyqBadgeProps = {
  isPyq?: boolean;
  year?: number | null;
  shift?: string | null;
};

/**
 * "Asked in 2023 · Shift 2" — previous-year provenance on a question (Epic L / TICKET-2104).
 *
 * The most directly useful thing the PYQ data does for a student: a question that actually
 * appeared in a real paper carries more weight than a practice question, and until now the app
 * had no way to say so because nothing temporal was stored on a question at all.
 *
 * Renders nothing unless the question is flagged as a PYQ. A year with no flag is deliberately
 * not enough — the two are stored separately on the server precisely so "PYQ, year unknown" is
 * representable, and this component must not invent the flag from the year.
 */
export function PyqBadge({ isPyq, year, shift }: PyqBadgeProps) {
  if (!isPyq) return null;

  // "Previous year" when the flag is set but the year is not — truthful, and better than
  // omitting the badge, which would hide the single most useful fact about the question.
  const detail = year
    ? `Asked in ${year}${shift ? ` · ${shift}` : ""}`
    : "Previous year question";

  return (
    <View style={styles.badge}>
      <Ionicons name="ribbon-outline" size={12} color={colors.semantic.warning} />
      <Text style={styles.text}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs + 1,
    backgroundColor: colors.semantic.warningBg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    marginBottom: spacing.sm + 2,
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.semantic.warning,
  },
});
