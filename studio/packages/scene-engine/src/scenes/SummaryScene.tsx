import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { theme } from "@sarkaritaayari/shared";
import type { Subtitle } from "@sarkaritaayari/shared";
import { SceneContainer } from "../SceneContainer";

export interface SummarySceneProps {
  heading: string;
  points: string[];
  pointsStartFrame?: number;
  pointsStagger?: number;
  outroTitle: string;
  outroSubtitle: string;
  outroStartFrame?: number;
  subtitles?: Subtitle[];
}

const CheckIcon: React.FC = () => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    <circle cx="18" cy="18" r="18" fill={theme.colors.accent} />
    <path d="M11 18.5L15.5 23L25 12.5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SummaryScene: React.FC<SummarySceneProps> = ({
  heading,
  points,
  pointsStartFrame = 30,
  pointsStagger = 25,
  outroTitle,
  outroSubtitle,
  outroStartFrame = 230,
  subtitles,
}) => {
  const frame = useCurrentFrame();

  const headingOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const pointStyle = (index: number) => {
    const s = pointsStartFrame + index * pointsStagger;
    const opacity = interpolate(frame, [s, s + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const x = interpolate(frame, [s, s + 16], [-24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return { opacity, transform: `translateX(${x}px)` };
  };

  const outroOpacity = interpolate(frame, [outroStartFrame, outroStartFrame + 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const outroY = interpolate(frame, [outroStartFrame, outroStartFrame + 25], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneContainer subtitles={subtitles}>
      <div style={{ opacity: headingOpacity, color: theme.colors.textPrimary, fontSize: 64, fontWeight: theme.font.weightBold, marginBottom: 48 }}>
        {heading}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        {points.map((point, i) => (
          <div key={point} style={{ display: "flex", alignItems: "center", gap: 24, ...pointStyle(i) }}>
            <CheckIcon />
            <div style={{ fontSize: 36, color: theme.colors.textPrimary }}>{point}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          opacity: outroOpacity,
          transform: `translateY(${outroY}px)`,
          marginTop: 72,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 44, fontWeight: theme.font.weightBold, color: theme.colors.accent }}>{outroTitle}</div>
        <div style={{ fontSize: 28, color: theme.colors.textSecondary }}>{outroSubtitle}</div>
      </div>
    </SceneContainer>
  );
};
