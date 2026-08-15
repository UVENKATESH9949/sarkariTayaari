import { Stack } from "expo-router";

export default function PracticeLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Practice" }} />
      <Stack.Screen name="subjects" options={{ title: "Subjects" }} />
      <Stack.Screen name="topics" options={{ title: "Topics" }} />
      <Stack.Screen name="levels" options={{ title: "Levels" }} />
      <Stack.Screen name="quiz" options={{ title: "Quiz" }} />
      <Stack.Screen name="summary" options={{ title: "Session Summary" }} />
      <Stack.Screen name="history" options={{ title: "Session History" }} />
    </Stack>
  );
}
