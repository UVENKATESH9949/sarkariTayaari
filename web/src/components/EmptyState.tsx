import type { ReactNode } from "react";
import { Button } from "./Button";

/**
 * Replaces the bare `.notice` icon+text blocks copy-pasted across pages, with an optional
 * title and action — "what happened, why, what you can do next", per this product's own
 * empty-state standard.
 */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title?: string;
  message: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        {icon}
      </span>
      {title && <div className="empty-state-title">{title}</div>}
      <p className="empty-state-message">{message}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
