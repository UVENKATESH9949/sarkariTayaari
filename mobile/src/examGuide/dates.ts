import type { Theme } from "../ui/ThemeContext";

/**
 * Shared by the Exam Guide screen and Home's deadline-countdown card (Exam Guide spec
 * §38) — extracted so both read the same countdown/tier for the same date instead of
 * two independent implementations drifting apart.
 */

export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Days from today to `iso`, or null if there's no date. Negative means the date has
 * passed — callers decide what that means (e.g. "closed" rather than a negative countdown).
 */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Doc 1 §67 "Notification / Deadline Priority" — the spec's own four tiers (Critical/
 * High/Normal/Informational), collapsed to thresholds since the spec gives examples
 * ("today", "3 days", "45 days") rather than exact cutoffs. Negative/null (already
 * passed, or no date) has no tier — callers check for that separately.
 */
export function priorityTier(daysRemaining: number, colors: Theme["colors"]): { label: string; color: string } {
  if (daysRemaining <= 0) return { label: "Today", color: colors.semantic.error };
  if (daysRemaining <= 3) return { label: "Critical", color: colors.semantic.error };
  if (daysRemaining <= 14) return { label: "High", color: colors.semantic.warning };
  if (daysRemaining <= 45) return { label: "Upcoming", color: colors.brand.light };
  return { label: "Later", color: colors.text.muted };
}
