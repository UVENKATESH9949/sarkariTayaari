import { useCallback, useEffect, useState } from "react";
import { listPaperTypes, createPaperType, updatePaperType, deletePaperType } from "../api.js";
import { deleteFailureMessage } from "../errors.js";
import Modal from "../components/Modal.jsx";
import { EditIcon, TrashIcon } from "../components/icons.jsx";
import { useConfirm } from "../hooks/useConfirm.jsx";

const BLANK_TYPE = { code: "", label: "", mockable: false, displayOrder: 0 };

function TypeFormModal({ mode, initial, onCancel, onSaved }) {
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
      mockable: form.mockable,
      displayOrder: Number(form.displayOrder) || 0,
    };
    try {
      if (mode === "create") await createPaperType(payload);
      else await updatePaperType(payload.code, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={mode === "create" ? "Add paper type" : "Edit paper type"}
      size="sm"
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

      <div className="form-field" style={{ maxWidth: "none" }}>
        <label>Code</label>
        <input
          value={form.code}
          onChange={(e) => set("code", e.target.value.toLowerCase().replace(/\s+/g, "-"))}
          placeholder="objective"
          disabled={mode === "edit"}
        />
        {mode === "edit" && <span className="field-note">Papers reference this code, so it cannot be changed.</span>}
      </div>

      <div className="form-field" style={{ maxWidth: "none" }}>
        <label>Label</label>
        <input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Objective (MCQ)" />
      </div>

      <div className="form-field" style={{ maxWidth: "none" }}>
        <label>Display order</label>
        <input type="number" value={form.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} />
      </div>

      <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
        <label>Mock tests</label>
        <label className="checkbox-field">
          <input type="checkbox" checked={form.mockable} onChange={(e) => set("mockable", e.target.checked)} />
          A mock test can be generated from papers of this type
        </label>
        <span className="field-note">
          Leave off for descriptive, skill or interview papers — the app shows them in the exam pattern but does not
          try to build a test from them.
        </span>
      </div>
    </Modal>
  );
}

export default function PaperTypes() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editorState, setEditorState] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listPaperTypes()
      .then(setTypes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function handleDelete(type) {
    const ok = await confirm(
      `Delete "${type.label}"? This fails if any paper still uses it.`,
      { title: "Delete paper type", confirmLabel: "Delete", danger: true }
    );
    if (!ok) return;
    try {
      await deletePaperType(type.code);
      load();
    } catch (err) {
      setError(deleteFailureMessage(err, "paper type"));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Paper Types</h1>
        <button className="btn btn-primary" onClick={() => setEditorState({ mode: "create", initial: BLANK_TYPE })}>
          Add type
        </button>
      </div>

      <p className="page-intro">
        Categorises each paper in an exam's structure, and decides whether a mock test can be generated from it.
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
                <th style={{ width: 160 }}>Mock testable</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {types.map((type) => (
                <tr key={type.code}>
                  <td>{type.displayOrder}</td>
                  <td><span className="badge">{type.code}</span></td>
                  <td>{type.label}</td>
                  <td>
                    <span className={type.mockable ? "badge badge-easy" : "badge"}>
                      {type.mockable ? "Yes" : "No"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-ghost icon-btn"
                        title="Edit"
                        onClick={() => setEditorState({ mode: "edit", initial: { ...type } })}
                      >
                        <EditIcon />
                      </button>
                      <button className="btn btn-ghost icon-btn" title="Delete" onClick={() => handleDelete(type)}>
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {types.length === 0 && (
                <tr>
                  <td colSpan={5}><div className="empty-state">No paper types yet.</div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editorState && (
        <TypeFormModal
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
