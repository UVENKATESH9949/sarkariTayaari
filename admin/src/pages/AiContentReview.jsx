import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateAiContent,
  listAiContent,
  publishAiContent,
  rejectAiContent,
  submitAiContentForReview,
  unpublishAiContent,
} from "../api.js";

/**
 * TASK-2701 Phase 2 — the admin review queue for `AiContentController`. The backend
 * generate/review/publish pipeline has existed since Phase 2, exercised only via direct API
 * calls until now (see `api/AI-CONTENT.md`'s own "Not yet built" section). Structured the same
 * way `IngestionReview.jsx` reviews TASK-2401's candidates: one card per row with every field
 * visible together, generate a manual reload after any mutation rather than optimistic local
 * state (avoids drifting from `expectedVersion`'s real server-side value).
 */

const GENERATE_TASKS = ["QUESTION_EXPLANATION", "CONCEPT_EXPLANATION"];
const LANGUAGES = ["en", "hi"];
const STATUSES = ["DRAFT", "REVIEW", "PUBLISHED"];
const STATUS_BADGE = { DRAFT: "badge-lang", REVIEW: "badge-medium", PUBLISHED: "badge-easy" };
const OUTCOME_BADGE = {
  GENERATED: "badge-easy",
  SKIPPED_EXISTING: "badge-medium",
  FAILED_VALIDATION: "badge-hard",
  FAILED_PROVIDER: "badge-hard",
};

function GenerateForm({ onGenerated }) {
  const [taskId, setTaskId] = useState(GENERATE_TASKS[0]);
  const [languageCode, setLanguageCode] = useState(LANGUAGES[0]);
  const [idsText, setIdsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const subjectIds = idsText.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const response = await generateAiContent({ taskId, languageCode, subjectIds });
      setResult(response);
      onGenerated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 24, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Generate content</h3>
      <p className="field-note">
        {taskId === "QUESTION_EXPLANATION" ? "Question ids" : "Topic ids"}, one per line or
        comma-separated. Only real, authored content — nothing distinguishes a synthetic
        load-test row here, so scoping which ids to spend money on is always your call.
      </p>
      <form onSubmit={handleSubmit} className="form-row" style={{ alignItems: "flex-start" }}>
        <div className="form-field">
          <label>Task</label>
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            {GENERATE_TASKS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Language</label>
          <select value={languageCode} onChange={(e) => setLanguageCode(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div className="form-field" style={{ flex: 1, maxWidth: "none" }}>
          <label>{taskId === "QUESTION_EXPLANATION" ? "Question ids" : "Topic ids"}</label>
          <textarea
            rows={3}
            value={idsText}
            onChange={(e) => setIdsText(e.target.value)}
            placeholder="one id per line, or comma-separated"
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy || subjectIds.length === 0}>
          {busy ? "Generating..." : "Generate"}
        </button>
      </form>

      {error && <div className="banner banner-error">{error}</div>}

      {result && (
        <div style={{ marginTop: 12 }}>
          <p>
            Requested {result.requested} · Generated {result.generated} · Skipped (existing){" "}
            {result.skippedExisting} · Failed validation {result.failedValidation} · Failed
            provider {result.failedProvider}
          </p>
          {result.items.length > 0 && (
            <table style={{ width: "100%" }}>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item.subjectId}>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{item.subjectId}</td>
                    <td>
                      <span className={`badge ${OUTCOME_BADGE[item.outcome] ?? "badge-lang"}`}>
                        {item.outcome}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{item.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function ContentCard({ content, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  async function run(action) {
    setError(null);
    setBusy(true);
    try {
      await action();
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
          <span className="badge badge-lang">{content.taskId}</span>{" "}
          <span className="badge badge-lang">{content.languageCode}</span>{" "}
          <span className={`badge ${STATUS_BADGE[content.contentStatus] ?? "badge-lang"}`}>
            {content.contentStatus}
          </span>
        </div>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {new Date(content.generatedAt).toLocaleString()}
        </span>
      </div>

      <p className="field-note">
        {content.questionId ? `Question: ${content.questionId}` : `Topic: ${content.topicId}`} ·{" "}
        {content.provider} / {content.modelId}
      </p>

      <table style={{ width: "100%", margin: "12px 0" }}>
        <tbody>
          {Object.entries(content.payload ?? {}).map(([key, value]) => (
            <tr key={key}>
              <td style={{ fontWeight: 600, width: 160, verticalAlign: "top" }}>{key}</td>
              <td>{typeof value === "string" ? value : JSON.stringify(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {content.rejectionReason && <p className="field-note">Rejected: {content.rejectionReason}</p>}
      {content.reviewedByEmail && (
        <p className="field-note">
          Reviewed by {content.reviewedByEmail} at {new Date(content.reviewedAt).toLocaleString()}
        </p>
      )}

      {error && <div className="banner banner-error">{error}</div>}

      <div className="row-actions">
        {content.contentStatus === "DRAFT" && (
          <>
            <button
              className="btn"
              disabled={busy}
              onClick={() => run(() => submitAiContentForReview(content.id, content.version))}
            >
              {busy ? "Submitting..." : "Submit for review"}
            </button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => run(() => publishAiContent(content.id, content.version))}
            >
              {busy ? "Publishing..." : "Publish"}
            </button>
          </>
        )}

        {content.contentStatus === "REVIEW" && (
          <>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => run(() => publishAiContent(content.id, content.version))}
            >
              {busy ? "Publishing..." : "Publish"}
            </button>
            {!showReject ? (
              <button className="btn btn-danger" disabled={busy} onClick={() => setShowReject(true)}>
                Reject
              </button>
            ) : (
              <>
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason"
                  autoFocus
                />
                <button
                  className="btn btn-danger"
                  disabled={busy || !rejectReason.trim()}
                  onClick={() => run(() => rejectAiContent(content.id, rejectReason.trim(), content.version))}
                >
                  Confirm reject
                </button>
                <button className="btn" onClick={() => setShowReject(false)}>Cancel</button>
              </>
            )}
          </>
        )}

        {content.contentStatus === "PUBLISHED" && (
          <button
            className="btn btn-danger"
            disabled={busy}
            onClick={() => run(() => unpublishAiContent(content.id, content.version))}
          >
            {busy ? "Unpublishing..." : "Unpublish"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AiContentReview() {
  const [taskFilter, setTaskFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("REVIEW");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // A quickly-changed filter (or React StrictMode's dev-only double effect invocation) can
  // have two requests in flight at once with no guarantee they resolve in the order they were
  // sent — found by testing, not by inspection: switching the status filter right after
  // Generate produced exactly this race, an older REVIEW response landing after a newer
  // PUBLISHED one and silently overwriting it with stale (wrong-filter) data. Only the response
  // to the *latest* call this component made is ever applied.
  const requestIdRef = useRef(0);

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    listAiContent({ taskId: taskFilter || undefined, status: statusFilter })
      .then((data) => {
        if (requestIdRef.current === requestId) setItems(data);
      })
      .catch((e) => {
        if (requestIdRef.current === requestId) setError(e.message);
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, [taskFilter, statusFilter]);

  useEffect(load, [load]);

  return (
    <div>
      <div className="page-header">
        <h1>AI Content Review</h1>
      </div>
      <p className="page-intro">
        Generate AI-authored question/topic explanations, then review and publish them. A row
        never reaches a student until an admin or reviewer publishes it here.
      </p>

      <GenerateForm onGenerated={load} />

      <div className="form-row">
        <div className="form-field">
          <label>Task</label>
          <select value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)}>
            <option value="">All</option>
            {GENERATE_TASKS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {loading && <p>Loading...</p>}
      {!loading && items.length === 0 && (
        <div className="empty-state">
          No {statusFilter.toLowerCase()} content{taskFilter ? ` for ${taskFilter}` : ""} yet.
        </div>
      )}
      {!loading && items.map((item) => <ContentCard key={item.id} content={item} onChanged={load} />)}
    </div>
  );
}
