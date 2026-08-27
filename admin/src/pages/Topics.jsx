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

/**
 * Whether `candidate` sits somewhere below `ancestorId` in the topic tree. Used to keep a
 * topic's own descendants out of its parent picker.
 *
 * The `seen` guard is not theoretical: the API only started rejecting cycles in V12, so a
 * tree that already contains one would otherwise loop here forever and hang the page.
 */
function isDescendantOf(candidate, ancestorId, allTopics) {
  const byId = new Map(allTopics.map((t) => [t.id, t]));
  const seen = new Set();
  let current = candidate;
  while (current && current.parentId) {
    if (seen.has(current.id)) return false;
    seen.add(current.id);
    if (current.parentId === ancestorId) return true;
    current = byId.get(current.parentId);
  }
  return false;
}

export default function Topics() {
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  // Unfiltered, for the editor's parent/prerequisite pickers. The table's `topics` list is
  // subject-filtered, and walking a parent chain against a partial list could miss a link.
  const [allTopics, setAllTopics] = useState([]);
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
    Promise.all([listTopics(filterSubjectId || undefined), listTopics()])
      .then(([filtered, everything]) => {
        setTopics(sortTopics(filtered));
        setAllTopics(everything);
      })
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
        parentId: editing.parentId || null,
        // Always sent, so clearing every checkbox actually clears them. The API treats a
        // missing field as "leave unchanged" and an empty array as "clear" — those are
        // different, and this screen always means the latter.
        prerequisiteTopicIds: editing.prerequisiteTopicIds,
      });
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Every other topic in the same subject. Both the parent picker and the prerequisite
  // list are scoped this way because the API enforces the same-subject rule for parents,
  // and a cross-subject prerequisite would be meaningless on a subject-scoped screen.
  const siblingsInSubject = editing
    ? allTopics.filter((t) => t.subjectId === editing.subjectId && t.id !== editing.id)
    : [];

  /**
   * The parent list additionally excludes this topic's own descendants. The server rejects
   * such an edge anyway, but offering it and then failing teaches the admin nothing —
   * a descendant simply cannot be a valid parent, so it shouldn't be selectable.
   */
  const parentOptions = editing
    ? siblingsInSubject.filter((t) => !isDescendantOf(t, editing.id, allTopics))
    : [];

  const prerequisiteOptions = siblingsInSubject;

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
                <th style={{ width: 160 }}>Parent</th>
                <th style={{ width: 110 }}>Prerequisites</th>
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
                  <td>{t.parentName || <span className="muted-note">—</span>}</td>
                  <td>
                    {t.prerequisiteTopicIds && t.prerequisiteTopicIds.length > 0 ? (
                      <span className="badge">{t.prerequisiteTopicIds.length}</span>
                    ) : (
                      <span className="muted-note">—</span>
                    )}
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
                            // Nullable columns become "" / [] so the controls stay controlled.
                            parentId: t.parentId || "",
                            prerequisiteTopicIds: t.prerequisiteTopicIds || [],
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
                  <td colSpan={6}>
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
            <div className="form-field" style={{ maxWidth: "none" }}>
              <label>Display order</label>
              <input
                type="number"
                value={editing.displayOrder}
                onChange={(e) => setEditing((prev) => ({ ...prev, displayOrder: e.target.value }))}
              />
            </div>

            <div className="form-field" style={{ maxWidth: "none" }}>
              <label>Parent topic</label>
              <select
                value={editing.parentId}
                onChange={(e) => setEditing((prev) => ({ ...prev, parentId: e.target.value }))}
              >
                <option value="">None — top level</option>
                {parentOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <span className="field-note">
                Lets a subject nest as deeply as it needs (Arithmetic &rarr; Percentage &rarr; Successive
                Percentage). Only topics in the same subject can be a parent.
              </span>
            </div>

            <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
              <label>Prerequisites</label>
              {prerequisiteOptions.length === 0 ? (
                <span className="field-note">
                  No other topics in this subject yet — add more before setting prerequisites.
                </span>
              ) : (
                <div className="checkbox-grid">
                  {prerequisiteOptions.map((t) => (
                    <label key={t.id} className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={editing.prerequisiteTopicIds.includes(t.id)}
                        onChange={(e) =>
                          setEditing((prev) => ({
                            ...prev,
                            prerequisiteTopicIds: e.target.checked
                              ? [...prev.prerequisiteTopicIds, t.id]
                              : prev.prerequisiteTopicIds.filter((id) => id !== t.id),
                          }))
                        }
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
              )}
              <span className="field-note">
                Topics a student should finish first. The server rejects anything that would create a
                loop, however long the chain.
              </span>
            </div>
          </form>
        </Modal>
      )}

      {confirmDialog}
    </div>
  );
}
