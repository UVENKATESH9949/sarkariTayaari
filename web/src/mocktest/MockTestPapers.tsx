import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertIcon, InboxIcon, TimerIcon } from "../components/icons";
import { getMockablePapers, totalDurationMinutes } from "./mockTestApi";
import type { MockPaper } from "./types";

export default function MockTestPapers() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const examCode = params.get("examCode") ?? "";
  const examLabel = params.get("examLabel") ?? "";

  const [papers, setPapers] = useState<MockPaper[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMockablePapers(examCode)
      .then((p) => {
        if (!cancelled) setPapers(p);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load papers.");
      });
    return () => {
      cancelled = true;
    };
  }, [examCode]);

  function openPaper(paper: MockPaper) {
    const q = new URLSearchParams({ paperId: paper.id, examLabel });
    navigate(`/mock-test/start?${q.toString()}`);
  }

  return (
    <>
      <div className="page-header">
        <h1>{examLabel || "Mock papers"}</h1>
        <p className="subtle">Choose a paper to see its details before starting.</p>
      </div>

      {error && (
        <div className="banner banner-error" role="alert">
          <AlertIcon aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {!error && papers === null && <p className="muted">Loading…</p>}
      {!error && papers !== null && papers.length === 0 && (
        <div className="notice">
          <InboxIcon aria-hidden="true" />
          <span>No mockable papers for this exam yet.</span>
        </div>
      )}

      {!error &&
        papers?.map((paper) => (
          <button type="button" key={paper.id} className="card exam-card" onClick={() => openPaper(paper)}>
            <span className="stat-icon" aria-hidden="true"><TimerIcon /></span>
            <div className="stat-body">
              <div className="stat-name">{paper.name}</div>
              <div className="stat-code">
                {paper.stageName} · {totalDurationMinutes(paper)} min ·{" "}
                {paper.sections.reduce((n, s) => n + s.questionCount, 0)} questions
              </div>
            </div>
            <div className="exam-card-pills">
              <span className="pill">
                +{paper.marksCorrect ?? 1} / {paper.marksWrong ? `−${paper.marksWrong}` : "0"}
              </span>
            </div>
          </button>
        ))}
    </>
  );
}
