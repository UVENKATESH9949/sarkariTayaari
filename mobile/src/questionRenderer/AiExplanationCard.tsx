import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { spacing, radius } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
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
  const { colors } = useTheme();
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
    <View style={styles.box}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={16} color={colors.brand.primary} />
        <Text style={styles.label}>{t("common.aiExplanation")}</Text>
      </View>
      <Text style={styles.text}>{explanation.whyCorrect}</Text>
      {explanation.whyOthersWrong.length > 0 && (
        <View style={styles.wrongList}>
          {explanation.whyOthersWrong.map((entry, index) => (
            <Text key={index} style={styles.wrongItem}>
              <Text style={styles.wrongOption}>{entry.option}: </Text>
              {entry.why}
            </Text>
          ))}
        </View>
      )}
      {explanation.examTip && (
        <Text style={styles.tip}>
          <Text style={styles.tipLabel}>{"\u{1F4A1} "}</Text>
          {explanation.examTip}
        </Text>
      )}
    </View>
  );
}

function buildStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    box: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderAccent,
      padding: spacing.md,
      marginTop: spacing.sm,
      gap: spacing.xs,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    label: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.brand.primary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    text: {
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 20,
    },
    wrongList: {
      gap: 4,
    },
    wrongItem: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
    },
    wrongOption: {
      fontWeight: "600",
      color: colors.text.primary,
    },
    tip: {
      fontSize: 13,
      color: colors.text.secondary,
      fontStyle: "italic",
    },
    tipLabel: {
      fontStyle: "normal",
    },
  });
}
