import { Stack } from "expo-router";
import { stackScreenOptions } from "../../../ui/navigation";
import { useTheme } from "../../../ui/ThemeContext";
import { useStaleStackReset } from "../../../practice/useStaleStackReset";

/**
 * AI Videos — video lessons, browsed through the exam syllabus the rest of the app already uses.
 *
 * <p>Exam -> Subject -> Topic -> Video, where the exam is whichever one the student has made
 * active, exactly as Practice and Mock Test read it. There is deliberately no separate subject or
 * topic list for videos: a second, hand-maintained hierarchy would drift from the one Practice
 * uses, and a student would end up with two different ideas of what their syllabus is.
 */
export default function AiVideosLayout() {
  const { colors } = useTheme();
  // Same 90-second idle collapse every other module has, so coming back days later reopens at
  // the subject list rather than wherever the last visit happened to end.
  useStaleStackReset("ai-videos", false);
  return (
    <Stack screenOptions={stackScreenOptions(colors)}>
      <Stack.Screen name="index" options={{ title: "AI Videos" }} />
      <Stack.Screen name="subject" options={{ title: "AI Videos" }} />
    </Stack>
  );
}
