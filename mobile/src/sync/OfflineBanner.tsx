import { Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useNetworkStatus } from "./NetworkStatusContext";
import { colors } from "../ui/theme";

/**
 * Sits at the very top of the app, above whatever screen is showing, whenever the
 * device has no internet. Deliberately calm rather than alarming — everything already
 * downloaded keeps working, so this is informational ("here's why nothing new is
 * arriving"), not an error state.
 */
export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const insets = useSafeAreaInsets();

  if (isOnline !== false) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(180)}
      style={[styles.banner, { paddingTop: insets.top + 8 }]}
    >
      <Ionicons name="cloud-offline-outline" size={15} color={colors.text.onAccent} />
      <Text style={styles.text}>You&apos;re offline — using downloaded content</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingBottom: 8,
    backgroundColor: colors.surfaceElevated2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderAccent,
    zIndex: 50,
  },
  text: {
    color: colors.text.onAccent,
    fontSize: 12.5,
    fontWeight: "600",
  },
});
