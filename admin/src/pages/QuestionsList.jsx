import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  listQuestions,
  deleteQuestion,
  bulkDeleteQuestions,
  listAllExams,
  listSubjects,
  listTopics,
  listAllDifficultyLevels,
} from "../api.js";
import QuestionDetailModal from "../components/QuestionDetailModal.jsx";
import { EditIcon, TrashIcon } from "../components/icons.jsx";
import { useConfirm } from "../hooks/useConfirm.jsx";

const BLANK_FILTERS = { examCode: "", subjectId: "", topicId: "", difficulty: "" };

/** Colour comes from the difficulty level row, so a newly added level renders correctly. */
function DifficultyBadge({ code, meta }) {
  if (!meta) return <span className="badge">{code}</span>;
  return (
    <span
      className="badge"
      style={meta.color ? { color: meta.color, background: meta.colorBg || undefined, borderColor: "transparent" } : undefined}
    >
      {meta.label}
    </span>
  );
}

export default function QuestionsList() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [exams, setExams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [difficulties, setDifficulties] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detailQuestion, setDetailQuestion] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    Promise.all([listAllExams(), listSubjects(), listTopics(), listAllDifficultyLevels()])
      .then(([examRows, subjectRows, topicRows, difficultyRows]) => {
        setExams([...examRows].sort((a, b) => a.displayOrder - b.displayOrder));
        setSubjects(subjectRows);
        setDifficulties(difficultyRows);
        setTopics(
          [...topicRows].sort(
            (a, b) => a.subjectName.localeCompare(b.subjectName) || a.name.localeCompare(b.name)
          )
        );
      })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listQuestions({ page, size: 20, sort: "updatedAt,desc", ...filters })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  function setFilter(patch) {
    setPage(0);
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(id) {
    const ok = await confirm("Delete this question? It stays in the database as deleted and disappears from the app.", {
      title: "Delete question",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteQuestion(id);
      setDetailQuestion(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const ok = await confirm(`Delete ${selectedIds.size} selected question(s)?`, {
      title: "Delete selected questions",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await bulkDeleteQuestions([...selectedIds]);
      setSelectedIds(new Set());
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  // Narrow the topic list to the chosen subject, but keep every topic available
  // when no subject is selected.
  const topicOptions = filters.subjectId ? topics.filter((t) => t.subjectId === filters.subjectId) : topics;
  const difficultyByCode = new Map(difficulties.map((d) => [d.code, d]));
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div>
      <div className="page-header">
        <h1>Questions</h1>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="toolbar">
        <select value={filters.examCode} onChange={(e) => setFilter({ examCode: e.target.value })}>
          <option value="">All exams</option>
          {exams.map((exam) => (
            <option key={exam.code} value={exam.code}>
              {exam.name}
            </option>
          ))}
        </select>

        <select
          value={filters.subjectId}
          onChange={(e) => setFilter({ subjectId: e.target.value, topicId: "" })}
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select value={filters.topicId} onChange={(e) => setFilter({ topicId: e.target.value })}>
          <option value="">All topics</option>
          {topicOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {filters.subjectId ? t.name : `${t.subjectName} — ${t.name}`}
            </option>
          ))}
        </select>

        <select value={filters.difficulty} onChange={(e) => setFilter({ difficulty: e.target.value })}>
          <option value="">Any difficulty</option>
          {difficulties.map((d) => (
            <option key={d.code} value={d.code}>
              {d.label}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button className="btn btn-sm" onClick={() => { setPage(0); setFilters(BLANK_FILTERS); }}>
            Clear
          </button>
        )}

        <div className="spacer" />
        {selectedIds.size > 0 && (
          <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>
            Delete selected ({selectedIds.size})
          </button>
        )}
      </div>

      {loading && <p>Loading...</p>}

      {!loading && data && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Question</th>
                  <th>Subject / Topic</th>
                  <th>Exams</th>
                  <th>Difficulty</th>
                  <th>Languages</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.content.map((q) => {
                  const english = q.translations.find((t) => t.languageCode === "en") || q.translations[0];
                  return (
                    <tr
                      key={q.id}
                      className={q.deleted ? "deleted-row clickable-row" : "clickable-row"}
                      onClick={() => setDetailQuestion(q)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(q.id)}
                          onChange={() => toggleSelected(q.id)}
                        />
                      </td>
                      <td>
                        <div className="cell-primary">{english ? english.questionText : "(no text)"}</div>
                        <div className="cell-tags">
                          {q.deleted && <span className="badge badge-hard">Deleted</span>}
                          {q.premium && <span className="badge">Premium</span>}
                          {/* TICKET-2104. Shows the year when there is one and a bare "PYQ" when
                              there is not — the flag and the year are stored separately precisely
                              so "PYQ, year unknown" is representable, and collapsing them here
                              would hide that state. */}
                          {q.pyq && (
                            <span className="badge badge-easy">
                              PYQ{q.pyqYear ? ` ${q.pyqYear}` : ""}
                              {q.pyqShift ? ` · ${q.pyqShift}` : ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="cell-primary">{q.subjectName}</div>
                        <div className="cell-secondary">{q.topicName}</div>
                      </td>
                      <td>
                        {q.examCodes.map((code) => (
                          <span className="badge" key={code}>
                            {code}
                          </span>
                        ))}
                      </td>
                      <td>
                        <DifficultyBadge code={q.difficulty} meta={difficultyByCode.get(q.difficulty)} />
                      </td>
                      <td>
                        {q.translations.map((t) => (
                          <span className="badge badge-lang" key={t.languageCode}>
                            {t.languageCode}
                          </span>
                        ))}
                      </td>
                      <td>{new Date(q.updatedAt).toLocaleString()}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row-actions">
                          <Link to={`/questions/${q.id}/edit`} className="btn btn-ghost icon-btn" title="Edit">
                            <EditIcon />
                          </Link>
                          <button className="btn btn-ghost icon-btn" title="Delete" onClick={() => handleDelete(q.id)}>
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {data.content.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state">No questions found.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button className="btn btn-sm" disabled={data.first} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {data.number + 1} of {Math.max(data.totalPages, 1)} ({data.totalElements} total)
            </span>
            <button className="btn btn-sm" disabled={data.last} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </>
      )}

      {detailQuestion && (
        <QuestionDetailModal
          question={detailQuestion}
          onClose={() => setDetailQuestion(null)}
          onDelete={handleDelete}
        />
      )}
      {confirmDialog}
    </div>
  );
}
