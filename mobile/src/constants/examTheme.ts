import type { IoniconName } from "./subjects";

export type ExamGradient = {
  icon: IoniconName;
  /** Two-stop gradient for `expo-linear-gradient`, dark corner to darker corner (135deg). */
  colors: readonly [string, string];
};

/**
 * Client-side visual grouping only — there is no real "board/organization" entity
 * (confirmed absent from both backend and mobile schema). This exists purely so exam
 * cards get a distinct, consistent icon treatment per family, matching the redesign
 * mockups' SSC/IBPS/RRB grouping, extended to the app's other real exam-code prefixes.
 * An exam code that doesn't match any known prefix falls back to a deterministic pick
 * from the same palette, so a newly added exam still looks intentional without a
 * code change here.
 */
const FAMILY_GRADIENTS: Record<string, ExamGradient> = {
  SSC: { icon: "document-text-outline", colors: ["#22345E", "#16223F"] },
  IBPS: { icon: "briefcase-outline", colors: ["#3A2258", "#241539"] },
  RRB: { icon: "train-outline", colors: ["#0F3B37", "#0A2724"] },
  UPSC: { icon: "shield-outline", colors: ["#4A2130", "#2E1420"] },
  RBI: { icon: "business-outline", colors: ["#4A3B1A", "#2E2410"] },
  LIC: { icon: "wallet-outline", colors: ["#1B3A4A", "#122530"] },
};

const FALLBACK_ORDER = Object.values(FAMILY_GRADIENTS);

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** e.g. "SSC_CGL" -> "SSC", "RRB_GROUP_D" -> "RRB". */
function familyPrefix(examCode: string): string {
  return examCode.split("_")[0] ?? examCode;
}

export function getExamGradient(examCode: string): ExamGradient {
  const known = FAMILY_GRADIENTS[familyPrefix(examCode)];
  if (known) return known;
  return FALLBACK_ORDER[hashCode(examCode) % FALLBACK_ORDER.length];
}
