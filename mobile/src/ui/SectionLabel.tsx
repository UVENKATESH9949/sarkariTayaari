import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "./theme";

type SectionLabelProps = {
  label: string;
  /** Right-aligned meta text, e.g. "12 boards". */
  count?: string;
  style?: StyleProp<ViewStyle>;
};

/** Blue uppercase section header, optionally with a right-aligned count — replaces the plain-grey `typography.label` usage on redesigned screens. */
export function SectionLabel({ label, count, style }: SectionLabelProps) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.label}>{label}</Text>
      {count ? <Text style={styles.count}>{count}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: colors.brand.light,
    textTransform: "uppercase",
  },
  count: {
    fontSize: 12,
    color: colors.text.muted,
  },
});
