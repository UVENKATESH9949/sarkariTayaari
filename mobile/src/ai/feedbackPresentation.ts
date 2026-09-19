import type { Translate } from "@sarkaritaiyaari/core/i18n";
import type { AiTileItem, AiTone } from "../ui/AiCard";
import type { IoniconName } from "../constants/subjects";

/**
 * The deterministic half of an AI feedback card.
 *
 * The narrative itself is model output; everything here is not, and that separation is
 * deliberate. The badge, the next-step tiles and the focus-row subtitle are chosen by fixed
 * rules from numbers the screen already displays (accuracy, how many were wrong), exactly like
 * `sessionFeedbackTemplate` in `packages/core` — they are ordinary UI copy, not a personalised
 * claim, and they say nothing about the student that the score line above them does not already
 * say. Keeping them out of the prompt is also what stops the card looking emptier when the
 * model is unreachable: the layout is identical either way.
 *
 * Shared by Practice Summary and Mock Test Result, which show the same card with different
 * titles — the band thresholds match `scoreTone` on both screens, so the pill can never
 * disagree with the colour of the score beside it.
 */

export type AccuracyBand = "low" | "mid" | "high";

export function accuracyBand(accuracyPercent: number): AccuracyBand {
  if (accuracyPercent >= 70) return "high";
  if (accuracyPercent >= 40) return "mid";
  return "low";
}

/** The header pill. Encouraging at every band — a low score is where a discouraging label would do the most damage. */
export function feedbackBadge(band: AccuracyBand, t: Translate): { label: string; icon: IoniconName; tone: AiTone } {
  switch (band) {
    case "high":
      return { label: t("ai.badgeStrong"), icon: "trophy", tone: "success" };
    case "mid":
      return { label: t("ai.badgeGoodPace"), icon: "trending-up", tone: "warning" };
    case "low":
    default:
      return { label: t("ai.badgeKeepGoing"), icon: "flash", tone: "brand" };
  }
}

/** One line under the focus topic. Describes the session's own result, never a trend it cannot see. */
export function focusSubtitle(band: AccuracyBand, t: Translate): string {
  switch (band) {
    case "high":
      return t("ai.focusSubtitleHigh");
    case "mid":
      return t("ai.focusSubtitleMid");
    case "low":
    default:
      return t("ai.focusSubtitleLow");
  }
}

/**
 * Three next steps, by band.
 *
 * "Revisit mistakes" is included only when there genuinely are wrong answers to revisit — a
 * clean sheet must never be told to go back over its errors, which is the one way this
 * fixed-copy block could state something false.
 */
export function nextStepTiles(band: AccuracyBand, incorrectCount: number, t: Translate): AiTileItem[] {
  const revisit: AiTileItem = {
    icon: "refresh",
    title: t("ai.tileRevisitTitle"),
    body: t("ai.tileRevisitBody"),
    tone: "warning",
  };
  const practise: AiTileItem = {
    icon: "barbell",
    title: t("ai.tilePracticeTitle"),
    body: t("ai.tilePracticeBody"),
    tone: "success",
  };

  const byBand: Record<AccuracyBand, AiTileItem[]> = {
    low: [
      practise,
      { icon: "book", title: t("ai.tileReviewTitle"), body: t("ai.tileReviewBody"), tone: "brand" },
      revisit,
    ],
    mid: [
      practise,
      { icon: "locate", title: t("ai.tileAccuracyTitle"), body: t("ai.tileAccuracyBody"), tone: "brand" },
      revisit,
    ],
    high: [
      { icon: "timer", title: t("ai.tileSpeedTitle"), body: t("ai.tileSpeedBody"), tone: "success" },
      { icon: "trending-up", title: t("ai.tileStretchTitle"), body: t("ai.tileStretchBody"), tone: "brand" },
      revisit,
    ],
  };

  return byBand[band].filter((tile) => tile !== revisit || incorrectCount > 0);
}
