import type { IoniconName } from "../constants/subjects";

/**
 * A small, best-effort keyword→icon lookup for common topic names (mostly Quantitative
 * Aptitude/Reasoning topics, which are shared across nearly every exam in this app).
 *
 * There is no synced per-topic icon anywhere in this app's data model — only subjects carry
 * an admin-set icon/colour (`toSubjectMeta`). Building and maintaining a name-keyed table
 * covering every topic across every subject/exam would be exactly the kind of brittle,
 * unbounded list this codebase avoids elsewhere (subjects/exams read their styling from
 * synced data for that reason). This table is deliberately partial: it only recognizes the
 * handful of Quant/Reasoning topic names that repeat across nearly every exam's syllabus,
 * and falls back to a single generic icon for anything else — never a guess dressed up as
 * a real per-topic icon.
 */
const KEYWORD_ICONS: { keywords: string[]; icon: IoniconName }[] = [
  { keywords: ["percentage"], icon: "pie-chart-outline" },
  { keywords: ["ratio", "proportion"], icon: "git-network-outline" },
  { keywords: ["average"], icon: "bar-chart-outline" },
  { keywords: ["profit", "loss"], icon: "cash-outline" },
  { keywords: ["discount"], icon: "pricetag-outline" },
  { keywords: ["simple interest", "compound interest", "interest"], icon: "albums-outline" },
  { keywords: ["time and work", "time & work", "pipes", "cistern"], icon: "construct-outline" },
  { keywords: ["time, speed", "speed and distance", "boats", "streams", "trains"], icon: "speedometer-outline" },
  { keywords: ["mixture", "alligation"], icon: "flask-outline" },
  { keywords: ["partnership"], icon: "people-outline" },
  { keywords: ["ages"], icon: "hourglass-outline" },
  { keywords: ["mensuration", "geometry"], icon: "shapes-outline" },
  { keywords: ["trigonometry", "height", "distance"], icon: "triangle-outline" },
  { keywords: ["algebra"], icon: "calculator-outline" },
  { keywords: ["number series", "series"], icon: "list-outline" },
  { keywords: ["data interpretation"], icon: "stats-chart-outline" },
  { keywords: ["probability"], icon: "dice-outline" },
  { keywords: ["permutation", "combination"], icon: "shuffle-outline" },
  { keywords: ["number system", "lcm", "hcf"], icon: "layers-outline" },
  { keywords: ["simplification", "approximation"], icon: "swap-horizontal-outline" },
  { keywords: ["blood relation"], icon: "people-circle-outline" },
  { keywords: ["seating", "arrangement"], icon: "grid-outline" },
  { keywords: ["syllogism"], icon: "git-compare-outline" },
  { keywords: ["coding", "decoding"], icon: "key-outline" },
  { keywords: ["direction"], icon: "compass-outline" },
];

const FALLBACK_ICON: IoniconName = "document-text-outline";

/** Best-effort icon for a topic name — see the module comment for why this is deliberately partial. */
export function topicIconFor(topicName: string): IoniconName {
  const name = topicName.toLowerCase();
  for (const entry of KEYWORD_ICONS) {
    if (entry.keywords.some((k) => name.includes(k))) return entry.icon;
  }
  return FALLBACK_ICON;
}
