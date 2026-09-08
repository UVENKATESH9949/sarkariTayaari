import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";
import { useTheme } from "./ThemeContext";

/**
 * A small light/dark toggle rendered as `headerRight` on every native-header screen (see
 * stackScreenOptions in navigation.ts) plus the four tab-root screens that hand-roll their
 * own header instead (Home, Exams, Progress, More) — the app has no OS theme detection, so
 * this and Settings are the only two ways to switch.
 */
export function ThemeToggleButton() {
  const { mode, colors, setThemeMode } = useTheme();
  const next = mode === "light" ? "dark" : "light";
  return (
    <Pressable
      onPress={() => setThemeMode(next)}
      hitSlop={12}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={mode === "light" ? "Switch to dark theme" : "Switch to light theme"}
    >
      <Ionicons name={mode === "light" ? "moon-outline" : "sunny-outline"} size={20} color={colors.text.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
