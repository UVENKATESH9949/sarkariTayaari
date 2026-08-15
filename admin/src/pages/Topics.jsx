import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listSubjects, listTopics, createTopic, updateTopic, deleteTopic } from "../api.js";
import { MAX_LENGTHS } from "../constants.js";
import { deleteFailureMessage } from "../errors.js";
import Modal from "../components/Modal.jsx";
import { EditIcon, TrashIcon } from "../components/icons.jsx";
import { useConfirm } from "../hooks/useConfirm.jsx";

function sortTopics(rows) {
  // Server orders by display order; group by subject for readability when unscoped.
  return [...rows].sort(
    (a, b) => a.subjectName.localeCompare(b.subjectName) || a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)
  );
}

export default function Topics() {
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [filterSubjectId, setFilterSubjectId] = useState("");
  const [newTopic, setNewTopic] = useState({ subjectId: "", name: "" });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    listSubjects()
      .then((rows) => setSubjects([...rows].sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listTopics(filterSubjectId || undefined)
      .then((rows) => setTopics(sortTopics(rows)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filterSubjectId]);

  useEffect(load, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    const name = newTopic.name.trim();
    if (!name || !newTopic.subjectId) return;
    setSaving(true);
    setError(null);
    try {
      const siblings = topics.filter((t) => t.subjectId === newTopic.subjectId).length;
      await createTopic({ subjectId: newTopic.subjectId, name, displayOrder: siblings + 1 });
      setNewTopic((prev) => ({ subjectId: prev.subjectId, name: "" }));
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    const name = editing.name.trim();
    if (!name || !editing.subjectId) return;
    setSaving(true);
    setError(null);
    try {
      await updateTopic(editing.id, {
        subjectId: editing.subjectId,
        name,
        displayOrder: Number(editing.displayOrder) || 0,
      });
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(topic) {
    const ok = await confirm(
      `Delete "${topic.name}" from ${topic.subjectName}? Any questions still filed under it must be moved first.`,
      { title: "Delete topic", confirmLabel: "Delete", danger: true }
    );
    if (!ok) return;
    try {
      await deleteTopic(topic.id);
      load();
    } catch (err) {
      setError(deleteFailureMessage(err, "topic"));
    }
  }

  if (subjects.length === 0 && !loading) {
    return (
      <div>
        <div className="page-header">
          <h1>Topics</h1>
        </div>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="empty-state">
          Every topic belongs to a subject, and there are no subjects yet.{" "}
          <Link to="/subjects">Create a subject first.</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Topics</h1>
      </div>

      <p className="page-intro">
        Topics are the sub-divisions of a subject (Percentages under Quantitative Aptitude, for example).
        Like subjects, they are shared across every exam.
      </p>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Add topic</h2>
        <form onSubmit={handleCreate} className="inline-form">
          <select
            value={newTopic.subjectId}
            onChange={(e) => setNewTopic((prev) => ({ ...prev, subjectId: e.target.value }))}
            required
          >
            <option value="" disabled>
              Select subject...
            </option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            value={newTopic.name}
            onChange={(e) => setNewTopic((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Percentages"
            maxLength={MAX_LENGTHS.topicName}
            required
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || !newTopic.name.trim() || !newTopic.subjectId}
          >
            {saving ? "Saving..." : "Add"}
          </button>
        </form>
      </div>

      <div className="toolbar">
        <select value={filterSubjectId} onChange={(e) => setFilterSubjectId(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="muted-note">
          {loading ? "Loading..." : `${topics.length} topic${topics.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Order</th>
                <th>Topic</th>
                <th>Subject</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.id}>
                  <td>{t.displayOrder}</td>
                  <td>{t.name}</td>
                  <td>
                    <span className="badge">{t.subjectName}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-ghost icon-btn"
                        title="Edit"
                        onClick={() =>
                          setEditing({
                            id: t.id,
                            name: t.name,
                            subjectId: t.subjectId,
                            displayOrder: t.displayOrder,
                          })
                        }
                      >
                        <EditIcon />
                      </button>
                      <button className="btn btn-ghost icon-btn" title="Delete" onClick={() => handleDelete(t)}>
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {topics.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">No topics here yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal
          title="Edit topic"
          size="sm"
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          }
        >
          <form onSubmit={handleSaveEdit}>
            <div className="form-field" style={{ maxWidth: "none" }}>
              <label>Subject</label>
              <select
                value={editing.subjectId}
                onChange={(e) => setEditing((prev) => ({ ...prev, subjectId: e.target.value }))}
                required
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field" style={{ maxWidth: "none" }}>
              <label>Name</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing((prev) => ({ ...prev, name: e.target.value }))}
                maxLength={MAX_LENGTHS.topicName}
                autoFocus
                required
              />
            </div>
            <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
              <label>Display order</label>
              <input
                type="number"
                value={editing.displayOrder}
                onChange={(e) => setEditing((prev) => ({ ...prev, displayOrder: e.target.value }))}
              />
            </div>
          </form>
        </Modal>
      )}

      {confirmDialog}
    </div>
  );
}
