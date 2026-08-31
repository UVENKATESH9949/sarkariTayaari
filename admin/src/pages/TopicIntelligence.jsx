import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listAllExams,
  getTopicIntelligence,
  recomputeTopicIntelligence,
  setTopicPriorityOverride,
} from "../api.js";
import Modal from "../components/Modal.jsx";
import { EditIcon } from "../components/icons.jsx";
import { useConfirm } from "../hooks/useConfirm.jsx";

/**
 * Epic L / TICKET-2106 + 2107 — the computed topic ranking for one exam, and the admin override.
 *
 * The screen exists to make one distinction visible at all times: which numbers the system
 * computed and which a human decided. The source spec's §66 requires those to stay separable in
 * storage; a console that collapsed them back into one column on screen would undo that at the
 * last step, so every row shows the computed score even when an override is in force.
 */

const TREND_LABEL = {
  RISING: "Rising",
  STABLE: "Stable",
  FALLING: "Falling",
  INSUFFICIENT_DATA: "Not enough data",
};

const TREND_CLASS = {
  RISING: "badge badge-hard",
  STABLE: "badge",
  FALLING: "badge",
  INSUFFICIENT_DATA: "badge",
};

/** Numbers arrive as strings or numbers depending on JSON serialisation; normalise for display. */
function fmt(value, suffix = "") {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return `${n.toFixed(2)}${suffix}`;
}

function OverrideModal({ exam, topic, onCancel, onSaved }) {
  // Held as strings so a half-typed "9." is not coerced mid-keystroke — same reasoning as the
  // weightage input on ExamStructure.
  const [priority, setPriority] = useState(
    topic.adminOverride === null || topic.adminOverride === undefined
      ? ""
      : String(topic.adminOverride),
  );
  const [reason, setReason] = useState(topic.overrideReason ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const clearing = priority.trim() === "";

  async function submit() {
    setError(null);

    if (!clearing) {
      const value = Number(priority);
      if (Number.isNaN(value) || value < 0 || value > 100) {
        setError("Priority must be a number between 0 and 100.");
        return;
      }
      if (!reason.trim()) {
        // Validated here as well as server-side: the server rejects it, but catching it before
        // the request means the admin keeps what they typed instead of seeing a bare 400.
        setError("A reason is required — it is what makes this decision auditable later.");
        return;
      }
    }

    setSaving(true);
    try {
      await setTopicPriorityOverride(exam, topic.topicId, {
        priority: clearing ? null : Number(priority),
        reason: clearing ? null : reason.trim(),
      });
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Override priority — ${topic.topicName}`}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Saving..." : clearing ? "Clear override" : "Save override"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}

      <p className="field-note" style={{ marginTop: 0 }}>
        The computed score is never overwritten. Your value is stored beside it and takes
        precedence for ranking; clearing it hands ranking back to the formula.
      </p>

      <div className="form-row">
        <div className="form-field">
          <label>Computed (system)</label>
          <input value={fmt(topic.systemPriority) ?? "not computed"} disabled />
          <span className="field-note">Read-only — only a recompute changes this.</span>
        </div>
        <div className="form-field">
          <label>Your override</label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            placeholder="Leave blank to clear"
            autoFocus
          />
          <span className="field-note">0–100. Blank clears the override.</span>
        </div>
      </div>

      <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
        <label>Reason {clearing ? "(not needed when clearing)" : ""}</label>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={clearing}
          placeholder="e.g. Previous-year coverage understates how heavily this is examined."
        />
        <span className="field-note">
          Stored with the override so a later reader can tell a deliberate editorial decision from
          a stray edit.
        </span>
      </div>
    </Modal>
  );
}

export default function TopicIntelligence() {
  const [exams, setExams] = useState([]);
  const [examCode, setExamCode] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null);
  const [onlyOverridden, setOnlyOverridden] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    listAllExams()
      .then((rows) => {
        const sorted = [...rows].sort((a, b) => a.displayOrder - b.displayOrder);
        setExams(sorted);
        // Preselect the first exam rather than showing an empty screen with a dropdown —
        // there is no useful "all exams" view, since priority is per-exam by definition.
        if (sorted.length > 0) setExamCode((prev) => prev || sorted[0].code);
      })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(() => {
    if (!examCode) return;
    setLoading(true);
    setError(null);
    getTopicIntelligence(examCode)
      .then(setData)
      .catch((e) => {
        setError(e.message);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [examCode]);

  useEffect(load, [load]);

  async function handleRecompute() {
    const ok = await confirm(
      `Recompute trend and priority for ${examCode}? Existing admin overrides are carried forward, not lost.`,
      { title: "Recompute topic intelligence", confirmLabel: "Recompute" },
    );
    if (!ok) return;

    setRecomputing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await recomputeTopicIntelligence(examCode);
      setNotice(
        `Scored ${result.topicsScored} topic(s) from ${result.pyqTaggedCount} tagged previous-year ` +
          `appearance(s) at algorithm ${result.algorithmVersion}. ` +
          `${result.overridesCarriedForward} override(s) carried forward.`,
      );
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRecomputing(false);
    }
  }

  const topics = data?.topics ?? [];
  const shown = onlyOverridden
    ? topics.filter((t) => t.adminOverride !== null && t.adminOverride !== undefined)
    : topics;
  const overriddenCount = topics.filter(
    (t) => t.adminOverride !== null && t.adminOverride !== undefined,
  ).length;

  return (
    <div>
      <div className="page-header">
        <h1>Topic Intelligence</h1>
        <button className="btn btn-primary" onClick={handleRecompute} disabled={!examCode || recomputing}>
          {recomputing ? "Recomputing..." : "Recompute"}
        </button>
      </div>

      <p className="page-intro">
        Computed from questions tagged with a previous-year (PYQ) year, blended with the curated
        weightage on the exam&apos;s topic map. Nothing here is computed on a schedule — the numbers
        change only when you recompute, so tagging PYQs or editing a topic map has no effect until
        you do.
      </p>

      {error && <div className="banner banner-error">{error}</div>}
      {notice && <div className="banner banner-success">{notice}</div>}

      <div className="toolbar">
        <select value={examCode} onChange={(e) => setExamCode(e.target.value)}>
          {exams.map((exam) => (
            <option key={exam.code} value={exam.code}>
              {exam.name}
            </option>
          ))}
        </select>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={onlyOverridden}
            onChange={(e) => setOnlyOverridden(e.target.checked)}
          />
          Only overridden ({overriddenCount})
        </label>

        <div className="spacer" />
        {data && (
          <span className="muted-note">
            algorithm {data.algorithmVersion} · {data.pyqTaggedCount} tagged PYQ appearance
            {data.pyqTaggedCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {loading && <p>Loading...</p>}

      {/* Two genuinely different empty states. "No topics mapped" is an admin action away;
          "nothing tagged" means the trend columns will stay empty however often you recompute. */}
      {!loading && data && topics.length === 0 && (
        <div className="empty-state">
          No topics are mapped to {examCode} yet.{" "}
          <Link to={`/exams/${examCode}/structure`}>Set its topic map first.</Link>
        </div>
      )}

      {!loading && data && topics.length > 0 && data.pyqTaggedCount === 0 && (
        <div className="banner banner-warn">
          None of this exam&apos;s questions carry a previous-year year yet, so every topic reports
          &quot;not enough data&quot; and priority falls back to the curated weightage. Tag some
          questions as PYQs on the question form to give the trend something to work from.
        </div>
      )}

      {!loading && shown.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Topic</th>
                <th style={{ width: 150 }}>Subject</th>
                <th style={{ width: 110 }}>Weightage</th>
                <th style={{ width: 130 }}>PYQ trend</th>
                <th style={{ width: 90 }}>System</th>
                <th style={{ width: 90 }}>Override</th>
                <th style={{ width: 90 }}>Final</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((topic) => {
                const overridden = topic.adminOverride !== null && topic.adminOverride !== undefined;
                return (
                  <tr key={topic.topicId}>
                    <td>
                      {topic.parentName && (
                        <div className="cell-secondary">{topic.parentName} →</div>
                      )}
                      <div className="cell-primary">{topic.topicName}</div>
                    </td>
                    <td>
                      <span className="badge">{topic.subjectName}</span>
                    </td>
                    <td>
                      {/* Both figures, always. The curated one is what a human said; the computed
                          one is what the papers show. Seeing them disagree is useful signal. */}
                      <div className="cell-primary">
                        {fmt(topic.computedWeightagePercent, "%") ?? "—"}
                      </div>
                      <div className="cell-secondary">
                        curated {fmt(topic.curatedWeightagePercent, "%") ?? "—"}
                      </div>
                    </td>
                    <td>
                      <span className={TREND_CLASS[topic.trendDirection] ?? "badge"}>
                        {TREND_LABEL[topic.trendDirection] ?? topic.trendDirection}
                      </span>
                      <div className="cell-secondary">
                        {topic.appearanceCount} in{" "}
                        {topic.windowFromYear && topic.windowToYear
                          ? `${topic.windowFromYear}–${topic.windowToYear}`
                          : "—"}
                      </div>
                    </td>
                    <td>{fmt(topic.systemPriority) ?? "—"}</td>
                    <td>
                      {overridden ? (
                        <span className="badge badge-hard" title={topic.overrideReason ?? ""}>
                          {fmt(topic.adminOverride)}
                        </span>
                      ) : (
                        <span className="muted-note">—</span>
                      )}
                    </td>
                    <td>
                      <strong>{fmt(topic.finalPriority) ?? "—"}</strong>
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost icon-btn"
                        title="Override priority"
                        onClick={() => setEditing(topic)}
                      >
                        <EditIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && topics.length > 0 && shown.length === 0 && (
        <div className="empty-state">No topics have an override on this exam yet.</div>
      )}

      {editing && (
        <OverrideModal
          exam={examCode}
          topic={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {confirmDialog}
    </div>
  );
}
