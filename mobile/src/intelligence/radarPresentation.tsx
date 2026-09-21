import { Ionicons } from "@expo/vector-icons";
import { Text, View, StyleSheet } from "react-native";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import type { RadarReasonCode, TopicHealthStateName } from "@sarkaritaiyaari/core/intelligence";

/**
 * How a radar state is worded and coloured (Weakness Radar v1, §16-§18).
 *
 * Shared by both radar screens so the same state can never be labelled two different things
 * in two places — the failure the exam-structure work called out as its own reason for
 * resolving marking inheritance server-side.
 *
 * ## The copy rules this file exists to enforce
 *
 * §17: encouraging, never judgemental. "Ratio needs more attention right now", never "you are
 * bad at Ratio". Nothing here names the student as the problem.
 *
 * §18: no fake precision. States are words; no label anywhere interpolates a raw score, a
 * coefficient or a confidence value — and §11 keeps confidence out of the payload entirely, so
 * there is nothing here that could leak it even by accident.
 */

/** §16's sections, in the order the payload is already sorted into. */
export const SECTIONS: { state: TopicHealthStateName; title: string; blurb: string }[] = [
  {
    state: "NEEDS_ATTENTION",
    title: "Needs attention",
    blurb: "Highest-value fixes first — weighted by how much each topic matters for this exam.",
  },
  {
    state: "NEEDS_REVISION",
    title: "Worth revising",
    blurb: "You had these. A refresher should bring them straight back.",
  },
  {
    state: "IMPROVING",
    title: "Improving",
    blurb: "Clearly moving in the right direction. Keep going.",
  },
  {
    state: "DEVELOPING",
    title: "Coming along",
    blurb: "Real practice behind these, but not yet enough to call either way.",
  },
  { state: "STRONG", title: "Strong", blurb: "Reliable. Light practice is enough to hold them." },
  {
    state: "INSUFFICIENT_DATA",
    title: "Not started yet",
    blurb: "No practice on these yet — so nothing to judge, good or bad.",
  },
];

type StateVisual = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: (colors: Theme["colors"]) => string;
  bg: (colors: Theme["colors"]) => string;
};

/**
 * Takes the palette rather than reading a module constant, the rule this codebase set when it
 * added the light theme: the dark palette's bright greens are unreadable on white, so a
 * semantic colour cannot be captured at module scope.
 */
export function stateVisual(state: TopicHealthStateName): StateVisual {
  switch (state) {
    case "NEEDS_ATTENTION":
      return {
        label: "Needs attention",
        icon: "alert-circle-outline",
        color: (c) => c.semantic.error,
        bg: (c) => c.semantic.errorBg,
      };
    case "NEEDS_REVISION":
      return {
        label: "Worth revising",
        icon: "refresh-circle-outline",
        color: (c) => c.semantic.warning,
        bg: (c) => c.semantic.warningBg,
      };
    case "IMPROVING":
      return {
        label: "Improving",
        icon: "trending-up-outline",
        color: (c) => c.semantic.success,
        bg: (c) => c.semantic.successBg,
      };
    case "STRONG":
      return {
        label: "Strong",
        icon: "shield-checkmark-outline",
        color: (c) => c.semantic.success,
        bg: (c) => c.semantic.successBg,
      };
    case "DEVELOPING":
      return {
        label: "Coming along",
        icon: "ellipse-outline",
        color: (c) => c.text.secondary,
        bg: (c) => c.surfaceElevated2,
      };
    default:
      return {
        label: "Not started",
        icon: "remove-circle-outline",
        color: (c) => c.text.muted,
        bg: (c) => c.surfaceElevated2,
      };
  }
}

/** The state, as a pill. */
export function RadarStatePill({ state }: { state: TopicHealthStateName }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildPillStyles);
  const visual = stateVisual(state);
  return (
    <View style={[styles.pill, { backgroundColor: visual.bg(colors) }]}>
      <Text style={[styles.pillText, { color: visual.color(colors) }]}>{visual.label}</Text>
    </View>
  );
}

/**
 * Student-facing copy for each reason code (§16/§17).
 *
 * The server also sends a plain English `explanation`, and the cards show it — this map is for
 * the detail screen, which lists every contributing reason rather than one sentence. Both exist
 * because §17 wants the detail screen to explain *why*, and one sentence cannot carry "your
 * recent performance dropped AND exam-style questions are the specific problem AND this topic
 * carries a lot of the paper".
 */
export const REASON_COPY: Record<RadarReasonCode, string> = {
  NOT_ENOUGH_PRACTICE: "Not enough practice here yet to be sure either way.",
  RECENT_DECLINE: "Your recent results are below what you used to manage on this topic.",
  LOW_ACCURACY: "Accuracy is below where you want it for this exam.",
  PYQ_GAP: "Ordinary practice questions go fine, but real exam questions are catching you out.",
  HIGH_VARIANCE: "Results swing a lot between sessions, so the average hides more than it shows.",
  IMPROVING_FAST: "Recent practice is clearly better than your earlier attempts here.",
  STRONG_AND_STABLE: "Steady, accurate, and on enough practice to trust it.",
  PREREQUISITE_GAP: "A topic this one builds on isn't solid yet.",
  HIGH_EXAM_WEIGHT: "This topic carries a lot of this exam, so time here goes further.",
  NO_QUESTIONS_AVAILABLE: "There are no practice questions for this topic and exam yet.",
  STALE_PRACTICE: "This is based on older practice — a fresh set would confirm where you stand.",
};

/**
 * A one-line note about where the radar on screen came from, or null when it is simply fresh.
 *
 * Worth showing rather than hiding: a cached radar is a claim about the past, and a
 * device-only one cannot see practice done on another phone. §21's offline case asks for the
 * last known state to be shown — showing it *as* the last known state is the honest half of
 * that.
 */
export function sourceNote(result: { source: string; fetchedAtMs: number | null }): string | null {
  if (result.source === "server") return null;
  if (result.source === "local") {
    return "Based on practice on this device. Sign in to include practice from your other devices.";
  }
  const age = result.fetchedAtMs === null ? null : Date.now() - result.fetchedAtMs;
  if (age === null) return "Showing the last saved version — you appear to be offline.";
  const hours = Math.floor(age / (60 * 60 * 1000));
  if (hours < 1) return "Showing the last saved version — you appear to be offline.";
  if (hours < 24) return `Showing the version saved ${hours} hour${hours === 1 ? "" : "s"} ago — you appear to be offline.`;
  const days = Math.floor(hours / 24);
  return `Showing the version saved ${days} day${days === 1 ? "" : "s"} ago — you appear to be offline.`;
}

function buildPillStyles(_theme: Theme) {
  return StyleSheet.create({
    pill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
    },
    pillText: {
      fontSize: 11,
      fontWeight: "700",
    },
  });
}

/**
 * The one-line "do this next" label per RecommendedAction.
 *
 * Lives here rather than on a screen because two now render it — the Preparation Radar's topic
 * cards and the Study Roadmap's — and a second copy of this vocabulary is exactly the drift the
 * personalization program spent three phases removing.
 */
export const ACTION_COPY: Record<string, string> = {
  LEARN_CONCEPT: "review the concept",
  PRACTICE_FOUNDATIONAL: "practise the basics",
  PRACTICE_MEDIUM: "practise at exam level",
  PRACTICE_ADVANCED: "try harder questions",
  PRACTICE_PYQ: "solve real exam questions",
  TIMED_PRACTICE: "take a timed set",
  REVISION: "revise this topic",
  MAINTENANCE_PRACTICE: "keep it ticking over",
  GATHER_EVIDENCE: "practise a few questions",
};
