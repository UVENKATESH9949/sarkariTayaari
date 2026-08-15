import { useCallback, useEffect, useState } from "react";
import {
  listAllDifficultyLevels,
  createDifficultyLevel,
  updateDifficultyLevel,
  deleteDifficultyLevel,
} from "../api.js";
import { deleteFailureMessage } from "../errors.js";
import Modal from "../components/Modal.jsx";
import { EditIcon, TrashIcon } from "../components/icons.jsx";
import { useConfirm } from "../hooks/useConfirm.jsx";

const BLANK_LEVEL = {
  code: "",
  label: "",
  displayOrder: 0,
  color: "#4c5fd5",
  colorBg: "#eef2ff",
  icon: "",
  active: true,
};

function LevelFormModal({ mode, initial, onCancel, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    const payload = {
      code: form.code.trim(),
      label: form.label.trim(),
      displayOrder: Number(form.displayOrder) || 0,
      color: form.color || null,
      colorBg: form.colorBg || null,
      icon: form.icon ? form.icon.trim() : null,
      active: form.active,
    };
    try {
      if (mode === "create") await createDifficultyLevel(payload);
      else await updateDifficultyLevel(payload.code, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={mode === "create" ? "Add difficulty level" : "Edit difficulty level"}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={saving || !form.code.trim() || !form.label.trim()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}

      <div className="form-row">
        <div className="form-field">
          <label>Code</label>
          <input
            value={form.code}
            onChange={(e) => set("code", e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            placeholder="very-hard"
            disabled={mode === "edit"}
          />
          {mode === "edit"
            ? <span className="field-note">Questions reference this code, so it cannot be changed.</span>
            : <span className="field-note">Stored on every question. Lower case, no spaces.</span>}
        </div>
        <div className="form-field">
          <label>Label</label>
          <input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Very Hard" />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Display order</label>
          <input type="number" value={form.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} />
        </div>
        <div className="form-field">
          <label>Icon name</label>
          <input value={form.icon} onChange={(e) => set("icon", e.target.value)} placeholder="flame-outline" />
          <span className="field-note">An Ionicons name used by the mobile app.</span>
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Text colour</label>
          <div className="color-field">
            <input type="color" value={form.color || "#000000"} onChange={(e) => set("color", e.target.value)} />
            <input value={form.color || ""} onChange={(e) => set("color", e.target.value)} placeholder="#2f9e64" />
          </div>
        </div>
        <div className="form-field">
          <label>Background colour</label>
          <div className="color-field">
            <input type="color" value={form.colorBg || "#ffffff"} onChange={(e) => set("colorBg", e.target.value)} />
            <input value={form.colorBg || ""} onChange={(e) => set("colorBg", e.target.value)} placeholder="#e8f7f0" />
          </div>
        </div>
      </div>

      <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
        <label>Visibility</label>
        <label className="checkbox-field">
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
          Active (offered in the mobile app)
        </label>
      </div>
    </Modal>
  );
}

export default function DifficultyLevels() {
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editorState, setEditorState] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listAllDifficultyLevels()
      .then(setLevels)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function handleDelete(level) {
    const ok = await confirm(
      `Delete "${level.label}"? This fails if any question still uses it. To retire it without touching content, turn off Active instead.`,
      { title: "Delete difficulty level", confirmLabel: "Delete", danger: true }
    );
    if (!ok) return;
    try {
      await deleteDifficultyLevel(level.code);
      load();
    } catch (err) {
      setError(deleteFailureMessage(err, "difficulty level"));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Difficulty Levels</h1>
        <button className="btn btn-primary" onClick={() => setEditorState({ mode: "create", initial: BLANK_LEVEL })}>
          Add level
        </button>
      </div>

      <p className="page-intro">
        Every question carries one of these. Adding a level here makes it selectable straight away — the mobile app
        renders whatever it receives, so no app release is needed.
      </p>

      {error && <div className="banner banner-error">{error}</div>}

      {loading && <p>Loading...</p>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Order</th>
                <th>Code</th>
                <th>Label</th>
                <th style={{ width: 120 }}>Preview</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => (
                <tr key={level.code} className={level.active ? "" : "muted-row"}>
                  <td>{level.displayOrder}</td>
                  <td><span className="badge">{level.code}</span></td>
                  <td>{level.label}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        color: level.color || undefined,
                        background: level.colorBg || undefined,
                        borderColor: "transparent",
                      }}
                    >
                      {level.label}
                    </span>
                  </td>
                  <td>
                    <span className={level.active ? "badge badge-easy" : "badge"}>
                      {level.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-ghost icon-btn"
                        title="Edit"
                        onClick={() => setEditorState({ mode: "edit", initial: { ...level, icon: level.icon || "" } })}
                      >
                        <EditIcon />
                      </button>
                      <button className="btn btn-ghost icon-btn" title="Delete" onClick={() => handleDelete(level)}>
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {levels.length === 0 && (
                <tr>
                  <td colSpan={6}><div className="empty-state">No difficulty levels yet.</div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editorState && (
        <LevelFormModal
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
