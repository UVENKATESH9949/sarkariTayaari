import type { ButtonHTMLAttributes } from "react";

/**
 * A typed wrapper around the existing `.btn`/`.btn-secondary`/`.btn-danger`/`.btn-block`
 * classes in `styles/index.css` — no new visual system, just one place to reach for
 * instead of hand-writing the className string per call site.
 */
type ButtonVariant = "primary" | "secondary" | "danger";

export function Button({
  variant = "primary",
  block = false,
  className,
  ...rest
}: {
  variant?: ButtonVariant;
  block?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = ["btn"];
  if (variant === "secondary") classes.push("btn-secondary");
  if (variant === "danger") classes.push("btn-danger");
  if (block) classes.push("btn-block");
  if (className) classes.push(className);

  return <button type="button" className={classes.join(" ")} {...rest} />;
}
