import { Stack } from "expo-router";
import { STACK_SCREEN_OPTIONS } from "../../../ui/navigation";

export default function PracticeLayout() {
  return (
    <Stack screenOptions={STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="index" options={{ title: "Practice" }} />
      <Stack.Screen name="subjects" options={{ title: "Subjects" }} />
      <Stack.Screen name="topics" options={{ title: "Topics" }} />
      <Stack.Screen name="levels" options={{ title: "Levels" }} />
      <Stack.Screen name="quiz" options={{ title: "Quiz" }} />
      {/* A finished session is a result, not another step deeper — it slides up. */}
      <Stack.Screen name="summary" options={{ title: "Session Summary", animation: "slide_from_bottom" }} />
      <Stack.Screen name="history" options={{ title: "Session History" }} />
    </Stack>
  );
}
