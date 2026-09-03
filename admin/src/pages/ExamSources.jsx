import { useCallback, useEffect, useState } from "react";
import { listExamSources, createExamSource, updateExamSource, deleteExamSource } from "../api.js";
import { deleteFailureMessage } from "../errors.js";
import Modal from "../components/Modal.jsx";
import { EditIcon, TrashIcon } from "../components/icons.jsx";
import { useConfirm } from "../hooks/useConfirm.jsx";

const SOURCE_TYPES = [
  { code: "OFFICIAL_NOTIFICATION", label: "Official notification" },
  { code: "OFFICIAL_WEBSITE", label: "Official website" },
  { code: "OFFICIAL_CALENDAR", label: "Official calendar" },
  { code: "OFFICIAL_NOTICE", label: "Official notice" },
  { code: "OFFICIAL_ADMIT_CARD_NOTICE", label: "Official admit card notice" },
  { code: "OFFICIAL_RESULT_NOTICE", label: "Official result notice" },
  { code: "ADMIN_ESTIMATE", label: "Admin estimate (not an official source)" },
];

const BLANK_SOURCE = { sourceName: "", sourceType: "OFFICIAL_NOTIFICATION", url: "", publicationDate: "" };

function SourceFormModal({ mode, initial, onCancel, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      sourceName: form.sourceName.trim(),
      sourceType: form.sourceType,
      url: form.url.trim() || null,
      publicationDate: form.publicationDate || null,
      lastVerifiedAt: form.lastVerifiedAt || null,
    };
    try {
      if (mode === "create") await createExamSource(payload);
      else await updateExamSource(form.id, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={mode === "create" ? "Add source" : "Edit source"}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !form.sourceName.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-field" style={{ maxWidth: "none" }}>
          <label>Source name</label>
          <input
            value={form.sourceName}
            onChange={(e) => set("sourceName", e.target.value)}
            placeholder="SSC CGL 2027 Notification"
            autoFocus
            required
          />
        </div>
        <div className="form-row">
          <div className="form-field">
            <label>Type</label>
            <select value={form.sourceType} onChange={(e) => set("sourceType", e.target.value)}>
              {SOURCE_TYPES.map((t) => (
                <option key={t.code} value={t.code}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Publication date</label>
            <input type="date" value={form.publicationDate ?? ""} onChange={(e) => set("publicationDate", e.target.value)} />
          </div>
        </div>
        <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
          <label>URL</label>
          <input value={form.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="https://ssc.gov.in/..." />
          <span className="field-note">
            Shown to the user as "Read Official Notification" / "Official Website" — link it to the real
            document whenever the source type isn't "Admin estimate".
          </span>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Exam Guide spec §32 "Official Source System". Sources are exam-independent and reused
 * across a cycle's dates/documents/fees/eligibility — this is a flat list, not nested
 * under an exam, for the same reason a subject is not nested under an exam.
 */
export default function ExamSources() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editorState, setEditorState] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listExamSources()
      .then(setSources)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function handleDelete(source) {
    const ok = await confirm(
      `Delete "${source.sourceName}"? This fails if any date, document or fee row still cites it.`,
      { title: "Delete source", confirmLabel: "Delete", danger: true },
    );
    if (!ok) return;
    try {
      await deleteExamSource(source.id);
      load();
    } catch (err) {
      setError(deleteFailureMessage(err, "source"));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Exam Guide Sources</h1>
        <button className="btn btn-primary" onClick={() => setEditorState({ mode: "create", initial: BLANK_SOURCE })}>
          Add source
        </button>
      </div>

      <p className="page-intro">
        The citations behind Exam Guide content — official notifications, calendars and notices, or an
        editorial "admin estimate" where no official source exists yet. Referenced by id from important
        dates, document requirements, eligibility rules and fees.
      </p>

      {error && <div className="banner banner-error">{error}</div>}
      {loading && <p>Loading...</p>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: 200 }}>Type</th>
                <th style={{ width: 130 }}>Published</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id}>
                  <td>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noreferrer">{source.sourceName}</a>
                    ) : (
                      source.sourceName
                    )}
                  </td>
                  <td>
                    <span className={source.sourceType === "ADMIN_ESTIMATE" ? "badge badge-hard" : "badge badge-easy"}>
                      {SOURCE_TYPES.find((t) => t.code === source.sourceType)?.label ?? source.sourceType}
                    </span>
                  </td>
                  <td>{source.publicationDate ?? "—"}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-ghost icon-btn" title="Edit" onClick={() => setEditorState({ mode: "edit", initial: { ...source } })}>
                        <EditIcon />
                      </button>
                      <button className="btn btn-ghost icon-btn" title="Delete" onClick={() => handleDelete(source)}>
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sources.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">No sources yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editorState && (
        <SourceFormModal
          mode={editorState.mode}
          initial={editorState.initial}
          onCancel={() => setEditorState(null)}
          onSaved={() => {
            setEditorState(null);
            load();
          }}
        />
      )}

      {confirmDialog}
    </div>
  );
}
