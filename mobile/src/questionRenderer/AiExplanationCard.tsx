import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { AiBulletList, AiCard, AiScoreSummary, AiTipStrip } from "../ui/AiCard";
import { spacing } from "../ui/theme";
import { useThemedStyles, type Theme } from "../ui/ThemeContext";
import { useT } from "../i18n/I18nContext";
import { getCachedQuestionExplanation } from "../db/aiContentLocal";
import { getLocalAiTaskFlags } from "../db/clientConfigLocal";
import type { QuestionExplanation } from "@sarkaritaiyaari/core/ai";

/**
 * TASK-2701 Phase 3 — "Explain with AI", rendered as an enhancement alongside the question's
 * own always-present authored explanation, never in place of it. Renders nothing at all when
 * no published explanation has synced for this question in this language (the common case
 * today, since generation has only run for a handful of real questions) — there is no
 * loading spinner and no empty state, because AI content is Tier 2 of AI_ARCHITECTURE.md's
 * tier model: an enhancement a screen must look correct without.
 *
 * The caller keys this component on the current question's identity (matching GroupContent's
 * own established pattern in this same folder) so React remounts it fresh on every question
 * change, rather than an effect that imperatively resets state — the `set-state-in-effect`
 * violation this codebase has already hit and fixed elsewhere.
 */
export function AiExplanationCard({ questionId, languageCode }: { questionId: string; languageCode: string }) {
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const [explanation, setExplanation] = useState<QuestionExplanation | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Admin-gated per AiTaskFlagService's "unknown means off" rule (AI_ARCHITECTURE.md §4) —
    // checked before even reading the cached explanation, not just before rendering it, so a
    // disabled task never does the extra query for content nobody should see.
    getLocalAiTaskFlags().then((flags) => {
      if (cancelled || flags.QUESTION_EXPLANATION !== true) return;
      getCachedQuestionExplanation(questionId, languageCode).then((result) => {
        if (!cancelled) setExplanation(result);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [questionId, languageCode]);

  if (!explanation) return null;

  return (
    <AiCard
      title={t("common.aiExplanation")}
      subtitle={t("ai.explanationSubtitle")}
      style={styles.card}
    >
      <AiScoreSummary body={explanation.whyCorrect} />
      <AiBulletList
        heading={t("ai.whyOthersWrong")}
        items={explanation.whyOthersWrong.map((entry) => ({
          label: entry.option,
          text: entry.why,
          tone: "danger" as const,
        }))}
      />
      {explanation.examTip ? <AiTipStrip label={t("ai.examTip")} text={explanation.examTip} icon="bulb" /> : null}
    </AiCard>
  );
}

function buildStyles(_theme: Theme) {
  return StyleSheet.create({
    /* Only placement — everything else about the card is owned by `ui/AiCard.tsx`. */
    card: {
      marginTop: spacing.sm,
    },
  });
}
