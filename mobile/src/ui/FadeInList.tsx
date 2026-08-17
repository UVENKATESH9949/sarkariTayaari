import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { DURATION, staggerDelay } from "./motion";

type Props = {
  /** Position in the list — drives the stagger. */
  index: number;
  /**
   * Layout the wrapper must carry.
   *
   * This matters more than it looks. Wrapping a row inserts a view between the list
   * container and the item, so any percentage width on the item now resolves against the
   * wrapper rather than the container — which silently breaks grids. Where a child sizes
   * itself as a fraction of its parent, pass that width here and let the child fill it.
   */
  style?: StyleProp<ViewStyle>;
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
export function FadeInItem({ index, style, children }: Props) {
  return (
    <Animated.View style={style} entering={FadeInDown.duration(DURATION.base).delay(staggerDelay(index))}>
      {children}
    </Animated.View>
  );
}
