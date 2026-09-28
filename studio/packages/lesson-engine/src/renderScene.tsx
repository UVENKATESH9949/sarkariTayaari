import React from "react";
import type { ReactNode } from "react";
import type { Subtitle } from "@sarkaritaayari/shared";
import { theme } from "@sarkaritaayari/shared";
import { TitleScene, ConceptScene, ExampleScene, FormulaScene, SummaryScene } from "@sarkaritaayari/scene-engine";
import type { ColorToken, LessonScene } from "./schema";

const COLOR_TOKENS: Record<ColorToken, string> = {
  accent: theme.colors.accent,
  muted: theme.colors.border,
};

const DEFAULT_FORMS_START_FRACTION = 0.4;
const DEFAULT_FORMS_STAGGER_FRACTION = 0.16;

const at = (fraction: number, durationInFrames: number): number => Math.round(fraction * durationInFrames);

/**
 * The one place that knows how to turn each scene `type` into the matching
 * scene-engine component, converting the JSON's fractional timing into the
 * absolute frame numbers those components expect. Written once per scene
 * *type* here, instead of once per scene per *lesson* as it was when lessons
 * were hand-written TSX.
 */
export function renderScene(
  scene: LessonScene,
  subtitles: Subtitle[],
  durationInFrames: number,
  fps: number
): ReactNode {
  switch (scene.type) {
    case "title":
      return <TitleScene kicker={scene.kicker} title={scene.title} subtitle={scene.subtitle} subtitles={subtitles} />;

    case "concept": {
      const grid = scene.grid
        ? {
            gridSize: scene.grid.gridSize,
            fillTarget: scene.grid.fillTarget,
            fillStartFrame: at(scene.grid.start, durationInFrames),
            fillEndFrame: at(scene.grid.end, durationInFrames),
            resultPrefix: scene.grid.resultPrefix,
            resultValue: scene.grid.resultValue,
          }
        : undefined;

      return <ConceptScene heading={scene.heading} breakdown={scene.breakdown} grid={grid} subtitles={subtitles} />;
    }

    case "example": {
      const bars = scene.bars?.map((bar) => ({
        label: bar.label,
        value: bar.value,
        max: bar.max,
        color: COLOR_TOKENS[bar.color],
        growStart: at(bar.growStart, durationInFrames),
        growEnd: at(bar.growEnd, durationInFrames),
      }));

      return (
        <ExampleScene
          heading={scene.heading}
          problemText={scene.problemText}
          bars={bars}
          calcLines={scene.calcLines}
          calcStartFrame={at(scene.calcStartFraction, durationInFrames)}
          calcStagger={at(scene.calcStaggerFraction, durationInFrames)}
          answer={{
            prefix: scene.answer.prefix,
            from: scene.answer.from,
            to: scene.answer.to,
            suffix: scene.answer.suffix,
            startFrame: at(scene.answer.atFraction, durationInFrames),
            durationInFrames: Math.round(scene.answer.durationSeconds * fps),
          }}
          subtitles={subtitles}
        />
      );
    }

    case "formula": {
      const formsStartFrame = scene.forms
        ? at(scene.formsStartFraction ?? DEFAULT_FORMS_START_FRACTION, durationInFrames)
        : undefined;
      const formsStagger = scene.forms
        ? at(scene.formsStaggerFraction ?? DEFAULT_FORMS_STAGGER_FRACTION, durationInFrames)
        : undefined;
      const formsPulseFrame =
        scene.forms && formsStartFrame !== undefined && formsStagger !== undefined
          ? formsStartFrame + formsStagger * (scene.forms.length - 1) + 20
          : undefined;
      const captionFrame = scene.caption && formsPulseFrame !== undefined ? formsPulseFrame + 30 : undefined;

      return (
        <FormulaScene
          heading={scene.heading}
          formulaTokens={scene.formulaTokens}
          forms={scene.forms}
          formsLabel={scene.formsLabel}
          formsStartFrame={formsStartFrame}
          formsStagger={formsStagger}
          formsPulseFrame={formsPulseFrame}
          caption={scene.caption}
          captionFrame={captionFrame}
          subtitles={subtitles}
        />
      );
    }

    case "summary":
      return (
        <SummaryScene
          heading={scene.heading}
          points={scene.points}
          outroStartFrame={at(scene.outroStartFraction, durationInFrames)}
          outroTitle={scene.outroTitle}
          outroSubtitle={scene.outroSubtitle}
          subtitles={subtitles}
        />
      );

    default: {
      const exhaustiveCheck: never = scene;
      throw new Error(`Unhandled scene type: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}
