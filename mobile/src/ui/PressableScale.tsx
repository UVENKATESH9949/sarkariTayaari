import { forwardRef } from "react";
import { Pressable, type PressableProps, type ViewStyle, type StyleProp } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { PRESS_SCALE, PRESS_SPRING } from "./motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** Cards can take a little more travel than small buttons. */
  scaleTo?: number;
};

/**
 * A Pressable that shrinks slightly under a finger.
 *
 * This is the single highest-value bit of motion in the app. A tap that produces no
 * physical response feels broken on a slow phone, because the user cannot tell whether
 * it registered — and this audience is largely on budget hardware where a screen
 * transition may take a moment to start.
 *
 * Runs on the UI thread via Reanimated, so it stays smooth even while JavaScript is busy
 * querying SQLite for the next screen — which is exactly when a JS-driven animation
 * would stutter and undo the point of having one.
 */
export const PressableScale = forwardRef<any, Props>(function PressableScale(
  { style, scaleTo = PRESS_SCALE, onPressIn, onPressOut, disabled, ...rest },
  ref,
) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      style={[style, animatedStyle]}
      onPressIn={(event) => {
        // A disabled card should stay inert; animating it would imply it did something.
        if (!disabled) scale.value = withSpring(scaleTo, PRESS_SPRING);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, PRESS_SPRING);
        onPressOut?.(event);
      }}
      {...rest}
    />
  );
});
