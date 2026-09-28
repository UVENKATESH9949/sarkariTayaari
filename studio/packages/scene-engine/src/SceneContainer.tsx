import React from "react";
import { AbsoluteFill } from "remotion";
import { theme } from "@sarkaritaayari/shared";
import { SubtitleOverlay } from "./SubtitleOverlay";
import type { Subtitle } from "@sarkaritaayari/shared";

interface SceneContainerProps {
  children: React.ReactNode;
  subtitles?: Subtitle[];
}

/** Shared background/padding so every scene looks like one consistent template. */
export const SceneContainer: React.FC<SceneContainerProps> = ({ children, subtitles }) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.colors.background,
        fontFamily: theme.font.family,
      }}
    >
      <AbsoluteFill style={{ padding: 96 }}>{children}</AbsoluteFill>
      {subtitles ? <SubtitleOverlay subtitles={subtitles} /> : null}
    </AbsoluteFill>
  );
};
