import type { Theme } from "../ui/ThemeContext";
import type { IoniconName } from "../constants/subjects";

/**
 * Display copy for the Exams module's card — the server computes `status` (a raw
 * RecruitmentCycleStatus name) and `primaryAction` (spec §52's "one primary action per
 * lifecycle state"); this maps both to human copy + colour + icon. Deliberately
 * client-side rather than sent from the backend: the backend has no reason to know
 * about mobile-specific icon names or exact wording.
 */

const STATUS_LABELS: Record<string, string> = {
  NOT_ANNOUNCED: "Not announced yet",
  NOTIFICATION_EXPECTED: "Notification expected",
  NOTIFICATION_RELEASED: "Notification released",
  APPLICATION_OPEN: "Applications open",
  APPLICATION_CLOSING_SOON: "Closing soon",
  APPLICATION_CLOSED: "Applications closed",
  CORRECTION_WINDOW_OPEN: "Correction window open",
  ADMIT_CARD_RELEASED: "Admit card released",
  EXAM_UPCOMING: "Exam upcoming",
  EXAM_ONGOING: "Exam ongoing",
  ANSWER_KEY_RELEASED: "Answer key released",
  RESULT_RELEASED: "Result released",
  CUTOFF_RELEASED: "Cutoff released",
  FINAL_RESULT: "Final result out",
  RECRUITMENT_COMPLETED: "Recruitment completed",
};

export function statusLabel(status: string | null): string {
  if (!status) return "No active cycle";
  return STATUS_LABELS[status] ?? status;
}

export function statusTone(status: string | null, closingSoon: boolean, colors: Theme["colors"]) {
  if (closingSoon) return { color: colors.semantic.error, bg: colors.semantic.errorBg };
  if (status === "APPLICATION_OPEN") return { color: colors.semantic.success, bg: colors.semantic.successBg };
  if (status === "RESULT_RELEASED" || status === "FINAL_RESULT" || status === "CUTOFF_RELEASED") {
    return { color: colors.brand.light, bg: colors.surfaceElevated2 };
  }
  if (!status) return { color: colors.text.muted, bg: colors.surfaceElevated2 };
  return { color: colors.semantic.warning, bg: colors.semantic.warningBg };
}

const PRIMARY_ACTION_LABELS: Record<string, string> = {
  APPLY_NOW: "Apply Now",
  PREPARE_NOW: "Prepare Now",
  VIEW_EXAM: "View Exam",
  VIEW_RESULT_INFO: "View Result Info",
};

const PRIMARY_ACTION_ICONS: Record<string, IoniconName> = {
  APPLY_NOW: "open-outline",
  PREPARE_NOW: "book-outline",
  VIEW_EXAM: "information-circle-outline",
  VIEW_RESULT_INFO: "trophy-outline",
};

export function primaryActionLabel(action: string): string {
  return PRIMARY_ACTION_LABELS[action] ?? "View Exam";
}

export function primaryActionIcon(action: string): IoniconName {
  return PRIMARY_ACTION_ICONS[action] ?? "information-circle-outline";
}
