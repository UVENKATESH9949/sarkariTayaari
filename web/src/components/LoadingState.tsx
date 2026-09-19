/**
 * Replaces the `<p className="muted">Loading…</p>` line that was copy-pasted across every
 * page. Renders shimmer blocks shaped like the content they stand in for, matching the phone
 * app's own skeleton convention, rather than bare text — and matching the shape the real
 * content will render in, not one generic spinner for every screen:
 *  - "grid": exam-card tiles (Home, Practice/Mock Test exam pickers).
 *  - "rows": a `.stat-row` list inside one card (Subjects/Topics/Levels).
 *  - "list": a stack of full-width cards (Mock Test's paper list).
 *  - "question": a single question card (Practice Quiz / Mock Test Engine's first load).
 */
type Variant = "grid" | "rows" | "list" | "question";

export function LoadingState({
  rows = 4,
  label = "Loading",
  variant = "grid",
}: {
  rows?: number;
  label?: string;
  variant?: Variant;
}) {
  if (variant === "rows") {
    return (
      <div className="card" role="status" aria-label={label}>
        {Array.from({ length: rows }, (_, i) => (
          <div className="stat-row" key={i}>
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

  if (variant === "list") {
    return (
      <div className="skeleton-list" role="status" aria-label={label}>
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

  if (variant === "question") {
    return (
      <div className="quiz" role="status" aria-label={label}>
        <span className="skeleton-block skeleton-progress" aria-hidden="true" />
        <div className="card quiz-card">
          <span className="skeleton-block skeleton-title" aria-hidden="true" />
          <div className="option-list" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <span className="skeleton-block skeleton-option" key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

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
