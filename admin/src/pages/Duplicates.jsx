import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listQuestionDuplicates,
  resolveQuestionDuplicate,
  backfillQuestionDuplicates,
} from "../api.js";
import { useConfirm } from "../hooks/useConfirm.jsx";

/**
 * Epic L / TICKET-2109 — the duplicate review queue.
 *
 * Detection records a pair and never deletes anything. Two questions can share wording and still
 * be genuinely different, and an automatic delete of real editorial content is unrecoverable, so
 * both rows stay live until someone decides. This screen is where that decision happens.
 *
 * Marking a pair a duplicate deliberately does <em>not</em> delete the newer question either. The
 * verdict and the deletion are separate acts: an admin may want to merge translations, or keep
 * both under different exams. The queue records the judgement; the Questions list is where a row
 * gets removed.
 */

function shorten(text, max = 220) {
  if (!text) return "(no English text)";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function Duplicates() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listQuestionDuplicates({ page, size: 20 })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(load, [load]);

  async function handleResolve(pair, resolution) {
    const key = `${pair.questionId}:${pair.duplicateOfQuestionId}`;
    setBusyKey(key);
    setError(null);
    try {
      await resolveQuestionDuplicate(pair.questionId, pair.duplicateOfQuestionId, resolution);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleScan() {
    const ok = await confirm(
      "Scan the whole question bank for duplicates? This compares every question against every " +
        "other by normalised text. Nothing is deleted — matches are added to this queue for review.",
      { title: "Scan for duplicates", confirmLabel: "Scan" },
    );
    if (!ok) return;

    setScanning(true);
    setError(null);
    setNotice(null);
    try {
      const result = await backfillQuestionDuplicates(1000);
      setNotice(
        result.edgesRecorded === 0
          ? "Scan complete — no new duplicate pairs found."
          : `Scan complete — ${result.edgesRecorded} new pair(s) added to the queue. ` +
              "Run it again if you want to keep going; each run records up to 1000.",
      );
      setPage(0);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  const pairs = data?.content ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Duplicate Questions</h1>
        <button className="btn btn-primary" onClick={handleScan} disabled={scanning}>
          {scanning ? "Scanning..." : "Scan whole bank"}
        </button>
      </div>

      <p className="page-intro">
        New questions and bulk imports are checked against the entire existing bank automatically.
        Anything that matches is recorded here rather than rejected — matching wording does not
        always mean the same question. The bank also holds ~37,900 questions that predate this
        check, so run a scan once to compare those against each other.
      </p>

      {error && <div className="banner banner-error">{error}</div>}
      {notice && <div className="banner banner-success">{notice}</div>}

      {loading && <p>Loading...</p>}

      {!loading && pairs.length === 0 && (
        <div className="empty-state">
          Nothing awaiting review. New imports are checked as they arrive.
        </div>
      )}

      {!loading &&
        pairs.map((pair) => {
          const key = `${pair.questionId}:${pair.duplicateOfQuestionId}`;
          const busy = busyKey === key;
          return (
            <div className="card" key={key} style={{ marginBottom: 16 }}>
              <div className="toolbar" style={{ marginBottom: 12 }}>
                <span className="badge badge-hard">
                  {Number(pair.similarityPercent).toFixed(0)}% match
                </span>
                <span className="muted-note">{pair.detectionMethod.replace(/_/g, " ").toLowerCase()}</span>
                <div className="spacer" />
                <span className="muted-note">
                  found {new Date(pair.detectedAt).toLocaleString()}
                </span>
              </div>

              <div className="translation-view">
                <strong>Existing (kept as the original)</strong>
                <p style={{ margin: "6px 0 0", fontSize: 13.5 }}>
                  {shorten(pair.duplicateOfQuestionText)}
                </p>
                <Link
                  to={`/questions/${pair.duplicateOfQuestionId}/edit`}
                  className="btn btn-sm"
                  style={{ marginTop: 8 }}
                >
                  Open
                </Link>
              </div>

              <div className="translation-view" style={{ borderColor: "var(--color-danger)" }}>
                <strong>Newer (flagged as a duplicate of it)</strong>
                <p style={{ margin: "6px 0 0", fontSize: 13.5 }}>{shorten(pair.questionText)}</p>
                <Link
                  to={`/questions/${pair.questionId}/edit`}
                  className="btn btn-sm"
                  style={{ marginTop: 8 }}
                >
                  Open
                </Link>
              </div>

              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => handleResolve(pair, "DUPLICATE")}
                >
                  {busy ? "Saving..." : "Yes — duplicate"}
                </button>
                <button className="btn" disabled={busy} onClick={() => handleResolve(pair, "NOT_DUPLICATE")}>
                  No — different questions
                </button>
              </div>
              <span className="field-note">
                Recording a verdict does not delete anything. Delete the newer question from the
                Questions list if that is what you want.
              </span>
            </div>
          );
        })}

      {!loading && data && data.totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-sm" disabled={data.first} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {data.number + 1} of {Math.max(data.totalPages, 1)} ({data.totalElements} total)
          </span>
          <button className="btn btn-sm" disabled={data.last} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
