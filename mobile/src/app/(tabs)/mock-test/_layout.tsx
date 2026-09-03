import { Stack } from "expo-router";
import { stackScreenOptions } from "../../../ui/navigation";
import { useTheme } from "../../../ui/ThemeContext";
import { useActiveSession } from "../../../practice/activeSessionContext";
import { useStaleStackReset } from "../../../practice/useStaleStackReset";
import { useT } from "../../../i18n/I18nContext";

export default function MockTestLayout() {
  const { colors } = useTheme();
  const t = useT();
  const { activeSession } = useActiveSession();
  // Coming back to this module after 90+ seconds away reopens it at its own home
  // screen instead of wherever the last visit ended. Suppressed while a test is
  // running — see the note in useStaleStackReset.
  useStaleStackReset("mock", activeSession === "mock");
  return (
    <Stack screenOptions={stackScreenOptions(colors)}>
      <Stack.Screen name="index" options={{ title: t("nav.mockTest") }} />
      <Stack.Screen name="papers" options={{ title: t("mock.papersTitle") }} />
      <Stack.Screen name="start" options={{ title: t("nav.testDetails") }} />
      {/* Entering a timed test is a mode change, not a drill-down. Fading into it (and
          keeping the swipe-back disabled) makes it feel like a room you commit to. */}
      <Stack.Screen
        name="test"
        options={{ title: t("nav.mockTest"), headerShown: false, gestureEnabled: false, animation: "fade" }}
      />
      <Stack.Screen
        name="result"
        options={{ title: t("nav.result"), gestureEnabled: false, animation: "slide_from_bottom" }}
      />
    </Stack>
  );
}
