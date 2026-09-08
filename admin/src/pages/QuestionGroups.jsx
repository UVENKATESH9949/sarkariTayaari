import { useCallback, useEffect, useState } from "react";
import {
  listQuestionGroups,
  createQuestionGroup,
  updateQuestionGroup,
  upsertQuestionGroupTranslation,
  deleteQuestionGroup,
  createQuestionMedia,
  deleteQuestionMedia,
  listLanguages,
} from "../api.js";
import { deleteFailureMessage } from "../errors.js";
import Modal from "../components/Modal.jsx";
import { EditIcon, TrashIcon } from "../components/icons.jsx";
import { useConfirm } from "../hooks/useConfirm.jsx";

/** Mirrors the backend's QuestionGroupType enum exactly (TASK-2301 Phase P3). */
const GROUP_TYPES = [
  { code: "PASSAGE", label: "Passage" },
  { code: "DATA_INTERPRETATION", label: "Data Interpretation" },
  { code: "IMAGE", label: "Image" },
  { code: "MAP", label: "Map" },
];

const MEDIA_TYPES = [
  { code: "IMAGE", label: "Image" },
  { code: "MAP", label: "Map" },
];

function GroupFormModal({ mode, initial, languages, onCancel, onSaved }) {
  const [groupType, setGroupType] = useState(initial.groupType);
  const [passagesByLanguage, setPassagesByLanguage] = useState(initial.translations ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      let groupId = initial.id;
      if (mode === "create") {
        const translations = Object.entries(passagesByLanguage)
          .filter(([, text]) => text.trim())
          .map(([languageCode, text]) => ({ languageCode, passageText: text.trim() }));
        const created = await createQuestionGroup({ groupType, translations });
        groupId = created.id;
      } else {
        await updateQuestionGroup(groupId, { groupType });
        for (const [languageCode, text] of Object.entries(passagesByLanguage)) {
          if ((text ?? "").trim() === (initial.translations?.[languageCode] ?? "")) continue;
          await upsertQuestionGroupTranslation(groupId, languageCode, { passageText: text.trim() || null });
        }
      }
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={mode === "create" ? "Add question group" : "Edit question group"}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label>Group type</label>
          <select value={groupType} onChange={(e) => setGroupType(e.target.value)}>
            {GROUP_TYPES.map((g) => (
              <option key={g.code} value={g.code}>{g.label}</option>
            ))}
          </select>
        </div>
        <span className="field-note">
          A passage/dataset shared by several questions — attach individual questions to this group
          from the question form's own "Shared group" field.
        </span>
        {languages.map((l) => (
          <div className="form-field" style={{ maxWidth: "none" }} key={l.code}>
            <label>Passage text ({l.name})</label>
            <textarea
              rows={4}
              value={passagesByLanguage[l.code] ?? ""}
              onChange={(e) => setPassagesByLanguage((prev) => ({ ...prev, [l.code]: e.target.value }))}
              placeholder="Read the following passage and answer the questions below..."
            />
          </div>
        ))}
      </form>
    </Modal>
  );
}

function MediaModal({ group, onCancel, onChanged }) {
  const [url, setUrl] = useState("");
  const [mediaType, setMediaType] = useState("IMAGE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleAdd(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await createQuestionMedia({
        questionGroupId: group.id,
        mediaType,
        url: url.trim(),
        displayOrder: group.media?.length ?? 0,
      });
      setUrl("");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(mediaId) {
    try {
      await deleteQuestionMedia(mediaId);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="Media" onClose={onCancel} footer={<button className="btn" onClick={onCancel}>Close</button>}>
      {error && <div className="banner banner-error">{error}</div>}
      <p className="field-note">
        Upload the image via the question form's own image uploader first, then paste the resulting
        URL here to attach it to this group.
      </p>
      <div className="table-wrap">
        <table>
          <tbody>
            {(group.media ?? []).map((m) => (
              <tr key={m.id}>
                <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.url}
                </td>
                <td style={{ width: 80 }}>{m.mediaType}</td>
                <td style={{ width: 60 }}>
                  <button className="btn btn-ghost icon-btn" title="Remove" onClick={() => handleRemove(m.id)}>
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
            {(group.media ?? []).length === 0 && (
              <tr>
                <td colSpan={3}><div className="empty-state">No media attached yet.</div></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <form onSubmit={handleAdd} className="form-row" style={{ marginTop: 12 }}>
        <div className="form-field">
          <label>Type</label>
          <select value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
            {MEDIA_TYPES.map((t) => (
              <option key={t.code} value={t.code}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="form-field" style={{ flex: 1 }}>
          <label>Image URL</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://res.cloudinary.com/..." />
        </div>
        <button className="btn btn-primary" type="submit" disabled={saving || !url.trim()} style={{ alignSelf: "flex-end" }}>
          Add
        </button>
      </form>
    </Modal>
  );
}

/**
 * Shared passages/datasets several questions can attach to (TASK-2301 Phase P3) — a
 * question joins one via its own "Shared group" field on the question form, not from
 * here. This page only manages the group's own content: its type, per-language passage
 * text, and any attached images/maps.
 */
export default function QuestionGroups() {
  const [groups, setGroups] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editorState, setEditorState] = useState(null);
  const [mediaGroup, setMediaGroup] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([listQuestionGroups({ size: 100 }), listLanguages()])
      .then(([page, langs]) => {
        setGroups(page.content ?? page);
        setLanguages(langs);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function handleDelete(group) {
    const ok = await confirm(
      `Delete this ${group.groupType} group? Its member questions are unaffected and remain standalone.`,
      { title: "Delete question group", confirmLabel: "Delete", danger: true },
    );
    if (!ok) return;
    try {
      await deleteQuestionGroup(group.id);
      load();
    } catch (err) {
      setError(deleteFailureMessage(err, "question group"));
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Question Groups</h1>
        <button
          className="btn btn-primary"
          onClick={() => setEditorState({ mode: "create", initial: { groupType: "PASSAGE", translations: {} } })}
        >
          Add group
        </button>
      </div>

      <p className="page-intro">
        A passage, dataset, or shared image/map several questions refer to at once (TASK-2301 Phase
        P3) — attach individual questions to a group from the question form itself.
      </p>

      {error && <div className="banner banner-error">{error}</div>}
      {loading && <p>Loading...</p>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Passage (English)</th>
                <th style={{ width: 90 }}>Media</th>
                <th style={{ width: 130 }}></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const englishPassage = group.translations?.find((t) => t.languageCode === "en")?.passageText;
                return (
                  <tr key={group.id}>
                    <td><span className="badge badge-easy">{group.groupType}</span></td>
                    <td style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {englishPassage || "—"}
                    </td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => setMediaGroup(group)}>
                        {group.media?.length ?? 0}
                      </button>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="btn btn-ghost icon-btn"
                          title="Edit"
                          onClick={() => {
                            const translations = {};
                            for (const t of group.translations ?? []) translations[t.languageCode] = t.passageText ?? "";
                            setEditorState({ mode: "edit", initial: { id: group.id, groupType: group.groupType, translations } });
                          }}
                        >
                          <EditIcon />
                        </button>
                        <button className="btn btn-ghost icon-btn" title="Delete" onClick={() => handleDelete(group)}>
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {groups.length === 0 && (
                <tr>
                  <td colSpan={4}><div className="empty-state">No question groups yet.</div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editorState && (
        <GroupFormModal
          mode={editorState.mode}
          initial={editorState.initial}
          languages={languages}
          onCancel={() => setEditorState(null)}
          onSaved={() => {
            setEditorState(null);
            load();
          }}
        />
      )}

      {mediaGroup && (
        <MediaModal
          group={mediaGroup}
          onCancel={() => setMediaGroup(null)}
          onChanged={() => {
            listQuestionGroups({ size: 100 }).then((page) => {
              const list = page.content ?? page;
              setGroups(list);
              setMediaGroup(list.find((g) => g.id === mediaGroup.id) ?? null);
            });
          }}
        />
      )}

      {confirmDialog}
    </div>
  );
}
