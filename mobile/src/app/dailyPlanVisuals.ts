import type { DailyPlanTaskSource } from "@sarkaritaiyaari/core/api";
import type { IoniconName } from "../constants/subjects";
import type { Theme } from "../ui/ThemeContext";

/**
 * How each of the daily plan's five learning purposes looks, and a cosmetic per-topic icon.
 *
 * The server sends no colour and no icon — `DailyPlanTask` carries ids, names and a `source` (see
 * `@sarkaritaiyaari/core/api`'s dailyPlan.ts) — so everything here is a local presentation choice,
 * recomputed on every render and safe to change without touching the backend.
 *
 * <b>Colour is per purpose, not per card.</b> Each of the five sections keeps one colour throughout,
 * so a rose card always means "weak topic" wherever it appears and the jump pill at the top of the
 * screen matches the section it scrolls to. An earlier version cycled the palette per card position,
 * which looked livelier and told the student nothing.
 */

export type TaskAccent = {
  iconBg: string;
  iconFg: string;
  pillBg: string;
  pillFg: string;
};

const LIGHT_ACCENTS: TaskAccent[] = [
  { iconBg: "#FCE4EA", iconFg: "#DB3A63", pillBg: "#FCE4EA", pillFg: "#C22753" },
  { iconBg: "#DFF3E7", iconFg: "#159957", pillBg: "#DFF3E7", pillFg: "#0F7A45" },
  { iconBg: "#ECE3FB", iconFg: "#7C4FD6", pillBg: "#ECE3FB", pillFg: "#6B3FC0" },
  { iconBg: "#DCEBFC", iconFg: "#2F6FE0", pillBg: "#DCEBFC", pillFg: "#1F55BF" },
  { iconBg: "#FCEED9", iconFg: "#C77F1A", pillBg: "#FCEED9", pillFg: "#A8690F" },
];

const DARK_ACCENTS: TaskAccent[] = [
  { iconBg: "rgba(244, 63, 94, 0.16)", iconFg: "#FB7185", pillBg: "rgba(244, 63, 94, 0.16)", pillFg: "#FB7185" },
  { iconBg: "rgba(16, 185, 129, 0.16)", iconFg: "#34D399", pillBg: "rgba(16, 185, 129, 0.16)", pillFg: "#34D399" },
  { iconBg: "rgba(139, 92, 246, 0.18)", iconFg: "#A78BFA", pillBg: "rgba(139, 92, 246, 0.18)", pillFg: "#A78BFA" },
  { iconBg: "rgba(56, 189, 248, 0.16)", iconFg: "#38BDF8", pillBg: "rgba(56, 189, 248, 0.16)", pillFg: "#38BDF8" },
  { iconBg: "rgba(245, 158, 11, 0.16)", iconFg: "#FBBF24", pillBg: "rgba(245, 158, 11, 0.16)", pillFg: "#FBBF24" },
];

export function taskAccent(index: number, mode: Theme["mode"]): TaskAccent {
  const list = mode === "light" ? LIGHT_ACCENTS : DARK_ACCENTS;
  return list[((index % list.length) + list.length) % list.length];
}

/** What a section is called, how it reads, and which accent slot it owns. */
export type SourceMeta = {
  /** Section heading. */
  title: string;
  /** One line under the heading, saying what this purpose is for. */
  subtitle: string;
  /** Short label for the jump pill at the top of the screen. */
  shortLabel: string;
  icon: IoniconName;
  /** The verb on a task card's own action pill. */
  actionLabel: string;
  actionIcon: IoniconName;
  accentIndex: number;
};

/**
 * The five purposes, in the order they are shown. Deliberately the product's own reading order
 * (new ground first), which is not the order the planner fills them in — the server packs revision
 * first, and `displayOrder` preserves that inside each section.
 */
export const SOURCE_ORDER: DailyPlanTaskSource[] = [
  "NEW_TOPIC",
  "REVISION",
  "WEAK_TOPIC",
  "STRENGTHEN",
  "MISTAKE_REVIEW",
];

export const SOURCE_META: Record<DailyPlanTaskSource, SourceMeta> = {
  NEW_TOPIC: {
    title: "New Topics",
    subtitle: "Fresh ground to cover",
    shortLabel: "New",
    icon: "sparkles-outline",
    actionLabel: "Start",
    actionIcon: "arrow-forward",
    accentIndex: 2,
  },
  REVISION: {
    title: "Revision",
    subtitle: "Keep your concepts strong",
    shortLabel: "Revise",
    icon: "refresh-outline",
    actionLabel: "Revise",
    actionIcon: "refresh-outline",
    accentIndex: 3,
  },
  WEAK_TOPIC: {
    title: "Weak Topics",
    subtitle: "Where you need the most work",
    shortLabel: "Weak",
    icon: "alert-circle-outline",
    actionLabel: "Practise",
    actionIcon: "arrow-forward",
    accentIndex: 0,
  },
  STRENGTHEN: {
    title: "Practice",
    subtitle: "Lock in what you have started",
    shortLabel: "Practice",
    icon: "trending-up-outline",
    actionLabel: "Practise",
    actionIcon: "arrow-forward",
    accentIndex: 1,
  },
  MISTAKE_REVIEW: {
    title: "Mistake Review",
    subtitle: "Questions you got wrong before",
    shortLabel: "Mistakes",
    icon: "close-circle",
    actionLabel: "Review",
    actionIcon: "arrow-forward",
    accentIndex: 4,
  },
};

/**
 * A source this build does not recognise — a server older than migration V52 still sending
 * `PRACTICE`, or a purpose added after this app shipped. Treated as new ground rather than dropped,
 * so an unknown task is still visible and still tappable.
 */
export const FALLBACK_SOURCE: DailyPlanTaskSource = "NEW_TOPIC";

export function sourceMeta(source: string): SourceMeta {
  return SOURCE_META[source as DailyPlanTaskSource] ?? SOURCE_META[FALLBACK_SOURCE];
}

export function sourceAccent(source: string, mode: Theme["mode"]): TaskAccent {
  return taskAccent(sourceMeta(source).accentIndex, mode);
}

/**
 * A small keyword guess at a topic-relevant icon, purely cosmetic. A miss falls through to the
 * purpose's own icon rather than risking an unknown glyph name.
 */
const ICON_KEYWORDS: [RegExp, IoniconName][] = [
  [/train/i, "train-outline"],
  [/boat|stream/i, "boat-outline"],
  [/pipe|cistern|tank|water/i, "water-outline"],
  [/speed|distance|time\s*&?\s*work|work\s*&?\s*time/i, "speedometer-outline"],
  [/percent/i, "pie-chart-outline"],
  [/profit|loss|interest|discount/i, "cash-outline"],
  [/ratio|proportion|compar/i, "git-compare-outline"],
  [/algebra|equation|simplif/i, "calculator-outline"],
  [/geometry|mensuration|area|volume|triangle|circle/i, "shapes-outline"],
  [/syllogism|statement|venn|logic/i, "document-text-outline"],
  [/analog|series|coding|pattern/i, "list-outline"],
  [/blood relation|family/i, "people-outline"],
  [/direction/i, "compass-outline"],
  [/seating|arrangement|puzzle/i, "grid-outline"],
  [/calendar|date/i, "calendar-outline"],
  [/clock/i, "time-outline"],
  [/vocabulary|grammar|idiom|tense|spelling|comprehension|sentence|english/i, "book-outline"],
  [/history|polity|geography|science|computer|current affairs|awards|static gk|general awareness|sports/i, "earth"],
];

export function taskIcon(topicName: string, source: string): IoniconName {
  for (const [pattern, icon] of ICON_KEYWORDS) {
    if (pattern.test(topicName)) return icon;
  }
  return sourceMeta(source).icon;
}
