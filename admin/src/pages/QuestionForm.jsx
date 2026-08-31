import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getQuestion,
  createQuestion,
  updateQuestion,
  upsertTranslation,
  listLanguages,
  listSubjects,
  listTopics,
  listAllExams,
  listDifficultyLevels,
  getExamStructure,
} from "../api.js";
import { useConfirm } from "../hooks/useConfirm.jsx";

const EMPTY_TRANSLATION = { languageCode: "", questionText: "", options: ["", "", "", ""], explanation: "" };
const ANSWER_LETTERS = ["A", "B", "C", "D"];

const BLANK_FORM = {
  subjectId: "",
  topicId: "",
  difficulty: "",
  correctAnswer: "A",
  examCodes: [],
  premium: false,
  // Epic L / TICKET-2104. Held as strings while editing (see the year input below) so a
  // half-typed value is not coerced mid-keystroke.
  pyq: false,
  pyqYear: "",
  pyqShift: "",
  sourcePaperId: "",
  questionNumber: "",
  sourceUrl: "",
};

/**
 * Sanity bounds for a PYQ year, matching the server's own @Min/@Max.
 *
 * Checked here too because the server's rejection is a bare 400 that loses whatever else the
 * admin had typed — and a typo'd year is not harmless, it silently skews every trend computed
 * from the question.
 */
const PYQ_YEAR_MIN = 1950;
const PYQ_YEAR_MAX = 2100;

/** Flattens an exam's stage tree into a selectable paper list for the source-paper picker. */
function papersFromStructures(structures) {
  const papers = [];
  for (const structure of structures) {
    for (const stage of structure.stages ?? []) {
      for (const paper of stage.papers ?? []) {
        papers.push({
          id: paper.id,
          label: `${structure.examCode} · ${stage.name} · ${paper.name}`,
        });
      }
    }
  }
  return papers;
}

/** Existing rows may store the option value rather than a letter; normalise to a letter. */
function toAnswerLetter(correctAnswer, englishOptions) {
  const trimmed = String(correctAnswer ?? "").trim();
  const upper = trimmed.toUpperCase();
  if (/^[A-D]$/.test(upper)) return { letter: upper, converted: false };
  if (/^[0-3]$/.test(upper)) return { letter: ANSWER_LETTERS[Number(upper)], converted: true };
  const matched = (englishOptions || []).findIndex((o) => String(o).trim() === trimmed);
  if (matched >= 0) return { letter: ANSWER_LETTERS[matched], converted: true };
  return { letter: "", converted: false };
}

export default function QuestionForm({ mode }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(BLANK_FORM);
  const [translations, setTranslations] = useState([{ ...EMPTY_TRANSLATION, languageCode: "en" }]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [exams, setExams] = useState([]);
  const [difficulties, setDifficulties] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [answerNote, setAnswerNote] = useState(null);
  const [sourcePapers, setSourcePapers] = useState([]);
  const [confirm, confirmDialog] = useConfirm();

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  useEffect(() => {
    Promise.all([listLanguages(), listSubjects(), listTopics(), listAllExams(), listDifficultyLevels()])
      .then(([languageRows, subjectRows, topicRows, examRows, difficultyRows]) => {
        setLanguages(languageRows);
        setSubjects(subjectRows);
        setTopics(topicRows);
        setExams([...examRows].sort((a, b) => a.displayOrder - b.displayOrder));
        setDifficulties(difficultyRows);
        // Default to the first active level rather than assuming one is called "easy".
        setForm((prev) => (prev.difficulty ? prev : { ...prev, difficulty: difficultyRows[0]?.code || "" }));
      })
      .catch((e) => setError(e.message));
  }, []);

  /*
   * The source-paper picker's options.
   *
   * Loaded per selected exam rather than all at once: `getExamStructure` is one request per exam,
   * and fetching all 11 up front would be 11 requests on a form where most authors never open the
   * PYQ section at all. Failures are swallowed to an empty list — a missing picker is a degraded
   * form, not a broken one, and every other field still works.
   */
  useEffect(() => {
    if (form.examCodes.length === 0) {
      setSourcePapers([]);
      return;
    }
    let cancelled = false;
    Promise.all(form.examCodes.map((code) => getExamStructure(code).catch(() => null)))
      .then((structures) => {
        if (cancelled) return;
        setSourcePapers(papersFromStructures(structures.filter(Boolean)));
      })
      .catch(() => setSourcePapers([]));
    // Guarded against a late response from a previous exam selection overwriting a newer one.
    return () => {
      cancelled = true;
    };
  }, [form.examCodes]);

  useEffect(() => {
    if (mode !== "edit") return;
    getQuestion(id)
      .then((q) => {
        const english = q.translations.find((t) => t.languageCode === "en") || q.translations[0];
        const { letter, converted } = toAnswerLetter(q.correctAnswer, english ? english.options : []);
        if (converted) {
          setAnswerNote(
            `This question stored its correct answer as "${q.correctAnswer}" rather than a letter. It has been matched to ${letter} — saving will store it in the standard form.`
          );
        } else if (!letter) {
          setAnswerNote(
            `The stored correct answer ("${q.correctAnswer}") does not match any option. Pick the right one before saving.`
          );
        }
        setForm({
          subjectId: q.subjectId || "",
          topicId: q.topicId || "",
          difficulty: q.difficulty,
          correctAnswer: letter,
          examCodes: q.examCodes || [],
          premium: Boolean(q.premium),
          // Nullable columns become "" so the inputs stay controlled — same convention as the
          // exam form's imageUrl/difficulty/badge.
          pyq: Boolean(q.pyq),
          pyqYear: q.pyqYear ?? "",
          pyqShift: q.pyqShift ?? "",
          sourcePaperId: q.sourcePaperId ?? "",
          questionNumber: q.questionNumber ?? "",
          sourceUrl: q.sourceUrl ?? "",
        });
        setTranslations(q.translations.map((t) => ({ ...t, explanation: t.explanation || "" })));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [mode, id]);

  function updateTranslation(index, field, value) {
    setTranslations((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  function updateOption(index, optionIndex, value) {
    setTranslations((prev) =>
      prev.map((t, i) => {
        if (i !== index) return t;
        const options = [...t.options];
        options[optionIndex] = value;
        return { ...t, options };
      })
    );
  }

  function availableLanguagesFor(index) {
    const usedElsewhere = new Set(translations.filter((_, i) => i !== index).map((t) => t.languageCode));
    return languages.filter((l) => !usedElsewhere.has(l.code));
  }

  function addTranslation() {
    setTranslations((prev) => [...prev, { ...EMPTY_TRANSLATION }]);
  }

  async function removeTranslation(index) {
    const t = translations[index];
    const hasContent = t.questionText.trim() || t.explanation.trim() || t.options.some((o) => o.trim());
    if (hasContent) {
      const ok = await confirm("Remove this language? The text you've entered for it will be lost.", {
        title: "Remove translation",
        confirmLabel: "Remove",
        danger: true,
      });
      if (!ok) return;
    }
    setTranslations((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleExam(code) {
    setForm((prev) => ({
      ...prev,
      examCodes: prev.examCodes.includes(code)
        ? prev.examCodes.filter((c) => c !== code)
        : [...prev.examCodes, code],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!form.topicId) return setError("Pick a subject and topic.");
    if (form.examCodes.length === 0) return setError("Tag this question to at least one exam.");
    if (!form.correctAnswer) return setError("Pick the correct answer.");
    if (!translations.some((t) => t.languageCode === "en")) {
      return setError("English is the root language — every question needs an 'en' translation.");
    }

    if (form.pyq && form.pyqYear !== "") {
      const year = Number(form.pyqYear);
      if (!Number.isInteger(year) || year < PYQ_YEAR_MIN || year > PYQ_YEAR_MAX) {
        return setError(`A previous-year year must be between ${PYQ_YEAR_MIN} and ${PYQ_YEAR_MAX}.`);
      }
    }

    setSaving(true);
    const corePayload = {
      correctAnswer: form.correctAnswer,
      topicId: form.topicId,
      difficulty: form.difficulty,
      examCodes: form.examCodes,
      premium: form.premium,
      // Epic L / TICKET-2104. Empty strings become null rather than being sent as "": the
      // server treats a blank as "not set", and an empty string would be stored as one.
      pyq: form.pyq,
      pyqYear: form.pyqYear === "" ? null : Number(form.pyqYear),
      pyqShift: form.pyqShift.trim() || null,
      sourcePaperId: form.sourcePaperId || null,
      questionNumber: form.questionNumber === "" ? null : Number(form.questionNumber),
      sourceUrl: form.sourceUrl.trim() || null,
    };

    try {
      if (mode === "create") {
        await createQuestion({ ...corePayload, translations });
      } else {
        // Metadata and translation content are separate endpoints: one PUT for the
        // question, then one per language.
        await updateQuestion(id, corePayload);
        for (const t of translations) {
          await upsertTranslation(id, t.languageCode, {
            questionText: t.questionText,
            options: t.options,
            explanation: t.explanation,
          });
        }
      }
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading...</p>;

  const topicOptions = topics
    .filter((t) => t.subjectId === form.subjectId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const englishOptions = (translations.find((t) => t.languageCode === "en") || {}).options || [];

  return (
    <div>
      <div className="page-header">
        <h1>{mode === "create" ? "Add Question" : "Edit Question"}</h1>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {answerNote && <div className="banner banner-warn">{answerNote}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h2>Classification</h2>
          <div className="form-row">
            <div className="form-field">
              <label>Subject</label>
              <select
                value={form.subjectId}
                onChange={(e) => setForm((prev) => ({ ...prev, subjectId: e.target.value, topicId: "" }))}
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
            </div>

            <div className="form-field">
              <label>Topic</label>
              <select
                value={form.topicId}
                onChange={(e) => set("topicId", e.target.value)}
                disabled={!form.subjectId}
                required
              >
                <option value="" disabled>
                  {form.subjectId ? "Select topic..." : "Pick a subject first"}
                </option>
                {topicOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {form.subjectId && topicOptions.length === 0 && (
                <span className="field-note">This subject has no topics yet — add one under Topics.</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Difficulty</label>
              <select value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)} required>
                <option value="" disabled>
                  Select difficulty...
                </option>
                {difficulties.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Correct answer</label>
              <select
                value={form.correctAnswer}
                onChange={(e) => set("correctAnswer", e.target.value)}
                required
              >
                <option value="" disabled>
                  Select...
                </option>
                {ANSWER_LETTERS.map((letter, i) => (
                  <option key={letter} value={letter}>
                    {letter}
                    {englishOptions[i] ? ` — ${englishOptions[i]}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
            <label>Access</label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.premium}
                onChange={(e) => set("premium", e.target.checked)}
              />
              Premium (reserved — no paywall is enforced yet)
            </label>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h2>Exams</h2>
          <p className="field-note" style={{ marginTop: 0, marginBottom: 10 }}>
            A question can belong to several exams. It appears in every one you tick.
          </p>
          <div className="checkbox-grid">
            {exams.map((exam) => (
              <label className="checkbox-field" key={exam.code}>
                <input
                  type="checkbox"
                  checked={form.examCodes.includes(exam.code)}
                  onChange={() => toggleExam(exam.code)}
                />
                {exam.name}
                {!exam.active && <span className="badge">inactive</span>}
              </label>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h2>Previous-year question (PYQ)</h2>
          <p className="field-note" style={{ marginTop: 0, marginBottom: 10 }}>
            Tag a question that actually appeared in a real paper. This is what topic trend and
            priority are computed from — an untagged bank produces no trend at all. It also shows
            as an &quot;Asked in 2023&quot; badge to students.
          </p>

          <div className="form-field" style={{ maxWidth: "none" }}>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.pyq}
                onChange={(e) => set("pyq", e.target.checked)}
              />
              This question appeared in a previous year&apos;s paper
            </label>
          </div>

          {/* Everything below is disabled rather than hidden when the box is unticked, so the
              fields stay discoverable and an admin can see what tagging would ask for. The
              server clears these columns when pyq is false, so leaving stale values in the
              inputs cannot persist a contradictory row. */}
          <div className="form-row">
            <div className="form-field">
              <label>Year</label>
              <input
                type="number"
                value={form.pyqYear}
                onChange={(e) => set("pyqYear", e.target.value)}
                disabled={!form.pyq}
                min={PYQ_YEAR_MIN}
                max={PYQ_YEAR_MAX}
                placeholder="2023"
              />
              <span className="field-note">
                Leave blank if you know it is a PYQ but not which year — that is a real state, and
                the trend simply ignores it.
              </span>
            </div>

            <div className="form-field">
              <label>Shift</label>
              <input
                value={form.pyqShift}
                onChange={(e) => set("pyqShift", e.target.value)}
                disabled={!form.pyq}
                maxLength={30}
                placeholder="Shift 2 / Morning"
              />
              <span className="field-note">Free text — shifts are named differently per exam.</span>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Source paper</label>
              <select
                value={form.sourcePaperId}
                onChange={(e) => set("sourcePaperId", e.target.value)}
                disabled={!form.pyq || sourcePapers.length === 0}
              >
                <option value="">Not set</option>
                {sourcePapers.map((paper) => (
                  <option key={paper.id} value={paper.id}>
                    {paper.label}
                  </option>
                ))}
              </select>
              <span className="field-note">
                {form.examCodes.length === 0
                  ? "Tick an exam above to choose from its papers."
                  : sourcePapers.length === 0
                  ? "The selected exam(s) have no paper pattern defined yet."
                  : "Optional — pins the question to a specific paper."}
              </span>
            </div>

            <div className="form-field">
              <label>Question number</label>
              <input
                type="number"
                min="1"
                value={form.questionNumber}
                onChange={(e) => set("questionNumber", e.target.value)}
                disabled={!form.pyq}
                placeholder="47"
              />
            </div>
          </div>

          <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
            <label>Source URL</label>
            <input
              value={form.sourceUrl}
              onChange={(e) => set("sourceUrl", e.target.value)}
              placeholder="https://..."
            />
            <span className="field-note">
              Deliberately still editable when the PYQ box is off — where a question came from stays
              true whether or not anyone has classified it as a previous-year one.
            </span>
          </div>
        </div>

        <h2>Translations</h2>
        {translations.map((t, i) => (
          <div className="translation-block" key={i}>
            <div className="translation-block-header">
              <div className="form-field" style={{ marginBottom: 0, maxWidth: 200 }}>
                <label>Language</label>
                <select
                  value={t.languageCode}
                  disabled={mode === "edit" && Boolean(t.questionText)}
                  onChange={(e) => updateTranslation(i, "languageCode", e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select language...
                  </option>
                  {availableLanguagesFor(i).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              </div>
              {translations.length > 1 && t.languageCode !== "en" && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeTranslation(i)}>
                  Remove
                </button>
              )}
            </div>

            <div className="form-field" style={{ maxWidth: "none" }}>
              <label>Question text</label>
              <textarea
                rows={3}
                value={t.questionText}
                onChange={(e) => updateTranslation(i, "questionText", e.target.value)}
                required
              />
            </div>

            <div className="form-field" style={{ maxWidth: "none" }}>
              <label>Options (exactly 4)</label>
              {t.options.map((opt, oi) => (
                <div className="option-row" key={oi}>
                  <span className={`option-index${ANSWER_LETTERS[oi] === form.correctAnswer ? " correct" : ""}`}>
                    {ANSWER_LETTERS[oi]}
                  </span>
                  <input
                    value={opt}
                    onChange={(e) => updateOption(i, oi, e.target.value)}
                    placeholder={`Option ${oi + 1}`}
                    required
                  />
                </div>
              ))}
            </div>

            <div className="form-field" style={{ maxWidth: "none" }}>
              <label>Explanation</label>
              <textarea
                rows={2}
                value={t.explanation}
                onChange={(e) => updateTranslation(i, "explanation", e.target.value)}
              />
            </div>
          </div>
        ))}

        {availableLanguagesFor(translations.length).length > 0 && (
          <button type="button" className="btn btn-sm" onClick={addTranslation}>
            + Add another language
          </button>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
      {confirmDialog}
    </div>
  );
}
