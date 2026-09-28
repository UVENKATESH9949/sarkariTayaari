import React from "react";
import { Composition } from "remotion";
import { VIDEO_FORMATS } from "@sarkaritaayari/shared";
import { PercentageBasics, PERCENTAGE_BASICS_DURATION_IN_FRAMES } from "./lessons/percentageBasics";
import { SimpleInterestBasics, SIMPLE_INTEREST_BASICS_DURATION_IN_FRAMES } from "./lessons/simpleInterestBasics";
import { ProfitAndLoss, PROFIT_AND_LOSS_DURATION_IN_FRAMES } from "./lessons/profitAndLoss";

const { width, height, fps } = VIDEO_FORMATS.landscape;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PercentageBasics"
        component={PercentageBasics}
        durationInFrames={PERCENTAGE_BASICS_DURATION_IN_FRAMES}
        fps={fps}
        width={width}
        height={height}
      />
      <Composition
        id="SimpleInterestBasics"
        component={SimpleInterestBasics}
        durationInFrames={SIMPLE_INTEREST_BASICS_DURATION_IN_FRAMES}
        fps={fps}
        width={width}
        height={height}
      />
      <Composition
        id="ProfitAndLoss"
        component={ProfitAndLoss}
        durationInFrames={PROFIT_AND_LOSS_DURATION_IN_FRAMES}
        fps={fps}
        width={width}
        height={height}
      />
    </>
  );
};
