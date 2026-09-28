import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface AnimatedCounterProps {
  from: number;
  to: number;
  /** Local frame (within the current scene) at which counting starts. */
  startFrame: number;
  durationInFrames: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  style?: React.CSSProperties;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  from,
  to,
  startFrame,
  durationInFrames,
  decimals = 0,
  prefix = "",
  suffix = "",
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - startFrame,
    fps,
    durationInFrames,
    config: { damping: 200 },
  });

  const value = interpolate(progress, [0, 1], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <span style={style}>
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
};
