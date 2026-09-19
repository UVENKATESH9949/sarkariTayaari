import type { ExamCard } from "@sarkaritaiyaari/core/api";
import { IDENTITY_DARK } from "../theme/applyTheme";

/**
 * Groups exams into browsing rows for Home's hero+rows layout.
 *
 * `ExamCard.category` is real admin data (see admin's `Exams.jsx` `EXAM_CATEGORIES`
 * dropdown — SSC/Banking/Railways/UPSC/etc.), but checked directly against the live API:
 * every one of the 11 currently-active exams has it unset. Rather than collapse everything
 * into one undifferentiated row, this falls back to reading the exam CODE's own prefix
 * (SSC_CGL is an SSC exam) — a real fact about the exam's name, not an invented one, and
 * the same category vocabulary the admin dropdown already uses. The real field always wins
 * the moment an admin sets it; this is a disclosed, temporary stand-in, not presented as
 * curated data.
 */
export const CATEGORY_ORDER = [
  "Popular",
  "SSC",
  "Banking & Insurance",
  "Railways",
  "UPSC & Civil Services",
  "Other Exams",
] as const;

export function deriveCategory(exam: { category: string | null; examCode: string }): string {
  if (exam.category) return exam.category;
  const code = exam.examCode;
  if (/^SSC/.test(code)) return "SSC";
  if (/^(IBPS|RBI|LIC)/.test(code)) return "Banking & Insurance";
  if (/^RRB/.test(code)) return "Railways";
  if (/^UPSC/.test(code)) return "UPSC & Civil Services";
  return "Other Exams";
}

/**
 * Maps a category to one of the six shared "identity" slots (`--identity-{n}-fg/bg` in
 * `applyTheme.ts`) — fixed per category rather than hashed, so "SSC" is always teal and
 * "Railways" is always violet instead of a color that shifts as exams are added/removed.
 * "Popular" deliberately isn't here — it uses the semantic "hot"/trending token instead,
 * the same one mobile's PYQ badge already uses for "asked recently", not a seventh color.
 */
const CATEGORY_IDENTITY_SLOT: Record<string, number> = {
  SSC: 2,
  "Banking & Insurance": 3,
  Railways: 1,
  "UPSC & Civil Services": 0,
  "Other Exams": 5,
};

export function categoryIdentitySlot(category: string): number {
  return CATEGORY_IDENTITY_SLOT[category] ?? 5;
}

const POPULAR_GLOW_HEX = "#FF8A65"; // semantic "hot"/trending, dark-theme value — see palettes.ts

/** A real hex value (always the dark-theme identity color, since the spotlight card is
 *  always dark) for the card's glow — a CSS `radial-gradient()` can't blend a `var()`
 *  reference with an alpha suffix, so this needs the literal value, not the token name. */
export function categoryGlowHex(category: string): string {
  if (category === "Popular") return POPULAR_GLOW_HEX;
  return IDENTITY_DARK[categoryIdentitySlot(category)].fg;
}

/**
 * The short abbreviation shown as a large watermark on a spotlight card with no real photo
 * — derived from the exam's own code (SSC_CGL -> CGL, RRB_NTPC -> NTPC), never invented.
 * Drops a recognised organisation prefix when the code has one; otherwise shows the whole
 * code untouched.
 */
export function posterWatermark(examCode: string): string {
  const parts = examCode.split("_");
  return parts.length > 1 ? parts.slice(1).join(" ") : examCode;
}

export type ExamRowGroup = { category: string; exams: ExamCard[] };

/** The "Popular" row is exams carrying any admin-set editorial badge — real, not invented,
 *  data — and an exam can legitimately appear in both that row and its category row. */
export function groupExamsByCategory(exams: ExamCard[]): ExamRowGroup[] {
  const groups = new Map<string, ExamCard[]>();

  const popular = exams.filter((e) => e.badge);
  if (popular.length > 0) groups.set("Popular", popular);

  for (const exam of exams) {
    const category = deriveCategory(exam);
    const list = groups.get(category) ?? [];
    list.push(exam);
    groups.set(category, list);
  }

  return CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => ({
    category,
    exams: groups.get(category)!,
  }));
}
