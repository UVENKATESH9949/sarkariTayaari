import { InboxIcon } from "../components/icons";

/**
 * A placeholder for a feature area that has a route but no implementation yet.
 *
 * These exist so the navigation is real and walkable from Phase 0 — you can tab through the
 * whole shell, check the responsive layout and confirm routing works — without pretending a
 * feature is present. Each says which phase builds it, so nobody has to guess whether a blank
 * screen is a bug.
 */
export default function ComingSoon({
  title,
  phase,
  summary,
  notFound = false,
}: {
  title: string;
  phase: string;
  summary: string;
  /** The 404 route reuses this same component — swaps "arrives in {phase}" for a plain 404. */
  notFound?: boolean;
}) {
  return (
    <>
      <div className="page-header">
        <h1>{title}</h1>
        <p className="subtle">{summary}</p>
      </div>
      <div className="card coming-soon">
        <span className="coming-soon-icon" aria-hidden="true">
          <InboxIcon />
        </span>
        {!notFound && <span className="coming-soon-phase">Arrives in {phase}</span>}
        <p className="coming-soon-message">
          {notFound
            ? "Check the address, or use the navigation to get back to Practice or Mock Test."
            : `This part of ${title} isn't built yet. The route exists so the navigation and layout can already be checked — Practice and Mock Test are ready to use today.`}
        </p>
      </div>
    </>
  );
}
