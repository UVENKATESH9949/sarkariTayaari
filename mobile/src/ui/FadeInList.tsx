import type { ReactNode } from "react";
import Animated, { FadeInDown } from "react-native-reanimated";
import { DURATION, staggerDelay } from "./motion";

type Props = {
  /** Position in the list — drives the stagger. */
  index: number;
  children: ReactNode;
};

/**
 * Wraps a list row so it rises and fades in, slightly after the row above it.
 *
 * The stagger is what stops a screen appearing as one flat slab. It also covers a real
 * problem: these lists are populated from a SQLite query, so they render empty for a
 * frame or two and then fill. Without motion that looks like a flicker; with it, it looks
 * like the content arriving.
 */
export function FadeInItem({ index, children }: Props) {
  return (
    <Animated.View entering={FadeInDown.duration(DURATION.base).delay(staggerDelay(index))}>
      {children}
    </Animated.View>
  );
}
