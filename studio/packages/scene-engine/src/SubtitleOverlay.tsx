import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "@sarkaritaayari/shared";
import type { Subtitle } from "@sarkaritaayari/shared";

interface SubtitleOverlayProps {
  subtitles: Subtitle[];
}

/**
 * Renders whichever subtitle is active for the current local frame.
 * Positioned low enough to stay clear of scene graphics (spec section 14).
 */
export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({ subtitles }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const active = subtitles.find((s) => t >= s.start && t < s.end);
  if (!active) return null;

  const startFrame = active.start * fps;
  const endFrame = active.end * fps;
  const cueLength = endFrame - startFrame;
  if (cueLength <= 0) return null;

  // Cap the fade at a third of the cue's own length so the four interpolation
  // points stay strictly increasing even for very short cues — a fixed
  // 6-frame fade could otherwise make the "fade in" point land after the
  // "fade out" point and crash the renderer.
  const fadeFrames = Math.min(6, cueLength / 3);
  const opacity = interpolate(
    frame,
    [startFrame, startFrame + fadeFrames, endFrame - fadeFrames, endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: 64,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          padding: "14px 28px",
          borderRadius: 12,
          backgroundColor: "rgba(11, 18, 32, 0.85)",
          color: "#FFFFFF",
          fontFamily: theme.font.family,
          fontSize: 32,
          fontWeight: theme.font.weightSemibold,
          textAlign: "center",
        }}
      >
        {active.text}
      </div>
    </div>
  );
};
