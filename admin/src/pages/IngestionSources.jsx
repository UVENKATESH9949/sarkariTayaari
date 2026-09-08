import { useCallback, useEffect, useState } from "react";
import {
  listIngestionSources,
  createIngestionSource,
  updateIngestionSource,
  deleteIngestionSource,
  scanIngestionSource,
  listIngestionNotices,
} from "../api.js";
import { deleteFailureMessage } from "../errors.js";
import Modal from "../components/Modal.jsx";
import { EditIcon, TrashIcon } from "../components/icons.jsx";
import { useConfirm } from "../hooks/useConfirm.jsx";

const SOURCE_TYPES = [
  { code: "API", label: "API" },
  { code: "WEBSITE", label: "Website" },
  { code: "PDF", label: "PDF listing" },
  { code: "RSS", label: "RSS" },
  { code: "SITEMAP", label: "Sitemap" },
  { code: "MANUAL", label: "Manual (no automated discovery)" },
  { code: "HYBRID", label: "Hybrid" },
];

const BLANK_SOURCE = {
  organization: "",
  name: "",
  baseUrl: "",
  sourceType: "API",
  parserKey: "",
  configText: "",
  active: true,
  checkFrequencyMinutes: 1440,
};

function SourceFormModal({ mode, initial, onCancel, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    let config = null;
    if (form.configText && form.configText.trim()) {
      try {
        config = JSON.parse(form.configText);
      } catch {
        setError("Config must be valid JSON (or left blank).");
        return;
      }
    }

    setSaving(true);
    const payload = {
      organization: form.organization.trim(),
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim(),
      sourceType: form.sourceType,
      parserKey: form.parserKey.trim(),
      config,
      active: form.active,
      checkFrequencyMinutes: Number(form.checkFrequencyMinutes) || 1440,
    };
    try {
      if (mode === "create") await createIngestionSource(payload);
      else await updateIngestionSource(form.id, payload);
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
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={saving || !form.organization.trim() || !form.name.trim() || !form.baseUrl.trim() || !form.parserKey.trim()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-field">
            <label>Organization</label>
            <input
              value={form.organization}
              onChange={(e) => set("organization", e.target.value)}
              placeholder="Staff Selection Commission"
              autoFocus
              required
            />
          </div>
          <div className="form-field">
            <label>Source name</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="SSC Notice Board"
              required
            />
          </div>
        </div>
        <div className="form-field" style={{ maxWidth: "none" }}>
          <label>Base URL</label>
          <input
            value={form.baseUrl}
            onChange={(e) => set("baseUrl", e.target.value)}
            placeholder="https://ssc.gov.in"
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
            <label>Parser key</label>
            <input
              value={form.parserKey}
              onChange={(e) => set("parserKey", e.target.value)}
              placeholder="ssc_notice_board_v1"
              required
            />
            <span className="field-note">Resolves to the adapter bean that knows how to scan this source.</span>
          </div>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label>Check frequency (minutes)</label>
            <input
              type="number"
              min="1"
              value={form.checkFrequencyMinutes}
              onChange={(e) => set("checkFrequencyMinutes", e.target.value)}
            />
          </div>
          <div className="form-field">
            <label>Active</label>
            <select value={form.active ? "true" : "false"} onChange={(e) => set("active", e.target.value === "true")}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
        <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
          <label>Config (JSON, optional)</label>
          <textarea
            rows={4}
            value={form.configText}
            onChange={(e) => set("configText", e.target.value)}
            placeholder='{"allowedPathPrefix": "/api/attachment/uploads/masterData/"}'
          />
          <span className="field-note">Adapter-specific settings. Left blank means the adapter's own defaults.</span>
        </div>
      </form>
    </Modal>
  );
}

function toFormState(source) {
  return {
    ...source,
    configText: source.config ? JSON.stringify(source.config, null, 2) : "",
  };
}

const NOTICE_STATUS_TABS = [
  { value: "ACTIVE", label: "Active" },
  { value: "REMOVED", label: "Removed" },
  { value: "ALL", label: "All" },
];

/** TASK-2401 Task 3 -- a raw list of what the last scan(s) discovered. Not the review
 * queue (Documents 8-9/11, a later task) -- there's nothing to Accept/Reject here yet,
 * this just proves discovery is actually working. */
function NoticesModal({ source, onClose }) {
  const [status, setStatus] = useState("ACTIVE");
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listIngestionNotices(source.id, status)
      .then(setNotices)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [source.id, status]);

  return (
    <Modal
      title={`Notices — ${source.name}`}
      onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Close</button>}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {NOTICE_STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            className={`btn btn-sm ${status === tab.value ? "btn-primary" : ""}`}
            onClick={() => setStatus(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {loading && <p>Loading...</p>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th style={{ width: 160 }}>External ref</th>
                <th style={{ width: 140 }}>Published</th>
                <th style={{ width: 140 }}>Last seen</th>
                <th style={{ width: 90 }}>Document</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((n) => (
                <tr key={n.id}>
                  <td>
                    {n.noticeUrl ? (
                      <a href={n.noticeUrl} target="_blank" rel="noreferrer">{n.title}</a>
                    ) : (
                      n.title
                    )}
                  </td>
                  <td>{n.externalRef ?? "—"}</td>
                  <td>{n.publishedAt ? new Date(n.publishedAt).toLocaleDateString() : "—"}</td>
                  <td>{new Date(n.lastSeenAt).toLocaleString()}</td>
                  <td>
                    {n.documentUrl ? (
                      <a href={n.documentUrl} target="_blank" rel="noreferrer">View PDF</a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {notices.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">No notices in this state yet — try "Scan now" first.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/**
 * TASK-2401 Document 3/11 -- the Source Registry (Task 2) plus a manual scan trigger and
 * a raw notices view (Task 3). No document download or review queue yet (Task 4+).
 */
export default function IngestionSources() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editorState, setEditorState] = useState(null);
  const [noticesSource, setNoticesSource] = useState(null);
  const [scanningId, setScanningId] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listIngestionSources()
      .then(setSources)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function handleDelete(source) {
    const ok = await confirm(`Delete "${source.name}"? This cannot be undone.`, {
      title: "Delete source",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteIngestionSource(source.id);
      load();
    } catch (err) {
      setError(deleteFailureMessage(err, "source"));
    }
  }

  async function handleScan(source) {
    setScanningId(source.id);
    setNotice(null);
    setError(null);
    try {
      const result = await scanIngestionSource(source.id);
      setNotice(
        `Scan complete for "${source.name}": ${result.discovered} discovered — ` +
          `${result.created} new, ${result.updated} updated, ${result.unchanged} unchanged, ${result.removed} removed.`,
      );
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanningId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Ingestion Sources</h1>
        <button
          className="btn btn-primary"
          onClick={() => setEditorState({ mode: "create", initial: BLANK_SOURCE })}
        >
          Add source
        </button>
      </div>

      <p className="page-intro">
        Organizations/sites this app knows how to poll for new recruitment notices (TASK-2401). "Scan now"
        discovers new/changed/removed notices — there's no document download or review queue yet, those
        land in later tasks of the same approved plan.
      </p>

      {notice && <div className="banner banner-success">{notice}</div>}
      {error && <div className="banner banner-error">{error}</div>}
      {loading && <p>Loading...</p>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Name</th>
                <th style={{ width: 100 }}>Type</th>
                <th style={{ width: 160 }}>Parser key</th>
                <th style={{ width: 90 }}>Active</th>
                <th style={{ width: 220 }}></th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id}>
                  <td>{source.organization}</td>
                  <td>
                    <a href={source.baseUrl} target="_blank" rel="noreferrer">{source.name}</a>
                  </td>
                  <td>
                    <span className="badge badge-easy">{source.sourceType}</span>
                  </td>
                  <td>{source.parserKey}</td>
                  <td>
                    <span className={source.active ? "badge badge-easy" : "badge badge-hard"}>
                      {source.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-sm"
                        onClick={() => handleScan(source)}
                        disabled={scanningId === source.id}
                      >
                        {scanningId === source.id ? "Scanning..." : "Scan now"}
                      </button>
                      <button className="btn btn-sm" onClick={() => setNoticesSource(source)}>
                        View notices
                      </button>
                      <button
                        className="btn btn-ghost icon-btn"
                        title="Edit"
                        onClick={() => setEditorState({ mode: "edit", initial: toFormState(source) })}
                      >
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
                  <td colSpan={6}>
                    <div className="empty-state">No ingestion sources yet.</div>
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

      {noticesSource && <NoticesModal source={noticesSource} onClose={() => setNoticesSource(null)} />}

      {confirmDialog}
    </div>
  );
}
