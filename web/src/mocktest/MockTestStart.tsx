import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertIcon, TimerIcon } from "../components/icons";
import { getPaperById, getSectionAvailability, totalDurationMinutes } from "./mockTestApi";
import type { MockPaper, SectionAvailability } from "./types";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { LoadingState } from "../components/LoadingState";

/**
 * The pre-test briefing — honest per-section availability (flags a cap when the live question
 * bank is short of what the paper asks for), duration, marking scheme, and the Start button
 * that actually begins the timed attempt.
 */
export default function MockTestStart() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const paperId = params.get("paperId") ?? "";
  const examLabel = params.get("examLabel") ?? "";

  const [paper, setPaper] = useState<MockPaper | null | undefined>(undefined);
  const [availability, setAvailability] = useState<SectionAvailability[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPaperById(paperId)
      .then(async (p) => {
        if (cancelled) return;
        setPaper(p);
        if (p) setAvailability(await getSectionAvailability(p));
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this paper.");
      });
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  function start() {
    if (!paper) return;
    const q = new URLSearchParams({ paperId: paper.id, examLabel });
    navigate(`/mock-test/test?${q.toString()}`);
  }

  if (error) {
    return (
      <div className="banner banner-error" role="alert">
        <AlertIcon aria-hidden="true" />
        <span>{error}</span>
      </div>
    );
  }

  if (paper === undefined || (paper && !availability)) {
    return <LoadingState variant="rows" rows={2} label="Loading paper" />;
  }

  if (paper === null) {
    return (
      <div className="banner banner-error" role="alert">
        <AlertIcon aria-hidden="true" />
        <span>This paper could not be found.</span>
      </div>
    );
  }

  const totalRequested = availability!.reduce((n, s) => n + s.requested, 0);
  const totalAvailable = availability!.reduce((n, s) => n + Math.min(s.available, s.requested), 0);
  const isShort = totalAvailable < totalRequested;

  return (
    <>
      <Breadcrumbs items={[{ label: "Mock Test", to: "/mock-test" }, { label: examLabel || "Exam" }, { label: paper.name }]} />

      <div className="page-header">
        <h1>{paper.name}</h1>
        <p className="subtle">{examLabel} · {paper.stageName}</p>
      </div>

      <div className="card stack">
        <div className="stat-row" style={{ borderTop: "none", padding: "2px" }}>
          <span className="stat-icon" aria-hidden="true"><TimerIcon /></span>
          <div className="stat-body">
            <div className="stat-name">{totalDurationMinutes(paper)} minutes</div>
            <div className="subtle">
              {totalAvailable} question{totalAvailable === 1 ? "" : "s"}
              {isShort ? ` (requested ${totalRequested} — the live bank has fewer right now)` : ""}
            </div>
          </div>
        </div>
        <div>
          <span className="field-label">Marking scheme</span>
          <p>+{paper.marksCorrect ?? 1} for each correct answer, {paper.marksWrong ? `−${paper.marksWrong}` : "0"} for each wrong answer.</p>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-sm">Sections</h2>
        {availability!.map((s) => (
          <div className="stat-row" key={s.sectionName}>
            <div className="stat-body">
              <div className="stat-name">{s.sectionName}</div>
              <div className="subtle">
                {Math.min(s.available, s.requested)} question{Math.min(s.available, s.requested) === 1 ? "" : "s"}
                {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="btn btn-block mt-md" onClick={start} disabled={totalAvailable === 0}>
        Start test
      </button>
    </>
  );
}
