import { useEffect, useRef, useState } from "react";
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { DURATION, EASE_IN_OUT } from "./motion";
import { spacing, typography } from "./theme";

const QUOTES = [
  "Patience is the first step toward success.",
  "Small progress every day leads to big results.",
  "Your preparation today builds your confidence tomorrow.",
  "Stay consistent. Your goal is closer than you think.",
  "Success is built one question at a time.",
  "Consistency beats intensity.",
  "Every topic mastered is one step closer to success.",
];

const ROTATE_MS = 4000;

/** Rotates through a fixed set of motivational quotes with a fade transition, changing roughly every 4s — used on the first-launch preparation screen. */
export function QuoteRotator({ style }: { style?: StyleProp<TextStyle> }) {
  const [index, setIndex] = useState(0);
  const opacity = useSharedValue(1);
  const swapTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const interval = setInterval(() => {
      opacity.value = withSequence(
        withTiming(0, { duration: DURATION.quick, easing: EASE_IN_OUT }),
        withTiming(1, { duration: DURATION.quick, easing: EASE_IN_OUT }),
      );
      swapTimeout.current = setTimeout(() => setIndex((i) => (i + 1) % QUOTES.length), DURATION.quick);
    }, ROTATE_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(swapTimeout.current);
    };
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.Text style={[styles.quote, animatedStyle, style]}>&ldquo;{QUOTES[index]}&rdquo;</Animated.Text>;
}

const styles = StyleSheet.create({
  quote: {
    ...typography.secondary,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
});
