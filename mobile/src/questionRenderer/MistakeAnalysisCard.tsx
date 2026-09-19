import { useState } from "react";
import { StyleSheet } from "react-native";
import { AiAskButton, AiCard, AiScoreSummary, AiTipStrip } from "../ui/AiCard";
import { spacing } from "../ui/theme";
import { useThemedStyles, type Theme } from "../ui/ThemeContext";
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
      <AiAskButton
        label={state.phase === "loading" ? "Thinking..." : "Why did I get this wrong?"}
        loading={state.phase === "loading"}
        onPress={handlePress}
      />
    );
  }

  const { analysis } = state;
  return (
    <AiCard
      title="Mistake analysis"
      subtitle="Why this one went wrong"
      /* The taxonomy value the model returned, in plain words — a real classification, not a
         mood. Warning rather than danger: the point is what to fix, not that it was wrong. */
      badge={{ label: MISTAKE_LABELS[analysis.mistakeType], icon: "alert-circle", tone: "warning" }}
      style={styles.card}
    >
      <AiScoreSummary body={analysis.explanation} />
      <AiTipStrip label="What to do next" text={analysis.suggestedAction} icon="flag" tone="success" />
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
