import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors, spacing } from "./theme";

type LoadingMarkProps = {
  /** Bold uppercase wordmark, e.g. "PREPARING". */
  label?: string;
  /** 0-100. Omit for an honest indeterminate sweep instead of a fabricated number — used
   * wherever this app doesn't actually track a real synced/total count. */
  percent?: number;
  size?: "hero" | "compact";
};

const TRACK_WIDTH: Record<"hero" | "compact", number> = { hero: 260, compact: 160 };
const BAR_HEIGHT: Record<"hero" | "compact", number> = { hero: 10, compact: 6 };
const LABEL_SIZE: Record<"hero" | "compact", number> = { hero: 24, compact: 14 };
const SWEEP_WIDTH_FRACTION = 0.4;
/** Slightly longer than the caller's tick interval, and linear, so consecutive updates
 * blend into one continuous slide instead of a visible step every tick. */
const FILL_EASE_MS = 240;

/**
 * The "preparing your content" mark used on the first-launch screen (hero, with a real
 * percentage) and on contextual mid-navigation loaders (compact, no percentage). Bold
 * uppercase type + a blinking cursor + a glowing progress bar, in the app's own black+blue
 * tokens — replaces the earlier owl illustration, which read as cute but not premium.
 */
export function LoadingMark({ label = "PREPARING", percent, size = "hero" }: LoadingMarkProps) {
  const trackWidth = TRACK_WIDTH[size];
  const cursorOpacity = useSharedValue(1);
  const sweepProgress = useSharedValue(0);
  const fillPercent = useSharedValue(0);

  useEffect(() => {
    cursorOpacity.value = withRepeat(
      withSequence(withTiming(0, { duration: 480 }), withTiming(1, { duration: 480 })),
      -1,
    );
  }, [cursorOpacity]);

  useEffect(() => {
    if (percent === undefined) {
      sweepProgress.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1);
    }
  }, [percent, sweepProgress]);

  // Ease toward each new value rather than snapping to it: callers update this on a
  // fixed tick, and jumping per tick reads as a stuttering bar. Runs on the UI thread,
  // so it stays smooth even while JS is busy writing the sync's first page to SQLite.
  useEffect(() => {
    if (percent === undefined) return;
    fillPercent.value = withTiming(Math.max(0, Math.min(100, percent)), {
      duration: FILL_EASE_MS,
      easing: Easing.linear,
    });
  }, [percent, fillPercent]);

  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursorOpacity.value }));

  const fillStyle = useAnimatedStyle(() => {
    if (percent !== undefined) {
      return { width: `${fillPercent.value}%`, left: 0 };
    }
    const sweepWidth = trackWidth * SWEEP_WIDTH_FRACTION;
    const travel = trackWidth - sweepWidth;
    return { width: sweepWidth, left: sweepProgress.value * travel };
  });

  return (
    <View style={[styles.container, { width: trackWidth }]}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { fontSize: LABEL_SIZE[size] }]}>{label}</Text>
        <Animated.View style={[styles.cursor, { height: LABEL_SIZE[size] - 4 }, cursorStyle]} />
      </View>
      <View style={[styles.track, { height: BAR_HEIGHT[size], borderRadius: BAR_HEIGHT[size] / 2 }]}>
        <Animated.View
          style={[
            styles.fill,
            { height: BAR_HEIGHT[size], borderRadius: BAR_HEIGHT[size] / 2 },
            fillStyle,
          ]}
        />
      </View>
      {percent !== undefined && <Text style={styles.percentText}>{Math.round(percent)}%</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-start",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm + 2,
  },
  label: {
    fontWeight: "800",
    letterSpacing: 3,
    color: colors.text.primary,
  },
  cursor: {
    width: 3,
    marginLeft: spacing.xs + 2,
    backgroundColor: colors.brand.bright,
  },
  track: {
    width: "100%",
    backgroundColor: colors.surfaceElevated2,
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    backgroundColor: colors.brand.bright,
    shadowColor: colors.brand.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  percentText: {
    marginTop: spacing.sm,
    alignSelf: "flex-end",
    fontSize: 13,
    fontWeight: "700",
    color: colors.brand.light,
  },
});
