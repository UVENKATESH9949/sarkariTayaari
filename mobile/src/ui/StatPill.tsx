import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { IoniconName } from "../constants/subjects";
import { colors, radius, spacing } from "./theme";

type StatPillProps = {
  icon: IoniconName;
  value: string;
  label: string;
};

/** The two-stat row on exam cards — "10,174 questions" / "Medium level", "24 full tests" / etc. */
export function StatPill({ icon, value, label }: StatPillProps) {
  return (
    <View style={styles.pill}>
      <Ionicons name={icon} size={12} color={colors.text.secondary} />
      <Text style={styles.text} numberOfLines={1}>
        <Text style={styles.value}>{value}</Text> {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm + 2,
    paddingVertical: spacing.sm - 1,
    paddingHorizontal: spacing.sm + 2,
  },
  text: {
    fontSize: 11.5,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  value: {
    color: colors.text.primary,
    fontWeight: "600",
  },
});
