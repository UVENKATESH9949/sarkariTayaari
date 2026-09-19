import type { To } from "react-router-dom";
import { Link } from "react-router-dom";
import { Fragment } from "react";

export type Crumb = { label: string; to?: To };

/**
 * Desktop-only wayfinding for a drill-down flow (exam -> subject -> topic -> level, or
 * exam -> paper). An item with no `to` renders as plain text — used for a step whose full
 * query-string can't be reconstructed from the current page's own params (e.g. Mock Test
 * Start only receives `paperId`, not the `examCode` its Papers list needs) rather than
 * building a link that would land on the wrong data.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <Fragment key={i}>
            {i > 0 && <span className="breadcrumb-sep" aria-hidden="true">/</span>}
            <span className="breadcrumb-item">
              {item.to && !isLast ? (
                <Link to={item.to}>{item.label}</Link>
              ) : (
                <span className={isLast ? "breadcrumb-current" : undefined}>{item.label}</span>
              )}
            </span>
          </Fragment>
        );
      })}
    </nav>
  );
}
