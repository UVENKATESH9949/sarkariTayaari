import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

/**
 * A typed wrapper around `.card` — the base container class used throughout the app.
 * `interactive` adds the hover/press treatment `.exam-card` already had, for any other
 * card that becomes clickable in a future page without redefining that treatment again.
 */
type CardDivProps = { as?: "div"; interactive?: false; children: ReactNode; className?: string } & Omit<
  HTMLAttributes<HTMLDivElement>,
  "className" | "children"
>;
type CardButtonProps = {
  as: "button";
  interactive?: boolean;
  children: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function Card({ as = "div", interactive = false, className, children, ...rest }: CardDivProps | CardButtonProps) {
  const classes = ["card"];
  if (interactive) classes.push("exam-card");
  if (className) classes.push(className);

  if (as === "button") {
    return (
      <button type="button" className={classes.join(" ")} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
        {children}
      </button>
    );
  }

  return (
    <div className={classes.join(" ")} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}
