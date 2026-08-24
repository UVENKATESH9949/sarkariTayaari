import { Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "./theme";

/**
 * Shown instead of a screen's normal "genuinely zero results" empty state when the
 * hybrid data layer's useHybridMode() returns "unavailable" — offline, and this device
 * has never completed a sync, so neither local SQLite nor the live backend can answer.
 * Distinct from an honest "no questions here" empty state: this explains *why*, and
 * what to do about it, rather than implying the content just doesn't exist.
 */
export function OfflineNoDataNotice() {
  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline-outline" size={32} color={colors.brand.light} />
      <Text style={styles.text}>
        You&apos;re offline and this content hasn&apos;t downloaded yet. Connect to the
        internet once to download it — after that, everything works offline.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  text: {
    fontSize: 13,
    color: colors.text.muted,
    textAlign: "center",
    lineHeight: 19,
  },
});
