import { useCallback, useEffect, useState } from "react";
import {
  listIngestionSources,
  listIngestionExtractionResults,
  acceptIngestionCandidate,
  rejectIngestionCandidate,
  listAllExams,
} from "../api.js";

/** Mirrors {@code RecruitmentCycleStatus} (backend entity) -- no endpoint exposes this
 * enum, so it's listed here the same way other admin screens hardcode a small fixed
 * vocabulary that has no lookup API of its own. */
const RECRUITMENT_CYCLE_STATUSES = [
  "NOT_ANNOUNCED", "NOTIFICATION_EXPECTED", "NOTIFICATION_RELEASED", "APPLICATION_OPEN",
  "APPLICATION_CLOSING_SOON", "APPLICATION_CLOSED", "CORRECTION_WINDOW_OPEN",
  "ADMIT_CARD_RELEASED", "EXAM_UPCOMING", "EXAM_ONGOING", "ANSWER_KEY_RELEASED",
  "RESULT_RELEASED", "CUTOFF_RELEASED", "FINAL_RESULT", "RECRUITMENT_COMPLETED",
];

const CONFIDENCE_BADGE = { HIGH: "badge-easy", MEDIUM: "badge-medium", LOW: "badge-hard" };
const STATUS_BADGE = { PENDING: "badge-medium", ACCEPTED: "badge-easy", REJECTED: "badge-hard", EDITED: "badge-medium" };

/**
 * TASK-2401 Task 9 -- one candidate's evidence plus Accept/Reject. Deliberately one card
 * per candidate ROW (Document 9's own granularity: one row per prospective fact, not per
 * field) rather than the brief's own per-field mockup -- the payload table below shows
 * every field in that row together, which is what a reviewer actually needs to judge it.
 */
function CandidateCard({ candidate, exams, onChanged }) {
  const [examCode, setExamCode] = useState(exams[0]?.code ?? "");
  const [status, setStatus] = useState(RECRUITMENT_CYCLE_STATUSES[0]);
  const [recruitmentCycleId, setRecruitmentCycleId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const isCycleCore = candidate.targetType === "RECRUITMENT_CYCLE_CORE";
  const isPending = candidate.reviewStatus === "PENDING";
  const warnings = candidate.validationWarnings?.messages ?? [];

  async function handleAccept(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = isCycleCore
        ? { overrides: { examCode, status } }
        : { recruitmentCycleId: recruitmentCycleId.trim() };
      await acceptIngestionCandidate(candidate.id, payload);
      onChanged();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function handleReject(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await rejectIngestionCandidate(candidate.id, rejectReason.trim());
      onChanged();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16, padding: 16 }}>
      <div className="row-actions" style={{ justifyContent: "space-between" }}>
        <div>
          <span className="badge badge-lang">{candidate.targetType}</span>{" "}
          <span className={`badge ${CONFIDENCE_BADGE[candidate.confidence] ?? "badge-medium"}`}>
            {candidate.confidence}
          </span>{" "}
          <span className={`badge ${STATUS_BADGE[candidate.reviewStatus] ?? "badge-medium"}`}>
            {candidate.reviewStatus}
          </span>
        </div>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {new Date(candidate.createdAt).toLocaleString()}
        </span>
      </div>

      <table style={{ width: "100%", margin: "12px 0" }}>
        <tbody>
          {Object.entries(candidate.payload ?? {}).map(([key, value]) => (
            <tr key={key}>
              <td style={{ fontWeight: 600, width: 180, verticalAlign: "top" }}>{key}</td>
              <td>{String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {candidate.sourceExcerpt && (
        <p className="field-note">Source: "{candidate.sourceExcerpt}"</p>
      )}

      {warnings.length > 0 && (
        <div className="banner banner-error">
          {warnings.map((message, i) => <div key={i}>⚠ {message}</div>)}
        </div>
      )}

      {candidate.rejectionReason && <p className="field-note">Rejected: {candidate.rejectionReason}</p>}
      {candidate.appliedRecruitmentCycleId && (
        <p className="field-note">Applied to cycle: <code>{candidate.appliedRecruitmentCycleId}</code></p>
      )}

      {error && <div className="banner banner-error">{error}</div>}

      {isPending && (
        <div>
          {isCycleCore ? (
            <form onSubmit={handleAccept} className="form-row" style={{ alignItems: "flex-end" }}>
              <div className="form-field">
                <label>Exam</label>
                <select value={examCode} onChange={(e) => setExamCode(e.target.value)}>
                  {exams.map((exam) => <option key={exam.code} value={exam.code}>{exam.code}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {RECRUITMENT_CYCLE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy || !examCode}>Accept</button>
            </form>
          ) : (
            <form onSubmit={handleAccept} className="form-row" style={{ alignItems: "flex-end" }}>
              <div className="form-field" style={{ maxWidth: "none", flex: 1 }}>
                <label>Recruitment cycle ID</label>
                <input
                  value={recruitmentCycleId}
                  onChange={(e) => setRecruitmentCycleId(e.target.value)}
                  placeholder="Paste the cycle id this candidate belongs to"
                  required
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy || !recruitmentCycleId.trim()}>
                Accept
              </button>
            </form>
          )}

          {!showReject ? (
            <button className="btn" style={{ marginTop: 8 }} onClick={() => setShowReject(true)}>Reject</button>
          ) : (
            <form onSubmit={handleReject} className="form-row" style={{ alignItems: "flex-end", marginTop: 8 }}>
              <div className="form-field" style={{ maxWidth: "none", flex: 1 }}>
                <label>Rejection reason</label>
                <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} required autoFocus />
              </div>
              <button className="btn btn-danger" type="submit" disabled={busy || !rejectReason.trim()}>
                Confirm reject
              </button>
              <button type="button" className="btn" onClick={() => setShowReject(false)}>Cancel</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * TASK-2401 Document 11 (Task 9) -- the review queue. Not a rich per-field diff view
 * (Document 11's own mockup sketches one) -- Task 6's own candidates are one row per
 * fact (Document 9's granularity), so this shows one card per row with every field in
 * it together, which is what a reviewer needs to judge the row as a whole.
 */
export default function IngestionReview() {
  const [sources, setSources] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [exams, setExams] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([listIngestionSources(), listAllExams()])
      .then(([sourceRows, examRows]) => {
        setSources(sourceRows);
        setExams([...examRows].sort((a, b) => a.code.localeCompare(b.code)));
        if (sourceRows.length > 0) setSelectedSourceId(sourceRows[0].id);
        else setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const loadCandidates = useCallback(() => {
    if (!selectedSourceId) return;
    setLoading(true);
    setError(null);
    listIngestionExtractionResults(selectedSourceId)
      .then(setCandidates)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedSourceId]);

  useEffect(loadCandidates, [loadCandidates]);

  const filtered = candidates.filter((c) => statusFilter === "ALL" || c.reviewStatus === statusFilter);

  return (
    <div>
      <div className="page-header">
        <h1>Ingestion Review</h1>
      </div>

      <p className="page-intro">
        Candidates the ingestion pipeline (TASK-2401) produced from a source's discovered documents.
        Accepting one calls the exact same Exam Guide service method the admin console's own forms
        already use -- the result is an ordinary Exam Guide row, not something special.
      </p>

      <div className="form-row">
        <div className="form-field">
          <label>Source</label>
          <select value={selectedSourceId} onChange={(e) => setSelectedSourceId(e.target.value)}>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="PENDING">Pending</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="REJECTED">Rejected</option>
            <option value="ALL">All</option>
          </select>
        </div>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {loading && <p>Loading...</p>}

      {!loading && sources.length === 0 && (
        <div className="empty-state">No ingestion sources yet — add one on the Ingestion Sources page first.</div>
      )}

      {!loading && sources.length > 0 && filtered.length === 0 && (
        <div className="empty-state">No {statusFilter.toLowerCase()} candidates for this source yet.</div>
      )}

      {!loading && filtered.map((c) => (
        <CandidateCard key={c.id} candidate={c} exams={exams} onChanged={loadCandidates} />
      ))}
    </div>
  );
}
