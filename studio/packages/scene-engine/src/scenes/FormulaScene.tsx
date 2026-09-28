import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "@sarkaritaayari/shared";
import type { Subtitle } from "@sarkaritaayari/shared";
import { SceneContainer } from "../SceneContainer";

export interface FormulaToken {
  text: string;
  emphasis?: boolean;
}

export interface FormRepresentation {
  value: string;
  /** Label rendered on the arrow leading into this card. Ignored for the first card. */
  connectorLabel?: string;
}

export interface FormulaSceneProps {
  heading: string;
  formulaTokens: FormulaToken[];
  tokenStartFrame?: number;
  tokenStagger?: number;
  /** Row of equivalent representations connected by arrows (e.g. 25% -> 25/100 -> 1/4). Omit if the formula has no natural equivalent forms. */
  forms?: FormRepresentation[];
  formsLabel?: string;
  formsStartFrame?: number;
  formsStagger?: number;
  formsArrowOffset?: number;
  formsPulseFrame?: number;
  caption?: string;
  captionFrame?: number;
  subtitles?: Subtitle[];
}

const RepresentationCard: React.FC<{ value: string; appearFrame: number; pulseFrame: number }> = ({
  value,
  appearFrame,
  pulseFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame: frame - appearFrame, fps, config: { damping: 14, mass: 0.6 } });
  const opacity = interpolate(frame, [appearFrame, appearFrame + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const pulse = interpolate(frame, [pulseFrame, pulseFrame + 12, pulseFrame + 24], [1, 1.06, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        opacity,
        transform: `scale(${(0.8 + enter * 0.2) * pulse})`,
        backgroundColor: theme.colors.surface,
        border: `2px solid ${theme.colors.accent}`,
        borderRadius: 20,
        padding: "36px 48px",
        fontSize: 64,
        fontWeight: theme.font.weightBold,
        color: theme.colors.textPrimary,
        minWidth: 220,
        textAlign: "center",
      }}
    >
      {value}
    </div>
  );
};

const Arrow: React.FC<{ appearFrame: number; label?: string }> = ({ appearFrame, label }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [appearFrame, appearFrame + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const width = interpolate(frame, [appearFrame, appearFrame + 16], [0, 64], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity, gap: 6 }}>
      {label ? <div style={{ fontSize: 24, color: theme.colors.textSecondary }}>{label}</div> : <div style={{ height: 24 }} />}
      <div style={{ width, height: 4, backgroundColor: theme.colors.accent, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            right: -2,
            top: -6,
            width: 0,
            height: 0,
            borderTop: "8px solid transparent",
            borderBottom: "8px solid transparent",
            borderLeft: `12px solid ${theme.colors.accent}`,
          }}
        />
      </div>
    </div>
  );
};

/**
 * Reveals a formula token-by-token, then optionally shows a row of
 * equivalent representations connected by arrows (spec section 10's
 * "25% = 25/100 = 1/4" example generalizes to any formula with alternate
 * forms — the row is skipped entirely when `forms` is omitted).
 */
export const FormulaScene: React.FC<FormulaSceneProps> = ({
  heading,
  formulaTokens,
  tokenStartFrame = 45,
  tokenStagger = 18,
  forms,
  formsLabel,
  formsStartFrame = 230,
  formsStagger = 90,
  formsArrowOffset = 50,
  formsPulseFrame = 440,
  caption,
  captionFrame = 470,
  subtitles,
}) => {
  const frame = useCurrentFrame();

  const headingOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const tokenOpacity = (index: number) => {
    const s = tokenStartFrame + index * tokenStagger;
    return interpolate(frame, [s, s + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  };
  const tokenY = (index: number) => {
    const s = tokenStartFrame + index * tokenStagger;
    return interpolate(frame, [s, s + 14], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  };

  const lastTokenEnd = tokenStartFrame + (formulaTokens.length - 1) * tokenStagger + 14;
  const formulaBoxOpacity = forms
    ? interpolate(frame, [lastTokenEnd + 40, lastTokenEnd + 70], [1, 0.35], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  const rowLabelOpacity = interpolate(frame, [formsStartFrame - 20, formsStartFrame + 5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const captionOpacity = interpolate(frame, [captionFrame, captionFrame + 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneContainer subtitles={subtitles}>
      <div style={{ opacity: headingOpacity, color: theme.colors.textPrimary, fontSize: 64, fontWeight: theme.font.weightBold, marginBottom: 32 }}>
        {heading}
      </div>

      <div style={{ opacity: formulaBoxOpacity, display: "flex", fontSize: 48, color: theme.colors.textSecondary, marginBottom: 64 }}>
        {formulaTokens.map((token, i) => (
          <span
            key={i}
            style={{
              opacity: tokenOpacity(i),
              transform: `translateY(${tokenY(i)}px)`,
              color: token.emphasis ? theme.colors.accent : theme.colors.textSecondary,
              fontWeight: token.emphasis ? theme.font.weightBold : theme.font.weightRegular,
              whiteSpace: "pre",
            }}
          >
            {token.text}
          </span>
        ))}
      </div>

      {forms ? (
        <>
          {formsLabel ? (
            <div style={{ opacity: rowLabelOpacity, fontSize: 32, color: theme.colors.textSecondary, marginBottom: 24 }}>
              {formsLabel}
            </div>
          ) : null}

          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            {forms.map((form, i) => {
              const appearFrame = formsStartFrame + i * formsStagger;
              return (
                <React.Fragment key={form.value}>
                  {i > 0 ? <Arrow appearFrame={appearFrame - formsArrowOffset} label={form.connectorLabel} /> : null}
                  <RepresentationCard value={form.value} appearFrame={appearFrame} pulseFrame={formsPulseFrame} />
                </React.Fragment>
              );
            })}
          </div>
        </>
      ) : null}

      {caption ? (
        <div style={{ opacity: captionOpacity, marginTop: 56, fontSize: 34, color: theme.colors.textSecondary }}>{caption}</div>
      ) : null}
    </SceneContainer>
  );
};
