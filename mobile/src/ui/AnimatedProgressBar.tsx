import { useEffect } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { DURATION, EASE_IN_OUT } from "./motion";
import { useTheme } from "./ThemeContext";

type Props = {
  /** 0 to 1. */
  progress: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A progress bar that travels to its new value instead of jumping.
 *
 * Worth the extra file: in the quiz this bar is the only thing telling a student how far
 * through they are. A jump reads as a redraw, whereas a short slide reads as progress
 * being made — the same information, but it feels like something was achieved.
 */
export function AnimatedProgressBar({ progress, height = 6, trackColor, fillColor, style }: Props) {
  // Defaults are resolved here rather than as default parameter values: those are
  // evaluated at module load, which is before any theme is known.
  const { colors } = useTheme();
  const track = trackColor ?? colors.surfaceElevated2;
  const fill = fillColor ?? colors.brand.bright;
  const width = useSharedValue(0);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(1, progress));
    width.value = withTiming(clamped, { duration: DURATION.base, easing: EASE_IN_OUT });
  }, [progress, width]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  return (
    <View style={[{ height, backgroundColor: track, borderRadius: height / 2, overflow: "hidden" }, style]}>
      <Animated.View style={[{ height: "100%", backgroundColor: fill, borderRadius: height / 2 }, fillStyle]} />
    </View>
  );
}
