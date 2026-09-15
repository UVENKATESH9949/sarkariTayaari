/**
 * Replaces the `<p className="muted">Loading…</p>` line that was copy-pasted across every
 * page. Renders shimmer blocks shaped like the exam-card rows it stands in for, matching
 * the phone app's own skeleton convention, rather than bare text.
 */
export function LoadingState({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton-grid" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="card skeleton-card" key={i}>
          <span className="skeleton-block skeleton-icon" aria-hidden="true" />
          <span className="skeleton-lines" aria-hidden="true">
            <span className="skeleton-block skeleton-line" />
            <span className="skeleton-block skeleton-line skeleton-line-short" />
          </span>
        </div>
      ))}
    </div>
  );
}
