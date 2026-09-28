import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { theme } from "@sarkaritaayari/shared";
import type { Subtitle } from "@sarkaritaayari/shared";
import { SceneContainer } from "../SceneContainer";
import { AnimatedCounter } from "../AnimatedCounter";

export interface BarSpec {
  label: string;
  value: number;
  max: number;
  color: string;
  growStart: number;
  growEnd: number;
}

export interface AnswerSpec {
  prefix?: string;
  from: number;
  to: number;
  suffix?: string;
  startFrame: number;
  durationInFrames?: number;
}

export interface ExampleSceneProps {
  heading: string;
  problemText: string;
  /** Optional side-by-side comparison bars (e.g. part vs. whole). Omit for problems with no natural bar comparison. */
  bars?: BarSpec[];
  calcLines: string[];
  calcStartFrame?: number;
  calcStagger?: number;
  answer: AnswerSpec;
  subtitles?: Subtitle[];
}

const MAX_BAR_WIDTH = 640;

const Bar: React.FC<BarSpec> = ({ label, value, max, color, growStart, growEnd }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [growStart, growEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const width = (value / max) * MAX_BAR_WIDTH * progress;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 32, color: theme.colors.textSecondary }}>{label}</div>
      <div style={{ width: MAX_BAR_WIDTH, height: 44, backgroundColor: theme.colors.surface, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ width, height: "100%", backgroundColor: color, borderRadius: 10 }} />
      </div>
    </div>
  );
};

/**
 * A worked exam-style problem: heading, problem statement card, optional
 * comparison bars, staggered calculation lines, and a pulsing animated
 * final answer. Bars are optional so topics without a natural part/whole
 * comparison (e.g. simple interest) can still reuse this scene.
 */
export const ExampleScene: React.FC<ExampleSceneProps> = ({
  heading,
  problemText,
  bars,
  calcLines,
  calcStartFrame = 320,
  calcStagger = 40,
  answer,
  subtitles,
}) => {
  const frame = useCurrentFrame();

  const headingOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const cardOpacity = interpolate(frame, [30, 55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cardY = interpolate(frame, [30, 55], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const lineOpacity = (index: number) => {
    const s = calcStartFrame + index * calcStagger;
    return interpolate(frame, [s, s + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  };

  const answerDuration = answer.durationInFrames ?? 30;
  const answerOpacity = interpolate(frame, [answer.startFrame, answer.startFrame + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pulse = interpolate(
    frame,
    [answer.startFrame + 20, answer.startFrame + 35, answer.startFrame + 50],
    [1, 1.08, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <SceneContainer subtitles={subtitles}>
      <div style={{ opacity: headingOpacity, color: theme.colors.textPrimary, fontSize: 64, fontWeight: theme.font.weightBold, marginBottom: 40 }}>
        {heading}
      </div>

      <div
        style={{
          opacity: cardOpacity,
          transform: `translateY(${cardY}px)`,
          backgroundColor: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: 16,
          padding: "28px 36px",
          fontSize: 38,
          color: theme.colors.textPrimary,
          maxWidth: 1100,
          marginBottom: 48,
        }}
      >
        {problemText}
      </div>

      <div style={{ display: "flex", gap: 80, alignItems: "flex-start" }}>
        {bars ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {bars.map((bar) => (
              <Bar key={bar.label} {...bar} />
            ))}
          </div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {calcLines.map((line, i) => (
            <div
              key={line}
              style={{
                opacity: lineOpacity(i),
                fontSize: 42,
                color: i === calcLines.length - 1 ? theme.colors.textPrimary : theme.colors.textSecondary,
                fontWeight: i === calcLines.length - 1 ? theme.font.weightSemibold : theme.font.weightRegular,
              }}
            >
              {line}
            </div>
          ))}

          <div
            style={{
              opacity: answerOpacity,
              transform: `scale(${pulse})`,
              marginTop: 8,
              fontSize: 56,
              fontWeight: theme.font.weightBold,
              color: theme.colors.accent,
            }}
          >
            {answer.prefix ?? "="}{" "}
            <AnimatedCounter
              from={answer.from}
              to={answer.to}
              startFrame={answer.startFrame}
              durationInFrames={answerDuration}
              suffix={answer.suffix}
            />
          </div>
        </div>
      </div>
    </SceneContainer>
  );
};
