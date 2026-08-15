import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAllExams, createExam, updateExam, deleteExam, uploadImage } from "../api.js";
import { MAX_LENGTHS, IMAGE_MAX_BYTES } from "../constants.js";
import { deleteFailureMessage } from "../errors.js";
import Modal from "../components/Modal.jsx";
import { EditIcon, TrashIcon } from "../components/icons.jsx";
import { useConfirm } from "../hooks/useConfirm.jsx";

const BLANK_EXAM = { code: "", name: "", imageUrl: "", active: true, displayOrder: 0 };

function ExamFormModal({ mode, initial, onCancel, onSaved }) {
  const [form, setForm] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError(null);
    if (file.size > IMAGE_MAX_BYTES) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 5MB.`);
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      set("imageUrl", url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    // Sent whole every time: PUT is a full replace, and omitted primitives reset to false/0.
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      imageUrl: form.imageUrl ? form.imageUrl.trim() : null,
      active: form.active,
      displayOrder: Number(form.displayOrder) || 0,
    };
    try {
      if (mode === "create") await createExam(payload);
      else await updateExam(payload.code, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={mode === "create" ? "Add exam" : "Edit exam"}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={saving || uploading || !form.code.trim() || !form.name.trim()}
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
            <label>Code</label>
            <input
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="SSC_CGL"
              maxLength={MAX_LENGTHS.examCode}
              disabled={mode === "edit"}
              required
            />
            {mode === "edit" && <span className="field-note">Code is the identifier and cannot be changed.</span>}
          </div>

          <div className="form-field">
            <label>Name</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="SSC CGL"
              maxLength={MAX_LENGTHS.examName}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>Display order</label>
            <input
              type="number"
              value={form.displayOrder}
              onChange={(e) => set("displayOrder", e.target.value)}
            />
          </div>

          <div className="form-field">
            <label>Visibility</label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
              Active (visible in the mobile app)
            </label>
          </div>
        </div>

        <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
          <label>Image</label>
          <div className="image-picker">
            {form.imageUrl ? (
              <img src={form.imageUrl} alt="" className="thumb thumb-lg" />
            ) : (
              <div className="thumb thumb-lg thumb-empty">None</div>
            )}
            <div>
              <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} />
              {uploading && <span className="field-note">Uploading...</span>}
              {form.imageUrl && !uploading && (
                <button type="button" className="btn btn-sm" onClick={() => set("imageUrl", "")}>
                  Remove image
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function Exams() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editorState, setEditorState] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    // /all rather than the bare list, so inactive exams stay manageable here.
    listAllExams()
      .then((rows) =>
        setExams([...rows].sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code)))
      )
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function handleDelete(exam) {
    const ok = await confirm(
      `Delete "${exam.name}"? Questions tagged to this exam must be re-tagged first. To simply hide it from the app, edit it and turn off Active instead.`,
      { title: "Delete exam", confirmLabel: "Delete", danger: true }
    );
    if (!ok) return;
    try {
      await deleteExam(exam.code);
      load();
    } catch (err) {
      setError(deleteFailureMessage(err, "exam"));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Exams</h1>
        <button className="btn btn-primary" onClick={() => setEditorState({ mode: "create", initial: BLANK_EXAM })}>
          Add exam
        </button>
      </div>

      <p className="page-intro">
        Questions are tagged to one or more exams. Only active exams appear in the mobile app, ordered by
        display order.
      </p>

      {error && <div className="banner banner-error">{error}</div>}

      {loading && <p>Loading...</p>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 60 }}></th>
                <th>Code</th>
                <th>Name</th>
                <th style={{ width: 90 }}>Order</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 190 }}></th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam.code} className={exam.active ? "" : "muted-row"}>
                  <td>
                    {exam.imageUrl ? (
                      <img src={exam.imageUrl} alt="" className="thumb" />
                    ) : (
                      <div className="thumb thumb-empty">—</div>
                    )}
                  </td>
                  <td>
                    <span className="badge">{exam.code}</span>
                  </td>
                  <td>{exam.name}</td>
                  <td>{exam.displayOrder}</td>
                  <td>
                    <span className={exam.active ? "badge badge-easy" : "badge"}>
                      {exam.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link to={`/exams/${exam.code}/structure`} className="btn btn-sm">
                        Structure
                      </Link>
                      <button
                        className="btn btn-ghost icon-btn"
                        title="Edit"
                        onClick={() =>
                          setEditorState({
                            mode: "edit",
                            initial: { ...exam, imageUrl: exam.imageUrl || "" },
                          })
                        }
                      >
                        <EditIcon />
                      </button>
                      <button className="btn btn-ghost icon-btn" title="Delete" onClick={() => handleDelete(exam)}>
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {exams.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">No exams yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editorState && (
        <ExamFormModal
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
