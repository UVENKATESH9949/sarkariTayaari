import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TopicProgressState, TopicTrendDirection } from "../db/topicIntelligence";
import { colors, radius, spacing } from "./theme";

/**
 * The small chips that render Epic L's topic model on a list row — mastery state, computed
 * priority, PYQ trend, and paper weightage.
 *
 * Shared rather than inlined into the Topics screen, because the Preparation Plan card on Home
 * shows the same four facts about the same topics and two copies would drift apart the first
 * time a colour or threshold changed.
 */

/* ------------------------------------------------------------------- Mastery state */

const STATE_STYLE: Record<
  TopicProgressState,
  { label: string; color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>["name"] }
> = {
  // NOT_STARTED gets muted tones and is usually not rendered at all — see MasteryChip. Colouring
  // it would put a badge on almost every row of a fresh install, which says nothing.
  NOT_STARTED: {
    label: "Not started",
    color: colors.text.muted,
    bg: colors.surfaceElevated2,
    icon: "ellipse-outline",
  },
  LEARNING: {
    label: "Learning",
    color: colors.brand.light,
    bg: colors.brand.glowSoft,
    icon: "book-outline",
  },
  PRACTICING: {
    label: "Practising",
    color: colors.semantic.warning,
    bg: colors.semantic.warningBg,
    icon: "barbell-outline",
  },
  MASTERED: {
    label: "Mastered",
    color: colors.semantic.success,
    bg: colors.semantic.successBg,
    icon: "checkmark-circle",
  },
  // Deliberately warning-toned, not error-toned: a regression is a prompt to revise, not a
  // failure, and colouring it red would read as the app telling the student they are bad at it.
  NEEDS_REVISION: {
    label: "Needs revision",
    color: colors.semantic.hot,
    bg: colors.semantic.hotBg,
    icon: "refresh-circle",
  },
};

type MasteryChipProps = {
  state: TopicProgressState;
  accuracyPercent?: number | null;
  /** Show the chip even for NOT_STARTED. Off by default. */
  showNotStarted?: boolean;
};

export function MasteryChip({ state, accuracyPercent, showNotStarted = false }: MasteryChipProps) {
  if (state === "NOT_STARTED" && !showNotStarted) return null;
  const tone = STATE_STYLE[state];

  // Accuracy is appended only when the state itself implies real history. Showing "Learning ·
  // 100%" after one lucky question would overstate what the app actually knows.
  const showAccuracy =
    accuracyPercent !== null &&
    accuracyPercent !== undefined &&
    (state === "PRACTICING" || state === "MASTERED" || state === "NEEDS_REVISION");

  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }]}>
      <Ionicons name={tone.icon} size={11} color={tone.color} />
      <Text style={[styles.chipText, { color: tone.color }]}>
        {tone.label}
        {showAccuracy ? ` · ${Math.round(accuracyPercent!)}%` : ""}
      </Text>
    </View>
  );
}

/* --------------------------------------------------------------------------- Trend */

const TREND_STYLE: Record<
  TopicTrendDirection,
  { label: string; color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>["name"] } | null
> = {
  RISING: {
    label: "Rising",
    color: colors.semantic.hot,
    bg: colors.semantic.hotBg,
    icon: "trending-up",
  },
  FALLING: {
    label: "Falling",
    color: colors.text.muted,
    bg: colors.surfaceElevated2,
    icon: "trending-down",
  },
  // Both of these render nothing. "Stable" is the default state of most topics and a chip on
  // every row carries no information; INSUFFICIENT_DATA means the app genuinely does not know,
  // and inventing a neutral label there would imply it does.
  STABLE: null,
  INSUFFICIENT_DATA: null,
};

export function TrendChip({ direction }: { direction: TopicTrendDirection | null }) {
  if (!direction) return null;
  const tone = TREND_STYLE[direction];
  if (!tone) return null;

  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }]}>
      <Ionicons name={tone.icon} size={11} color={tone.color} />
      <Text style={[styles.chipText, { color: tone.color }]}>{tone.label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------------ Priority */

/**
 * Priority is shown as a band, not a raw number.
 *
 * A "78/100" would imply a precision the score does not have — it is a weighted blend of a
 * curated weightage, a trend over a handful of tagged years, and how well the bank covers the
 * topic. Three bands is roughly the resolution the underlying data supports.
 */
function priorityBand(priority: number): { label: string; color: string; bg: string } | null {
  if (priority >= 70) {
    return { label: "High priority", color: colors.semantic.error, bg: colors.semantic.errorBg };
  }
  if (priority >= 45) {
    return { label: "Medium priority", color: colors.semantic.warning, bg: colors.semantic.warningBg };
  }
  // Low priority renders nothing: the useful signal is "focus here", and labelling the long tail
  // would just add noise to most rows.
  return null;
}

type PriorityChipProps = {
  finalPriority: number | null;
  /** Non-null when a human overrode the computed score. */
  adminOverride?: number | null;
};

export function PriorityChip({ finalPriority, adminOverride }: PriorityChipProps) {
  if (finalPriority === null || finalPriority === undefined) return null;
  const band = priorityBand(finalPriority);
  if (!band) return null;

  return (
    <View style={[styles.chip, { backgroundColor: band.bg }]}>
      <Ionicons name="flame" size={11} color={band.color} />
      <Text style={[styles.chipText, { color: band.color }]}>{band.label}</Text>
      {/* A curated figure and a computed one have to stay distinguishable all the way to the
          screen - that is the whole point of storing them separately (source spec section 66).
          A student seeing "High priority" deserves to know a teacher said so, not a formula. */}
      {adminOverride !== null && adminOverride !== undefined && (
        <Ionicons name="person" size={9} color={band.color} />
      )}
    </View>
  );
}

/* ----------------------------------------------------------------------- Weightage */

type WeightageChipProps = {
  curatedWeightagePercent: number | null;
  computedWeightagePercent: number | null;
};

/**
 * Shows the paper share, preferring the figure derived from previous-year questions and falling
 * back to the admin's curated one.
 *
 * The preference order matters and is the same one the priority formula uses: evidence from real
 * papers beats an estimate. When neither exists the chip is absent rather than showing 0%, which
 * would assert the topic is worth nothing.
 */
export function WeightageChip({
  curatedWeightagePercent,
  computedWeightagePercent,
}: WeightageChipProps) {
  const value = computedWeightagePercent ?? curatedWeightagePercent;
  if (value === null || value === undefined) return null;

  return (
    <View style={[styles.chip, { backgroundColor: colors.surfaceElevated2 }]}>
      <Ionicons name="pie-chart-outline" size={11} color={colors.text.secondary} />
      <Text style={[styles.chipText, { color: colors.text.secondary }]}>
        {value < 0.1 ? "<0.1" : value.toFixed(1)}% of paper
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------- Prerequisites */

type PrerequisiteNoticeProps = {
  unmet: { topicId: string; topicName: string }[];
};

/**
 * A hint, never a lock.
 *
 * The topic stays fully tappable. Epic D will use this graph to *order* recommendations; using it
 * to forbid practice would be a worse product — a student revising for an exam next week must be
 * able to open whatever they want, and an app that refuses is one they stop trusting.
 */
export function PrerequisiteNotice({ unmet }: PrerequisiteNoticeProps) {
  if (unmet.length === 0) return null;

  const names = unmet.slice(0, 2).map((p) => p.topicName).join(", ");
  const extra = unmet.length > 2 ? ` +${unmet.length - 2} more` : "";

  return (
    <View style={styles.prerequisite}>
      <Ionicons name="git-branch-outline" size={11} color={colors.text.muted} />
      <Text style={styles.prerequisiteText} numberOfLines={1}>
        Best after: {names}
        {extra}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  chipText: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  prerequisite: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 1,
    marginTop: spacing.xs + 2,
  },
  prerequisiteText: {
    fontSize: 11,
    color: colors.text.muted,
    flexShrink: 1,
  },
});
