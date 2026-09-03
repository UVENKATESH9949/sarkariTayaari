import { Stack } from "expo-router";
import { stackScreenOptions } from "../../../ui/navigation";
import { useTheme } from "../../../ui/ThemeContext";
import { useActiveSession } from "../../../practice/activeSessionContext";
import { useStaleStackReset } from "../../../practice/useStaleStackReset";
import { useT } from "../../../i18n/I18nContext";

export default function PracticeLayout() {
  const { colors } = useTheme();
  const t = useT();
  const { activeSession } = useActiveSession();
  // Coming back to this module after 90+ seconds away reopens it at its own home
  // screen instead of wherever the last visit ended. Suppressed while a test is
  // running — see the note in useStaleStackReset.
  useStaleStackReset("practice", activeSession === "practice");
  return (
    <Stack screenOptions={stackScreenOptions(colors)}>
      <Stack.Screen name="index" options={{ title: t("nav.practice") }} />
      <Stack.Screen name="subjects" options={{ title: t("nav.subjects") }} />
      <Stack.Screen name="topics" options={{ title: t("nav.topics") }} />
      <Stack.Screen name="levels" options={{ title: t("nav.levels") }} />
      <Stack.Screen name="quiz" options={{ title: t("nav.quiz") }} />
      {/* A finished session is a result, not another step deeper — it slides up. */}
      <Stack.Screen name="summary" options={{ title: t("summary.title"), animation: "slide_from_bottom" }} />
      <Stack.Screen name="history" options={{ title: t("history.title") }} />
    </Stack>
  );
}
