import type { ReactNode } from "react";
import { CapIcon } from "./icons";
import { identitySlot } from "./identityColor";

/**
 * Consolidates the exam-card markup that used to be duplicated, nearly verbatim, between
 * `practice/PracticeExams.tsx` and `mocktest/MockTestExams.tsx`. Meant to sit inside an
 * `.exam-grid` container (see `styles/index.css`) so it renders 1/2/3/4 to a row depending
 * on viewport width.
 *
 * The icon slot uses `identityKey` (an exam code, ideally) to pick one of six identity
 * colors — see `identityColor.ts` for why this is a rendering choice, not real per-exam
 * data. `imageUrl`, when the admin has actually uploaded exam artwork, replaces the icon
 * entirely rather than sitting alongside a color it would clash with.
 *
 * `variant="all"` is Practice's "browse every exam" shortcut — dashed border, a
 * description instead of a stat line, and spans the full grid row. Mock Test never had
 * this shortcut (a mock paper always belongs to one exam's own structure) and doesn't use it.
 */
export function ExamCard({
  icon = <CapIcon />,
  imageUrl,
  identityKey,
  name,
  subtitle,
  pills,
  onClick,
  variant = "default",
}: {
  icon?: ReactNode;
  imageUrl?: string | null;
  /** Used to pick a stable identity color; falls back to `name` when omitted. */
  identityKey?: string;
  name: string;
  subtitle: ReactNode;
  pills?: ReactNode;
  /** Omit for a purely informational card (e.g. Home's dashboard list) — renders as a
      plain, non-interactive div instead of a button, with no hover/pointer affordance. */
  onClick?: () => void;
  variant?: "default" | "all";
}) {
  const isAll = variant === "all";
  const classes = ["card", "exam-card"];
  if (isAll) classes.push("exam-card-all", "exam-grid-full");
  if (!onClick) classes.push("exam-card-static");

  const slot = identitySlot(identityKey ?? name);
  const iconStyle = imageUrl
    ? undefined
    : { background: `var(--identity-${slot}-bg)`, color: `var(--identity-${slot}-fg)` };

  const content = (
    <>
      <span className="exam-icon" aria-hidden="true" style={iconStyle}>
        {imageUrl ? <img src={imageUrl} alt="" className="exam-icon-image" /> : icon}
      </span>
      <div className="stat-body">
        <div className="stat-name">{name}</div>
        <div className={isAll ? "subtle" : "stat-code"}>{subtitle}</div>
      </div>
      {pills && <div className="exam-card-pills">{pills}</div>}
    </>
  );

  if (!onClick) {
    return <div className={classes.join(" ")}>{content}</div>;
  }

  return (
    <button type="button" className={classes.join(" ")} onClick={onClick}>
      {content}
    </button>
  );
}
