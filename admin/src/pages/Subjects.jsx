import { useCallback, useEffect, useState } from "react";
import { listSubjects, listTopics, createSubject, updateSubject, deleteSubject } from "../api.js";
import { MAX_LENGTHS } from "../constants.js";
import { deleteFailureMessage } from "../errors.js";
import Modal from "../components/Modal.jsx";
import { EditIcon, TrashIcon } from "../components/icons.jsx";
import { useConfirm } from "../hooks/useConfirm.jsx";

export default function Subjects() {
  const [subjects, setSubjects] = useState([]);
  const [topicCounts, setTopicCounts] = useState({});
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([listSubjects(), listTopics()])
      .then(([subjectRows, topicRows]) => {
        // Server orders by display_order then name — keep that order.
        setSubjects(subjectRows);
        const counts = {};
        topicRows.forEach((t) => {
          counts[t.subjectId] = (counts[t.subjectId] || 0) + 1;
        });
        setTopicCounts(counts);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      // Quick add stays quick: it lands at the end, and icon/colour are set when editing.
      await createSubject({ name, displayOrder: subjects.length + 1 });
      setNewName("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    const name = editing.name.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      await updateSubject(editing.id, {
        name,
        displayOrder: Number(editing.displayOrder) || 0,
        icon: editing.icon ? editing.icon.trim() : null,
        color: editing.color || null,
        colorBg: editing.colorBg || null,
      });
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(subject) {
    const count = topicCounts[subject.id] || 0;
    const warning =
      count > 0
        ? ` It still has ${count} topic${count === 1 ? "" : "s"}, so this will fail until those are removed.`
        : "";
    const ok = await confirm(`Delete "${subject.name}"?${warning}`, {
      title: "Delete subject",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSubject(subject.id);
      load();
    } catch (err) {
      setError(deleteFailureMessage(err, "subject"));
    }
  }

  const set = (field, value) => setEditing((prev) => ({ ...prev, [field]: value }));

  return (
    <div>
      <div className="page-header">
        <h1>Subjects</h1>
      </div>

      <p className="page-intro">
        Subjects are shared across every exam — there is no separate "SSC CGL Quant". Which subjects an exam actually
        covers is set per section in that exam's structure. Icon and colour are stored here, so a new subject renders
        correctly in the app without a release.
      </p>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Add subject</h2>
        <form onSubmit={handleCreate} className="inline-form">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Quantitative Aptitude"
            maxLength={MAX_LENGTHS.subjectName}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={saving || !newName.trim()}>
            {saving ? "Saving..." : "Add"}
          </button>
        </form>
      </div>

      {loading && <p>Loading...</p>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Order</th>
                <th>Name</th>
                <th style={{ width: 130 }}>Appearance</th>
                <th>Exams</th>
                <th style={{ width: 100 }}>Topics</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td>{s.displayOrder}</td>
                  <td>{s.name}</td>
                  <td>
                    {s.color || s.colorBg ? (
                      <span
                        className="badge"
                        style={{ color: s.color || undefined, background: s.colorBg || undefined, borderColor: "transparent" }}
                      >
                        {s.icon || "styled"}
                      </span>
                    ) : (
                      <span className="cell-secondary">default</span>
                    )}
                  </td>
                  <td>
                    {s.examCodes && s.examCodes.length > 0 ? (
                      s.examCodes.map((code) => (
                        <span className="badge" key={code}>{code}</span>
                      ))
                    ) : (
                      <span className="cell-secondary">not in any syllabus</span>
                    )}
                  </td>
                  <td>
                    <span className="badge">{topicCounts[s.id] || 0}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-ghost icon-btn"
                        title="Edit"
                        onClick={() =>
                          setEditing({
                            id: s.id,
                            name: s.name,
                            displayOrder: s.displayOrder,
                            icon: s.icon || "",
                            color: s.color || "",
                            colorBg: s.colorBg || "",
                          })
                        }
                      >
                        <EditIcon />
                      </button>
                      <button className="btn btn-ghost icon-btn" title="Delete" onClick={() => handleDelete(s)}>
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {subjects.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">No subjects yet. Add one above.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal
          title="Edit subject"
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving || !editing.name.trim()}>
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          }
        >
          <div className="form-row">
            <div className="form-field">
              <label>Name</label>
              <input
                value={editing.name}
                onChange={(e) => set("name", e.target.value)}
                maxLength={MAX_LENGTHS.subjectName}
                autoFocus
              />
            </div>
            <div className="form-field">
              <label>Display order</label>
              <input type="number" value={editing.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} />
            </div>
          </div>

          <div className="form-field" style={{ maxWidth: "none" }}>
            <label>Icon name</label>
            <input value={editing.icon} onChange={(e) => set("icon", e.target.value)} placeholder="calculator-outline" />
            <span className="field-note">An Ionicons name used by the mobile app.</span>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Text colour</label>
              <div className="color-field">
                <input type="color" value={editing.color || "#000000"} onChange={(e) => set("color", e.target.value)} />
                <input value={editing.color} onChange={(e) => set("color", e.target.value)} placeholder="#4c5fd5" />
              </div>
            </div>
            <div className="form-field">
              <label>Background colour</label>
              <div className="color-field">
                <input type="color" value={editing.colorBg || "#ffffff"} onChange={(e) => set("colorBg", e.target.value)} />
                <input value={editing.colorBg} onChange={(e) => set("colorBg", e.target.value)} placeholder="#eef2ff" />
              </div>
            </div>
          </div>
        </Modal>
      )}

      {confirmDialog}
    </div>
  );
}
