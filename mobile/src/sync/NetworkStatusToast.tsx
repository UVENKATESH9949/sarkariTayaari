import { Pressable, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useNetworkStatus } from "./NetworkStatusContext";
import { useT } from "../i18n/I18nContext";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";

/**
 * A brief notification at the top of the app when connectivity changes, replacing the
 * permanent offline banner.
 *
 * Both states are deliberately calm rather than alarming — everything already downloaded
 * keeps working, so going offline is informational ("here's why nothing new is arriving"),
 * not an error. Coming back online is the good news, and gets the success tone.
 *
 * Driven by `transition` (an edge), never by `isOnline` (a level) — see the long note in
 * NetworkStatusContext for why that distinction is the whole fix.
 *
 * Accessibility (Doc 2 §52): the two states differ by icon, by wording AND by colour, so
 * nothing here is conveyed by colour alone. `accessibilityLiveRegion` makes a screen
 * reader announce the change, which matters more here than usual because the toast is
 * gone in 3.5 seconds.
 */
export function NetworkStatusToast() {
  const { transition, dismissTransition } = useNetworkStatus();
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const insets = useSafeAreaInsets();
  const t = useT();

  if (transition === null) return null;

  const isBackOnline = transition === "online";
  const accent = isBackOnline ? colors.semantic.success : colors.text.secondary;
  const message = isBackOnline ? t("network.backOnline") : t("network.offline");

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(180)}
      style={[styles.toast, { paddingTop: insets.top + 8, borderBottomColor: accent }]}
      accessibilityLiveRegion="polite"
    >
      {/* Tappable so it can be dismissed immediately — the timer is a maximum, not a
          minimum, and a notification the user has read should get out of the way. */}
      <Pressable style={styles.inner} onPress={dismissTransition} accessibilityRole="button" accessibilityLabel={message}>
        <Ionicons
          name={isBackOnline ? "cloud-done-outline" : "cloud-offline-outline"}
          size={15}
          color={accent}
        />
        <Text style={[styles.text, { color: accent }]}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
}

const buildStyles = ({ colors, spacing }: Theme) =>
  StyleSheet.create({
    toast: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surfaceElevated2,
      borderBottomWidth: 2,
      zIndex: 50,
    },
    inner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm - 1,
      paddingBottom: spacing.sm,
      paddingHorizontal: spacing.base,
    },
    text: {
      fontSize: 12.5,
      fontWeight: "600",
    },
  });
