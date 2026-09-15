import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { spacing, radius } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import {
  getOrBuildMistakeAnalysis,
  type MistakeAnalysisInput,
} from "../ai/mistakeAnalysis";
import type { MistakeAnalysis } from "@sarkaritaiyaari/core/ai";

/**
 * TASK-2701 Phase 7.4 — "Why did I get this wrong?" in Revise → Wrong Answers.
 *
 * Unlike `AiExplanationCard`, which renders whatever has already synced, this one costs a real
 * model call, so it is **tap-driven**: nothing happens until the student asks. That is a product
 * decision as much as a cost one — an unsolicited diagnosis under every wrong answer reads as
 * nagging, while one the student asked for reads as help.
 *
 * Renders nothing at all until tapped, and nothing afterwards if the task is disabled — the same
 * Tier-2 rule the rest of this folder follows: the screen must look correct without it.
 */

/** Plain-language labels for the shared taxonomy — a student should never see a raw enum. */
const MISTAKE_LABELS: Record<MistakeAnalysis["mistakeType"], string> = {
  KNOWLEDGE_GAP: "Not learned yet",
  CONCEPT_CONFUSION: "Concepts mixed up",
  CALCULATION_ERROR: "Calculation slip",
  MISREADING: "Misread the question",
  GUESSING: "Looks like a guess",
  TIME_PRESSURE: "Rushed",
  SIMILAR_OPTION_CONFUSION: "Close options",
  MEMORY_FAILURE: "Slipped from memory",
  REPEATED_MISTAKE: "Missed this before",
};

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; analysis: MistakeAnalysis }
  | { phase: "unavailable" };

export function MistakeAnalysisCard({ input }: { input: MistakeAnalysisInput }) {
  const styles = useThemedStyles(buildStyles);
  const { colors } = useTheme();
  const [state, setState] = useState<State>({ phase: "idle" });

  async function handlePress() {
    setState({ phase: "loading" });
    try {
      const analysis = await getOrBuildMistakeAnalysis(input);
      setState(analysis ? { phase: "done", analysis } : { phase: "unavailable" });
    } catch {
      // Never surfaces an error to the student: this is an enhancement, and the authored
      // explanation directly above it already answers the question adequately.
      setState({ phase: "unavailable" });
    }
  }

  if (state.phase === "unavailable") return null;

  if (state.phase === "idle" || state.phase === "loading") {
    return (
      <Pressable
        style={styles.askButton}
        onPress={handlePress}
        disabled={state.phase === "loading"}
        accessibilityRole="button"
      >
        {state.phase === "loading" ? (
          <ActivityIndicator size="small" color={colors.brand.primary} />
        ) : (
          <Ionicons name="sparkles" size={16} color={colors.brand.primary} />
        )}
        <Text style={styles.askButtonText}>
          {state.phase === "loading" ? "Thinking..." : "Why did I get this wrong?"}
        </Text>
      </Pressable>
    );
  }

  const { analysis } = state;
  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={16} color={colors.brand.primary} />
        <Text style={styles.label}>Mistake analysis</Text>
      </View>
      <View style={styles.typePill}>
        <Text style={styles.typePillText}>{MISTAKE_LABELS[analysis.mistakeType]}</Text>
      </View>
      <Text style={styles.text}>{analysis.explanation}</Text>
      <Text style={styles.action}>
        <Text style={styles.actionLabel}>{"\u{1F3AF} "}</Text>
        {analysis.suggestedAction}
      </Text>
    </View>
  );
}

function buildStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    askButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      marginTop: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderAccent,
      backgroundColor: colors.surface,
    },
    askButtonText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.brand.primary,
    },
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
    typePill: {
      alignSelf: "flex-start",
      paddingVertical: 2,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceElevated2,
    },
    typePillText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    text: {
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 20,
    },
    action: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
    },
    actionLabel: {
      fontStyle: "normal",
    },
  });
}
