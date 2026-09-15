import type { ReactNode } from "react";

/**
 * A typed wrapper around `.pill`. `color`/`background` let an admin-curated badge (exam
 * difficulty/status, set from the database) override the tone's default colors — the same
 * inline-style pattern `PracticeExams.tsx` already used per-call-site, now centralized.
 */
type BadgeTone = "neutral" | "success" | "error";

export function Badge({
  tone = "neutral",
  color,
  background,
  children,
}: {
  tone?: BadgeTone;
  color?: string | null;
  background?: string | null;
  children: ReactNode;
}) {
  const classes = ["pill"];
  if (tone === "success") classes.push("pill-success");
  if (tone === "error") classes.push("pill-error");

  return (
    <span className={classes.join(" ")} style={{ color: color ?? undefined, background: background ?? undefined }}>
      {children}
    </span>
  );
}
