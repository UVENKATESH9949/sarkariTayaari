import { InboxIcon } from "../components/icons";

/**
 * A placeholder for a feature area that has a route but no implementation yet.
 *
 * These exist so the navigation is real and walkable from Phase 0 — you can tab through the
 * whole shell, check the responsive layout and confirm routing works — without pretending a
 * feature is present. Each says which phase builds it, so nobody has to guess whether a blank
 * screen is a bug.
 */
export default function ComingSoon({ title, phase, summary }: { title: string; phase: string; summary: string }) {
  return (
    <>
      <div className="page-header">
        <h1>{title}</h1>
        <p className="subtle">{summary}</p>
      </div>
      <div className="notice">
        <InboxIcon aria-hidden="true" />
        <span>
          Not built yet — this arrives in {phase}. The route exists so the navigation and layout
          can be checked now.
        </span>
      </div>
    </>
  );
}
