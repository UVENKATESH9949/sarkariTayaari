import { Stack } from "expo-router";
import { STACK_SCREEN_OPTIONS } from "../../../ui/navigation";

export default function MockTestLayout() {
  return (
    <Stack screenOptions={STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="index" options={{ title: "Mock Test" }} />
      <Stack.Screen name="start" options={{ title: "Test Details" }} />
      {/* Entering a timed test is a mode change, not a drill-down. Fading into it (and
          keeping the swipe-back disabled) makes it feel like a room you commit to. */}
      <Stack.Screen
        name="test"
        options={{ title: "Mock Test", headerShown: false, gestureEnabled: false, animation: "fade" }}
      />
      <Stack.Screen
        name="result"
        options={{ title: "Result", gestureEnabled: false, animation: "slide_from_bottom" }}
      />
    </Stack>
  );
}
