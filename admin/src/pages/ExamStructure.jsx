import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getExamStructure,
  getExamSyllabus,
  setExamSyllabus,
  getExamTopics,
  // Aliased: the local useState setter is also called setExamTopics, and the unaliased
  // import was silently shadowed by it — saveTopicMap was calling the state setter instead
  // of the API and would never have persisted anything.
  setExamTopics as saveExamTopicsApi,
  listPaperTypes,
  listSubjects,
  listTopics,
  createStage,
  updateStage,
  deleteStage,
  createPaper,
  updatePaper,
  deletePaper,
  createSection,
  updateSection,
  deleteSection,
} from "../api.js";
import { deleteFailureMessage } from "../errors.js";
import Modal from "../components/Modal.jsx";
import { EditIcon, TrashIcon } from "../components/icons.jsx";
import { useConfirm } from "../hooks/useConfirm.jsx";

const BLANK_STAGE = { name: "", displayOrder: 1, versionLabel: "", effectiveFrom: "" };
const BLANK_PAPER = {
  name: "",
  paperType: "objective",
  durationMinutes: "",
  totalMarks: "",
  marksCorrect: "",
  marksWrong: "",
  qualifying: false,
  qualifyingPercentage: "",
  displayOrder: 1,
};
const BLANK_SECTION = {
  name: "",
  questionCount: 0,
  durationMinutes: "",
  marksCorrect: "",
  marksWrong: "",
  displayOrder: 1,
  subjectIds: [],
};

/** Groups topics under their subject heading, subjects and topics each alphabetical. */
function groupTopicsBySubject(topics) {
  const bySubject = new Map();
  for (const t of topics) {
    const bucket = bySubject.get(t.subjectName) ?? [];
    bucket.push(t);
    bySubject.set(t.subjectName, bucket);
  }
  return [...bySubject.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subjectName, rows]) => [subjectName, [...rows].sort((a, b) => a.name.localeCompare(b.name))]);
}

/** Empty numeric inputs mean "not set" / "inherit", which the API expects as null. */
function numOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function toFormValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

function StageForm({ initial, onCancel, onSave, saving, error }) {
  const [form, setForm] = useState(initial);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Modal
      title={initial.id ? "Edit stage" : "Add stage"}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(form)} disabled={saving || !form.name.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <div className="form-field" style={{ maxWidth: "none" }}>
        <label>Name</label>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Prelims / Tier 1" autoFocus />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Display order</label>
          <input type="number" value={form.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} />
        </div>
        <div className="form-field">
          <label>Version label</label>
          <input value={form.versionLabel} onChange={(e) => set("versionLabel", e.target.value)} placeholder="2022 pattern" />
        </div>
      </div>
      <div className="form-field" style={{ marginBottom: 0 }}>
        <label>Effective from</label>
        <input type="date" value={form.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} />
        <span className="field-note">Optional — for when a pattern changes between years.</span>
      </div>
    </Modal>
  );
}

function PaperForm({ initial, paperTypes, onCancel, onSave, saving, error }) {
  const [form, setForm] = useState(initial);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const selectedType = paperTypes.find((t) => t.code === form.paperType);

  return (
    <Modal
      title={initial.id ? "Edit paper" : "Add paper"}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(form)} disabled={saving || !form.name.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <div className="form-row">
        <div className="form-field">
          <label>Name</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Paper I – General Studies" autoFocus />
        </div>
        <div className="form-field">
          <label>Type</label>
          <select value={form.paperType} onChange={(e) => set("paperType", e.target.value)}>
            {paperTypes.map((t) => (
              <option key={t.code} value={t.code}>{t.label}</option>
            ))}
          </select>
          {selectedType && !selectedType.mockable && (
            <span className="field-note">Shown in the app's exam pattern, but no mock test is generated from it.</span>
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Duration (minutes)</label>
          <input type="number" value={form.durationMinutes} onChange={(e) => set("durationMinutes", e.target.value)} />
        </div>
        <div className="form-field">
          <label>Total marks</label>
          <input type="number" step="0.01" value={form.totalMarks} onChange={(e) => set("totalMarks", e.target.value)} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Marks per correct answer</label>
          <input type="number" step="0.01" value={form.marksCorrect} onChange={(e) => set("marksCorrect", e.target.value)} />
        </div>
        <div className="form-field">
          <label>Marks deducted per wrong answer</label>
          <input type="number" step="0.01" value={form.marksWrong} onChange={(e) => set("marksWrong", e.target.value)} />
          <span className="field-note">Enter as a positive number, e.g. 0.5 for &minus;0.5.</span>
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Display order</label>
          <input type="number" value={form.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} />
        </div>
        <div className="form-field">
          <label>Qualifying</label>
          <label className="checkbox-field">
            <input type="checkbox" checked={form.qualifying} onChange={(e) => set("qualifying", e.target.checked)} />
            Pass mark only — does not count toward the final score
          </label>
        </div>
      </div>

      {form.qualifying && (
        <div className="form-field" style={{ marginBottom: 0 }}>
          <label>Qualifying percentage</label>
          <input type="number" step="0.01" value={form.qualifyingPercentage} onChange={(e) => set("qualifyingPercentage", e.target.value)} placeholder="33" />
        </div>
      )}
    </Modal>
  );
}

function SectionForm({ initial, subjects, paper, onCancel, onSave, saving, error }) {
  const [form, setForm] = useState(initial);
  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  function toggleSubject(id) {
    setForm((prev) => ({
      ...prev,
      subjectIds: prev.subjectIds.includes(id)
        ? prev.subjectIds.filter((s) => s !== id)
        : [...prev.subjectIds, id],
    }));
  }

  return (
    <Modal
      title={initial.id ? "Edit section" : "Add section"}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => onSave(form)}
            disabled={saving || !form.name.trim() || form.subjectIds.length === 0}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      {error && <div className="banner banner-error">{error}</div>}
      <div className="form-row">
        <div className="form-field">
          <label>Name</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Quantitative Aptitude" autoFocus />
        </div>
        <div className="form-field">
          <label>Number of questions</label>
          <input type="number" value={form.questionCount} onChange={(e) => set("questionCount", e.target.value)} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Own time limit (minutes)</label>
          <input type="number" value={form.durationMinutes} onChange={(e) => set("durationMinutes", e.target.value)} placeholder="shares the paper's time" />
          <span className="field-note">Leave blank to share the paper's overall time. Set it for exams that enforce per-section timing.</span>
        </div>
        <div className="form-field">
          <label>Display order</label>
          <input type="number" value={form.displayOrder} onChange={(e) => set("displayOrder", e.target.value)} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label>Marks per correct</label>
          <input type="number" step="0.01" value={form.marksCorrect} onChange={(e) => set("marksCorrect", e.target.value)} placeholder={`inherits ${paper.marksCorrect ?? "—"}`} />
        </div>
        <div className="form-field">
          <label>Marks per wrong</label>
          <input type="number" step="0.01" value={form.marksWrong} onChange={(e) => set("marksWrong", e.target.value)} placeholder={`inherits ${paper.marksWrong ?? "—"}`} />
        </div>
      </div>
      <p className="field-note" style={{ marginTop: -8 }}>
        Leave both blank to use the paper's marking. Fill them in only where a section is marked differently.
      </p>

      <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
        <label>Subjects this section draws from</label>
        <div className="checkbox-grid">
          {subjects.map((s) => (
            <label className="checkbox-field" key={s.id}>
              <input type="checkbox" checked={form.subjectIds.includes(s.id)} onChange={() => toggleSubject(s.id)} />
              {s.name}
            </label>
          ))}
        </div>
        <span className="field-note">
          One section can span several subjects — a single "General Studies" paper may draw from History, Polity and more.
        </span>
      </div>
    </Modal>
  );
}

export default function ExamStructure() {
  const { examCode } = useParams();
  const [structure, setStructure] = useState(null);
  const [syllabus, setSyllabus] = useState([]);
  const [syllabusDraft, setSyllabusDraft] = useState(null);
  const [examTopics, setExamTopics] = useState([]);
  // Topics of every syllabus subject, loaded only when the editor opens — there can be
  // hundreds, and the card itself only needs the already-mapped rows.
  const [topicChoices, setTopicChoices] = useState([]);
  /** null = closed. Otherwise a map of topicId -> weightage string ("" for unset). */
  const [topicMapDraft, setTopicMapDraft] = useState(null);
  const [paperTypes, setPaperTypes] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [editor, setEditor] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([getExamStructure(examCode), getExamSyllabus(examCode), getExamTopics(examCode)])
      .then(([structureData, syllabusData, topicData]) => {
        setStructure(structureData);
        setSyllabus(syllabusData);
        setExamTopics(topicData);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [examCode]);

  useEffect(load, [load]);

  useEffect(() => {
    Promise.all([listPaperTypes(), listSubjects()])
      .then(([types, subjectRows]) => {
        setPaperTypes(types);
        setSubjects(subjectRows);
      })
      .catch((e) => setError(e.message));
  }, []);

  function closeEditor() {
    setEditor(null);
    setFormError(null);
  }

  async function runSave(action) {
    setSaving(true);
    setFormError(null);
    try {
      await action();
      closeEditor();
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveSyllabus() {
    setSaving(true);
    setFormError(null);
    try {
      await setExamSyllabus(examCode, syllabusDraft);
      setSyllabusDraft(null);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleSyllabusSubject(id) {
    setSyllabusDraft((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  /* ------------------------------------------------------------------ Topic map */

  async function openTopicMapEditor() {
    setFormError(null);
    try {
      // Only the syllabus subjects' topics are offerable: mapping a topic from a subject
      // this exam doesn't even cover would contradict the syllabus.
      const perSubject = await Promise.all(syllabus.map((s) => listTopics(s.id)));
      setTopicChoices(perSubject.flat());
      // Weightage is held as a string while editing so a half-typed "1." doesn't get
      // coerced to a number mid-keystroke.
      const draft = {};
      for (const t of examTopics) {
        draft[t.topicId] = t.weightagePercent != null ? String(t.weightagePercent) : "";
      }
      setTopicMapDraft(draft);
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleTopicInMap(topicId) {
    setTopicMapDraft((prev) => {
      const next = { ...prev };
      if (topicId in next) delete next[topicId];
      else next[topicId] = "";
      return next;
    });
  }

  async function saveTopicMap() {
    setFormError(null);
    // Validated here rather than only server-side: the API stores whatever it's given, and
    // a typo'd weightage is much cheaper to catch before it's persisted.
    for (const [topicId, raw] of Object.entries(topicMapDraft)) {
      if (raw === "") continue;
      const value = Number(raw);
      if (Number.isNaN(value) || value < 0 || value > 100) {
        const name = topicChoices.find((t) => t.id === topicId)?.name ?? topicId;
        setFormError(`Weightage for "${name}" must be a number between 0 and 100.`);
        return;
      }
    }
    setSaving(true);
    try {
      const topics = Object.entries(topicMapDraft).map(([topicId, raw]) => ({
        topicId,
        weightagePercent: raw === "" ? null : Number(raw),
      }));
      await saveExamTopicsApi(examCode, topics);
      setTopicMapDraft(null);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function saveStage(form) {
    const payload = {
      examCode,
      name: form.name.trim(),
      displayOrder: Number(form.displayOrder) || 0,
      versionLabel: form.versionLabel ? form.versionLabel.trim() : null,
      effectiveFrom: form.effectiveFrom || null,
    };
    return runSave(() => (form.id ? updateStage(form.id, payload) : createStage(payload)));
  }

  function savePaper(form) {
    const payload = {
      stageId: form.stageId,
      name: form.name.trim(),
      paperType: form.paperType,
      durationMinutes: numOrNull(form.durationMinutes),
      totalMarks: numOrNull(form.totalMarks),
      marksCorrect: numOrNull(form.marksCorrect),
      marksWrong: numOrNull(form.marksWrong),
      qualifying: form.qualifying,
      qualifyingPercentage: form.qualifying ? numOrNull(form.qualifyingPercentage) : null,
      displayOrder: Number(form.displayOrder) || 0,
    };
    return runSave(() => (form.id ? updatePaper(form.id, payload) : createPaper(payload)));
  }

  function saveSection(form) {
    const payload = {
      paperId: form.paperId,
      name: form.name.trim(),
      questionCount: Number(form.questionCount) || 0,
      durationMinutes: numOrNull(form.durationMinutes),
      marksCorrect: numOrNull(form.marksCorrect),
      marksWrong: numOrNull(form.marksWrong),
      displayOrder: Number(form.displayOrder) || 0,
      subjectIds: form.subjectIds,
    };
    return runSave(() => (form.id ? updateSection(form.id, payload) : createSection(payload)));
  }

  async function removeStage(stage) {
    const papers = stage.papers.length;
    const ok = await confirm(
      `Delete the "${stage.name}" stage?${papers > 0 ? ` Its ${papers} paper${papers === 1 ? "" : "s"} and all their sections go with it.` : ""}`,
      { title: "Delete stage", confirmLabel: "Delete", danger: true }
    );
    if (!ok) return;
    try {
      await deleteStage(stage.id);
      load();
    } catch (err) {
      setError(deleteFailureMessage(err, "stage"));
    }
  }

  async function removePaper(paper) {
    const sections = paper.sections.length;
    const ok = await confirm(
      `Delete "${paper.name}"?${sections > 0 ? ` Its ${sections} section${sections === 1 ? "" : "s"} go with it.` : ""}`,
      { title: "Delete paper", confirmLabel: "Delete", danger: true }
    );
    if (!ok) return;
    try {
      await deletePaper(paper.id);
      load();
    } catch (err) {
      setError(deleteFailureMessage(err, "paper"));
    }
  }

  async function removeSection(section) {
    const ok = await confirm(`Delete the "${section.name}" section?`, {
      title: "Delete section",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSection(section.id);
      load();
    } catch (err) {
      setError(deleteFailureMessage(err, "section"));
    }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/exams" className="back-link">← Exams</Link>
          <h1 style={{ marginTop: 4 }}>{structure ? structure.examName : examCode} — structure</h1>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setEditor({ kind: "stage", form: { ...BLANK_STAGE, displayOrder: (structure?.stages.length || 0) + 1 } })}
        >
          Add stage
        </button>
      </div>

      <p className="page-intro">
        Stages are the rounds of the exam (Prelims, Mains, Tier 1). Each stage holds papers, and each paper holds
        sections that draw questions from one or more subjects.
      </p>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="stage-head">
          <div>
            <h2 style={{ marginBottom: 2 }}>Syllabus</h2>
            <div className="cell-secondary">
              Which subjects this exam covers. Subjects are shared — one subject belongs to many exams — and this
              works with or without a paper pattern below.
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => setSyllabusDraft(syllabus.map((s) => s.id))}>
            Edit syllabus
          </button>
        </div>

        {syllabus.length === 0 ? (
          <div className="empty-state">
            No subjects yet — Practice will fall back to showing every subject for this exam until one is set.
          </div>
        ) : (
          <div className="cell-tags">
            {syllabus.map((s) => (
              <span className="badge" key={s.id}>{s.name}</span>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="stage-head">
          <div>
            <h2 style={{ marginBottom: 2 }}>Topic map</h2>
            <div className="cell-secondary">
              Finer-grained than the syllabus above: which individual topics matter for this exam, and roughly
              how much of the paper each is worth. Nothing in the app reads this yet — it is the input the
              Preparation Plan will be built from.
            </div>
          </div>
          <button className="btn btn-sm" onClick={openTopicMapEditor} disabled={syllabus.length === 0}>
            Edit topic map
          </button>
        </div>

        {syllabus.length === 0 ? (
          <div className="empty-state">
            Set the syllabus first — topics are offered per subject, so there is nothing to choose from yet.
          </div>
        ) : examTopics.length === 0 ? (
          <div className="empty-state">No topics mapped yet.</div>
        ) : (
          <div className="cell-tags">
            {examTopics.map((t) => (
              <span className="badge" key={t.topicId}>
                {t.topicName}
                {t.weightagePercent != null ? ` · ${t.weightagePercent}%` : ""}
              </span>
            ))}
          </div>
        )}
      </div>

      {structure && structure.stages.length === 0 && (
        <div className="empty-state">
          No structure defined yet. Add a stage to begin — until then this exam cannot generate a mock test.
        </div>
      )}

      {structure && structure.stages.map((stage) => (
        <div className="card stage-card" key={stage.id}>
          <div className="stage-head">
            <div>
              <h2 style={{ marginBottom: 2 }}>{stage.name}</h2>
              <div className="cell-secondary">
                {stage.versionLabel || "No version label"}
                {stage.effectiveFrom ? ` · effective ${stage.effectiveFrom}` : ""}
                {` · ${stage.papers.length} paper${stage.papers.length === 1 ? "" : "s"}`}
              </div>
            </div>
            <div className="row-actions">
              <button
                className="btn btn-sm"
                onClick={() => setEditor({
                  kind: "paper",
                  form: { ...BLANK_PAPER, stageId: stage.id, displayOrder: stage.papers.length + 1 },
                })}
              >
                Add paper
              </button>
              <button
                className="btn btn-ghost icon-btn"
                title="Edit stage"
                onClick={() => setEditor({
                  kind: "stage",
                  form: {
                    id: stage.id,
                    name: stage.name,
                    displayOrder: stage.displayOrder,
                    versionLabel: stage.versionLabel || "",
                    effectiveFrom: stage.effectiveFrom || "",
                  },
                })}
              >
                <EditIcon />
              </button>
              <button className="btn btn-ghost icon-btn" title="Delete stage" onClick={() => removeStage(stage)}>
                <TrashIcon />
              </button>
            </div>
          </div>

          {stage.papers.length === 0 && (
            <div className="empty-state">No papers in this stage yet.</div>
          )}

          {stage.papers.map((paper) => {
            const sectionQuestions = paper.sections.reduce((sum, s) => sum + s.questionCount, 0);
            return (
              <div className="paper-block" key={paper.id}>
                <div className="stage-head">
                  <div>
                    <strong>{paper.name}</strong>
                    <div className="cell-tags">
                      <span className="badge">{paper.paperType}</span>
                      {!paper.mockable && <span className="badge badge-medium">not mock-testable</span>}
                      {paper.qualifying && (
                        <span className="badge badge-medium">
                          qualifying{paper.qualifyingPercentage != null ? ` ${paper.qualifyingPercentage}%` : ""}
                        </span>
                      )}
                      {paper.durationMinutes != null && <span className="badge">{paper.durationMinutes} min</span>}
                      {paper.marksCorrect != null && (
                        <span className="badge">+{paper.marksCorrect} / −{paper.marksWrong ?? 0}</span>
                      )}
                      <span className="badge">
                        {sectionQuestions} Q in sections
                        {paper.totalMarks != null ? ` · ${paper.totalMarks} marks` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="row-actions">
                    <button
                      className="btn btn-sm"
                      onClick={() => setEditor({
                        kind: "section",
                        paper,
                        form: { ...BLANK_SECTION, paperId: paper.id, displayOrder: paper.sections.length + 1 },
                      })}
                    >
                      Add section
                    </button>
                    <button
                      className="btn btn-ghost icon-btn"
                      title="Edit paper"
                      onClick={() => setEditor({
                        kind: "paper",
                        form: {
                          id: paper.id,
                          stageId: stage.id,
                          name: paper.name,
                          paperType: paper.paperType,
                          durationMinutes: toFormValue(paper.durationMinutes),
                          totalMarks: toFormValue(paper.totalMarks),
                          marksCorrect: toFormValue(paper.marksCorrect),
                          marksWrong: toFormValue(paper.marksWrong),
                          qualifying: paper.qualifying,
                          qualifyingPercentage: toFormValue(paper.qualifyingPercentage),
                          displayOrder: paper.displayOrder,
                        },
                      })}
                    >
                      <EditIcon />
                    </button>
                    <button className="btn btn-ghost icon-btn" title="Delete paper" onClick={() => removePaper(paper)}>
                      <TrashIcon />
                    </button>
                  </div>
                </div>

                {paper.sections.length === 0 ? (
                  <div className="empty-state">No sections yet.</div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Section</th>
                          <th style={{ width: 90 }}>Questions</th>
                          <th style={{ width: 130 }}>Timing</th>
                          <th style={{ width: 150 }}>Marking</th>
                          <th>Subjects</th>
                          <th style={{ width: 90 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {paper.sections.map((section) => (
                          <tr key={section.id}>
                            <td>{section.name}</td>
                            <td>{section.questionCount}</td>
                            <td>
                              {section.sectionallyTimed
                                ? <span className="badge">{section.durationMinutes} min</span>
                                : <span className="cell-secondary">shares paper</span>}
                            </td>
                            <td>
                              +{section.effectiveMarksCorrect ?? "—"} / −{section.effectiveMarksWrong ?? 0}
                              {section.marksCorrect == null && section.marksWrong == null && (
                                <div className="cell-secondary">inherited</div>
                              )}
                            </td>
                            <td>
                              {section.subjects.map((s) => (
                                <span className="badge" key={s.id}>{s.name}</span>
                              ))}
                            </td>
                            <td>
                              <div className="row-actions">
                                <button
                                  className="btn btn-ghost icon-btn"
                                  title="Edit section"
                                  onClick={() => setEditor({
                                    kind: "section",
                                    paper,
                                    form: {
                                      id: section.id,
                                      paperId: paper.id,
                                      name: section.name,
                                      questionCount: section.questionCount,
                                      durationMinutes: toFormValue(section.durationMinutes),
                                      marksCorrect: toFormValue(section.marksCorrect),
                                      marksWrong: toFormValue(section.marksWrong),
                                      displayOrder: section.displayOrder,
                                      subjectIds: section.subjects.map((s) => s.id),
                                    },
                                  })}
                                >
                                  <EditIcon />
                                </button>
                                <button
                                  className="btn btn-ghost icon-btn"
                                  title="Delete section"
                                  onClick={() => removeSection(section)}
                                >
                                  <TrashIcon />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {syllabusDraft && (
        <Modal
          title="Edit syllabus"
          onClose={() => setSyllabusDraft(null)}
          footer={
            <>
              <button className="btn" onClick={() => setSyllabusDraft(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSyllabus} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          }
        >
          {formError && <div className="banner banner-error">{formError}</div>}
          <p className="field-note" style={{ marginTop: 0 }}>
            Subjects already used by a section below are added automatically and can&apos;t be removed here without
            first removing them from that section.
          </p>
          <div className="checkbox-grid">
            {subjects.map((s) => (
              <label className="checkbox-field" key={s.id}>
                <input
                  type="checkbox"
                  checked={syllabusDraft.includes(s.id)}
                  onChange={() => toggleSyllabusSubject(s.id)}
                />
                {s.name}
              </label>
            ))}
          </div>
        </Modal>
      )}

      {topicMapDraft && (
        <Modal
          title="Edit topic map"
          onClose={() => setTopicMapDraft(null)}
          footer={
            <>
              <button className="btn" onClick={() => setTopicMapDraft(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveTopicMap} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          }
        >
          {formError && <div className="banner banner-error">{formError}</div>}
          <p className="field-note" style={{ marginTop: 0 }}>
            Tick the topics this exam actually tests, and optionally give each one a weightage. Weightage is
            your own judgement — leave it blank for &quot;relevant, not assessed&quot;, which is different from 0%.
            Only topics from this exam&apos;s syllabus subjects are listed.
          </p>

          {topicChoices.length === 0 ? (
            <div className="empty-state">
              The syllabus subjects have no topics yet. <Link to="/topics">Add topics first.</Link>
            </div>
          ) : (
            groupTopicsBySubject(topicChoices).map(([subjectName, rows]) => (
              <div className="form-field" style={{ maxWidth: "none" }} key={subjectName}>
                <label>{subjectName}</label>
                {rows.map((t) => {
                  const selected = t.id in topicMapDraft;
                  return (
                    <div className="topic-map-row" key={t.id}>
                      <label className="checkbox-field">
                        <input type="checkbox" checked={selected} onChange={() => toggleTopicInMap(t.id)} />
                        {t.parentName ? `${t.parentName} → ${t.name}` : t.name}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="%"
                        style={{ width: 90 }}
                        value={selected ? topicMapDraft[t.id] : ""}
                        disabled={!selected}
                        onChange={(e) =>
                          setTopicMapDraft((prev) => ({ ...prev, [t.id]: e.target.value }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </Modal>
      )}

      {editor && editor.kind === "stage" && (
        <StageForm initial={editor.form} onCancel={closeEditor} onSave={saveStage} saving={saving} error={formError} />
      )}
      {editor && editor.kind === "paper" && (
        <PaperForm initial={editor.form} paperTypes={paperTypes} onCancel={closeEditor} onSave={savePaper} saving={saving} error={formError} />
      )}
      {editor && editor.kind === "section" && (
        <SectionForm initial={editor.form} subjects={subjects} paper={editor.paper} onCancel={closeEditor} onSave={saveSection} saving={saving} error={formError} />
      )}

      {confirmDialog}
    </div>
  );
}
