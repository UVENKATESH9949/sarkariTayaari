import { useCallback, useEffect, useState } from "react";
import { listAllLanguages, createLanguage, updateLanguage, deleteLanguage } from "../api.js";
import { MAX_LENGTHS } from "../constants.js";
import { deleteFailureMessage } from "../errors.js";
import Modal from "../components/Modal.jsx";
import { EditIcon, TrashIcon } from "../components/icons.jsx";
import { useConfirm } from "../hooks/useConfirm.jsx";

const BLANK_LANGUAGE = { code: "", name: "", active: true };

function LanguageFormModal({ mode, initial, onCancel, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = { code: form.code.trim(), name: form.name.trim(), active: form.active };
    try {
      if (mode === "create") await createLanguage(payload);
      else await updateLanguage(payload.code, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={mode === "create" ? "Add language" : "Edit language"}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={saving || !form.code.trim() || !form.name.trim()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-field" style={{ maxWidth: "none" }}>
          <label>Code</label>
          <input
            value={form.code}
            onChange={(e) => set("code", e.target.value.toLowerCase())}
            placeholder="te"
            maxLength={MAX_LENGTHS.languageCode}
            disabled={mode === "edit"}
            required
          />
          <span className="field-note">
            {mode === "edit"
              ? "Code is the identifier and cannot be changed."
              : "Short code used on every translation, e.g. en, hi, te."}
          </span>
        </div>

        <div className="form-field" style={{ maxWidth: "none" }}>
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Telugu"
            maxLength={MAX_LENGTHS.languageName}
            required
          />
        </div>

        <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
          <label>Visibility</label>
          <label className="checkbox-field">
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
            Active (offered in the mobile app)
          </label>
        </div>
      </form>
    </Modal>
  );
}

export default function Languages() {
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editorState, setEditorState] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listAllLanguages()
      .then((rows) => setLanguages([...rows].sort((a, b) => a.code.localeCompare(b.code))))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function handleDelete(language) {
    const ok = await confirm(
      `Delete "${language.name}"? This fails if any question has a ${language.code} translation. To stop offering it without losing content, turn off Active instead.`,
      { title: "Delete language", confirmLabel: "Delete", danger: true }
    );
    if (!ok) return;
    try {
      await deleteLanguage(language.code);
      load();
    } catch (err) {
      setError(deleteFailureMessage(err, "language"));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Languages</h1>
        <button
          className="btn btn-primary"
          onClick={() => setEditorState({ mode: "create", initial: BLANK_LANGUAGE })}
        >
          Add language
        </button>
      </div>

      <p className="page-intro">
        English is the mandatory root language for every question; others are added per question as
        translations become available. Adding a language here does not create any content — it just makes
        the code available to author against.
      </p>

      {error && <div className="banner banner-error">{error}</div>}

      {loading && <p>Loading...</p>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Code</th>
                <th>Name</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {languages.map((language) => (
                <tr key={language.code} className={language.active ? "" : "muted-row"}>
                  <td>
                    <span className="badge badge-lang">{language.code}</span>
                  </td>
                  <td>{language.name}</td>
                  <td>
                    <span className={language.active ? "badge badge-easy" : "badge"}>
                      {language.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-ghost icon-btn"
                        title="Edit"
                        onClick={() => setEditorState({ mode: "edit", initial: { ...language } })}
                      >
                        <EditIcon />
                      </button>
                      <button
                        className="btn btn-ghost icon-btn"
                        title="Delete"
                        onClick={() => handleDelete(language)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {languages.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">No languages yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editorState && (
        <LanguageFormModal
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
