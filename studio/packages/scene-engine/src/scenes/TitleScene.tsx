import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "@sarkaritaayari/shared";
import type { Subtitle } from "@sarkaritaayari/shared";
import { SceneContainer } from "../SceneContainer";

export interface TitleSceneProps {
  kicker: string;
  title: string;
  subtitle: string;
  subtitles?: Subtitle[];
}

export const TitleScene: React.FC<TitleSceneProps> = ({ kicker, title, subtitle, subtitles }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const kickerOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titleScale = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  const titleOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const barWidth = interpolate(frame, [10, 40], [0, 180], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const subOpacity = interpolate(frame, [35, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const subY = interpolate(frame, [35, 55], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneContainer subtitles={subtitles}>
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            opacity: kickerOpacity,
            color: theme.colors.accent,
            fontSize: 30,
            fontWeight: theme.font.weightSemibold,
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 24,
          }}
        >
          {kicker}
        </div>

        <div
          style={{
            opacity: titleOpacity,
            transform: `scale(${0.85 + titleScale * 0.15})`,
            transformOrigin: "left center",
            color: theme.colors.textPrimary,
            fontSize: 120,
            fontWeight: theme.font.weightBold,
            lineHeight: 1.05,
          }}
        >
          {title}
        </div>

        <div
          style={{
            width: barWidth,
            height: 10,
            borderRadius: 5,
            backgroundColor: theme.colors.accent,
            marginTop: 32,
            marginBottom: 32,
          }}
        />

        <div
          style={{
            opacity: subOpacity,
            transform: `translateY(${subY}px)`,
            color: theme.colors.textSecondary,
            fontSize: 40,
            fontWeight: theme.font.weightRegular,
          }}
        >
          {subtitle}
        </div>
      </div>
    </SceneContainer>
  );
};
