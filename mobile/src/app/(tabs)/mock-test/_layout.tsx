import { Stack } from "expo-router";

export default function MockTestLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Mock Test" }} />
      <Stack.Screen name="start" options={{ title: "Test Details" }} />
      <Stack.Screen name="test" options={{ title: "Mock Test", headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="result" options={{ title: "Result", gestureEnabled: false }} />
    </Stack>
  );
}
