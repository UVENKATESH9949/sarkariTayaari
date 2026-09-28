import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { theme } from "@sarkaritaayari/shared";
import type { Subtitle } from "@sarkaritaayari/shared";
import { SceneContainer } from "../SceneContainer";

export interface BreakdownItem {
  text: string;
  /** Renders larger, bold, and in the accent color — for the "punchline" item. */
  emphasis?: boolean;
}

export interface GridHighlightSpec {
  /** Grid is gridSize x gridSize cells. Defaults to 10 (100 cells). */
  gridSize?: number;
  fillTarget: number;
  fillStartFrame: number;
  fillEndFrame: number;
  resultPrefix: string;
  resultValue: string;
  /** Defaults to fillEndFrame + 20. */
  resultRevealFrame?: number;
}

export interface ConceptSceneProps {
  heading: string;
  breakdown: BreakdownItem[];
  breakdownStartFrame?: number;
  breakdownStagger?: number;
  grid?: GridHighlightSpec;
  subtitles?: Subtitle[];
}

const CELL_SIZE = 34;
const CELL_GAP = 6;

/**
 * Explains a single core idea via a staggered text breakdown, optionally
 * paired with an animated cell grid that highlights `fillTarget` out of
 * `gridSize^2` cells — a generic "part of a whole" visualization reusable
 * for any topic (percentages, rates, ratios), not just percentages.
 */
export const ConceptScene: React.FC<ConceptSceneProps> = ({
  heading,
  breakdown,
  breakdownStartFrame = 30,
  breakdownStagger = 8,
  grid,
  subtitles,
}) => {
  const frame = useCurrentFrame();

  const headingOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const itemProgress = (index: number) => {
    const s = breakdownStartFrame + index * breakdownStagger;
    return interpolate(frame, [s, s + 15], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
  };

  const gridSize = grid?.gridSize ?? 10;
  const totalCells = gridSize * gridSize;

  const fillProgress = grid
    ? interpolate(frame, [grid.fillStartFrame, grid.fillEndFrame], [0, grid.fillTarget], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.ease),
      })
    : 0;
  const filledCount = Math.floor(fillProgress);

  const resultRevealFrame = grid ? grid.resultRevealFrame ?? grid.fillEndFrame + 20 : 0;
  const resultOpacity = grid
    ? interpolate(frame, [resultRevealFrame, resultRevealFrame + 20], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <SceneContainer subtitles={subtitles}>
      <div
        style={{
          opacity: headingOpacity,
          color: theme.colors.textPrimary,
          fontSize: 64,
          fontWeight: theme.font.weightBold,
          marginBottom: 48,
        }}
      >
        {heading}
      </div>

      <div style={{ display: "flex", gap: 96, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 480 }}>
          {breakdown.map((item, i) => {
            const p = itemProgress(i);
            return (
              <div
                key={`${item.text}-${i}`}
                style={{
                  opacity: p,
                  transform: `translateX(${(1 - p) * -30}px)`,
                  fontSize: item.emphasis ? 56 : 44,
                  fontWeight: item.emphasis ? theme.font.weightBold : theme.font.weightRegular,
                  color: item.emphasis ? theme.colors.accent : theme.colors.textSecondary,
                }}
              >
                {item.text}
              </div>
            );
          })}

          {grid ? (
            <div style={{ opacity: resultOpacity, marginTop: 24, fontSize: 44, color: theme.colors.textPrimary }}>
              {grid.resultPrefix}{" "}
              <span style={{ color: theme.colors.accent, fontWeight: theme.font.weightBold }}>
                {grid.resultValue}
              </span>
            </div>
          ) : null}
        </div>

        {grid ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${gridSize}, ${CELL_SIZE}px)`,
              gap: CELL_GAP,
            }}
          >
            {Array.from({ length: totalCells }).map((_, i) => {
              const isFilled = i < filledCount;
              return (
                <div
                  key={i}
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    borderRadius: 6,
                    backgroundColor: isFilled ? theme.colors.accent : theme.colors.surface,
                    border: `1px solid ${theme.colors.border}`,
                  }}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </SceneContainer>
  );
};
