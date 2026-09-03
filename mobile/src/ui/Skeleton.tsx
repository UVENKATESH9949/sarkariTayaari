import { useEffect } from "react";
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { DURATION, EASE_IN_OUT } from "./motion";
import { radius, spacing } from "./theme";
import { useTheme } from "./ThemeContext";

type SkeletonProps = {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Base shimmer block. Respects reduced-motion (a static block instead of a pulse) —
 * checked once per mount rather than subscribed to, since it changing mid-session is
 * not a case worth handling for a loading placeholder.
 */
export function Skeleton({ width = "100%", height, borderRadius = radius.sm, style }: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      opacity.value = reduced
        ? 0.5
        : withRepeat(withTiming(1, { duration: DURATION.emphasis * 2, easing: EASE_IN_OUT }), -1, true);
    });
    return () => {
      cancelled = true;
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: colors.surfaceElevated2 }, animatedStyle, style]}
    />
  );
}

/** Rows of icon-circle + two text lines — Subjects/Topics/Mock-Test list loading. */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={listStyles.row}>
          <Skeleton width={40} height={40} borderRadius={20} />
          <View style={listStyles.text}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="40%" height={12} style={listStyles.secondLine} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A single card-shaped block — Home/Progress readiness card while loading. */
export function CardSkeleton({ height = 96 }: { height?: number }) {
  return <Skeleton width="100%" height={height} borderRadius={radius.lg} />;
}

/** A question stem + 4 option rows — quiz/mock-test question loading. */
export function QuestionSkeleton() {
  return (
    <View>
      <Skeleton width="100%" height={20} />
      <Skeleton width="85%" height={20} style={questionStyles.secondLine} />
      <View style={questionStyles.options}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={48} borderRadius={radius.md} style={i > 0 && questionStyles.optionSpacing} />
        ))}
      </View>
    </View>
  );
}

const listStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: {
    flex: 1,
  },
  secondLine: {
    marginTop: spacing.xs,
  },
});

const questionStyles = StyleSheet.create({
  secondLine: {
    marginTop: spacing.sm,
  },
  options: {
    marginTop: spacing.xl,
  },
  optionSpacing: {
    marginTop: spacing.md,
  },
});
