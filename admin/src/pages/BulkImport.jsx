import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { bulkImportQuestions, listLanguages, listAllExams, listAllDifficultyLevels } from "../api.js";
import { validateQuestions } from "../validateQuestions.js";
import Modal from "../components/Modal.jsx";
import { useConfirm } from "../hooks/useConfirm.jsx";

const EXAMPLE = [
  {
    correctAnswer: "B",
    subjectName: "Quantitative Aptitude",
    topicName: "Percentages",
    difficulty: "easy",
    examCodes: ["SSC_CGL", "SSC_CHSL"],
    premium: false,
    translations: [
      {
        languageCode: "en",
        questionText: "What is 5 + 7?",
        options: ["10", "12", "14", "16"],
        explanation: "5 + 7 = 12, which is option B.",
      },
      {
        languageCode: "hi",
        questionText: "5 + 7 कितना होता है?",
        options: ["10", "12", "14", "16"],
        explanation: "5 + 7 = 12, जो विकल्प B है।",
      },
    ],
  },
];

export default function BulkImport() {
  const [text, setText] = useState("");
  const [analyzedText, setAnalyzedText] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [languages, setLanguages] = useState([]);
  const [examCodes, setExamCodes] = useState([]);
  const [difficultyCodes, setDifficultyCodes] = useState([]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const fileInputRef = useRef(null);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    Promise.all([listLanguages(), listAllExams(), listAllDifficultyLevels()])
      .then(([languageRows, examRows, difficultyRows]) => {
        setLanguages(languageRows);
        setExamCodes(examRows.map((exam) => exam.code));
        setDifficultyCodes(difficultyRows.map((d) => d.code));
      })
      .catch((e) => setError(e.message));
  }, []);

  const isStale = analyzedText !== null && analyzedText !== text;

  async function handleClear() {
    if (text.trim()) {
      const ok = await confirm("Clear everything you've pasted/uploaded? This cannot be undone.", {
        title: "Clear import box",
        confirmLabel: "Clear",
        danger: true,
      });
      if (!ok) return;
    }
    setText("");
    setAnalyzedText(null);
    setAnalysis(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (text.trim()) {
      const ok = await confirm("This will replace the content currently in the box. Continue?", {
        title: "Replace current content",
        confirmLabel: "Replace",
        danger: true,
      });
      if (!ok) {
        e.target.value = "";
        return;
      }
    }
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result));
      setAnalysis(null);
      setAnalyzedText(null);
      setError(null);
    };
    reader.onerror = () => setError("Could not read the selected file.");
    reader.readAsText(file);
  }

  function handleAnalyze() {
    setError(null);
    let parsed;
    try {
      parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Input must be a JSON array of questions");
    } catch (parseErr) {
      setError(`Invalid JSON: ${parseErr.message}`);
      setAnalysis(null);
      setAnalyzedText(null);
      return;
    }
    const result = validateQuestions(parsed, languages, examCodes, difficultyCodes);
    setAnalysis(result);
    setAnalyzedText(text);
  }

  function removeFromBatch(index) {
    setAnalysis((prev) => {
      const results = prev.results.filter((r) => r.index !== index);
      return {
        results,
        validCount: results.filter((r) => r.valid).length,
        invalidCount: results.filter((r) => !r.valid).length,
      };
    });
  }

  async function handleImport() {
    if (!analysis) return;
    const validResults = analysis.results.filter((r) => r.valid);
    if (validResults.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await bulkImportQuestions(validResults.map((r) => r.question));
      const failures = (response.failures || []).map((f) => ({
        ...f,
        question: validResults[f.index]?.question,
      }));
      setImportSummary({
        attempted: validResults.length,
        createdCount: response.createdCount,
        failures,
        // TICKET-2109. Kept separate from `failures` on purpose: these rows *were* imported.
        // The server records a duplicate for review rather than rejecting it, because matching
        // wording does not always mean the same question.
        duplicatesDetected: response.duplicatesDetected || {},
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startNewImport() {
    setImportSummary(null);
    handleClear();
  }

  // --- Post-import summary ---
  if (importSummary) {
    return (
      <div>
        <div className="page-header">
          <h1>Import Result</h1>
        </div>

        <div className={importSummary.failures.length === 0 ? "banner banner-success" : "banner banner-error"}>
          Imported {importSummary.createdCount} of {importSummary.attempted} question(s).
          {importSummary.failures.length > 0 && ` ${importSummary.failures.length} could not be imported.`}
        </div>

        {Object.keys(importSummary.duplicatesDetected || {}).length > 0 && (
          <div className="banner banner-warn">
            {Object.keys(importSummary.duplicatesDetected).length} of the imported question(s) look
            like duplicates of questions already in the bank. They <strong>were</strong> imported —
            nothing was rejected — and are waiting in{" "}
            <Link to="/duplicates">Duplicates</Link> for you to confirm or dismiss.
          </div>
        )}

        {importSummary.failures.length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Not imported</h2>
            {importSummary.failures.map((f, i) => (
              <div className="translation-view" key={i} style={{ borderColor: "var(--color-danger)" }}>
                <strong>
                  {f.question?.subjectName || "Question"}
                  {f.question?.topicName ? ` / ${f.question.topicName}` : ""}
                  {Array.isArray(f.question?.examCodes) ? ` (${f.question.examCodes.join(", ")})` : ""}
                </strong>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--color-danger)" }}>{f.error}</p>
              </div>
            ))}
          </div>
        )}

        <div className="form-actions">
          <Link to="/" className="btn btn-primary">View Questions list</Link>
          <button className="btn" onClick={startNewImport}>Start a new import</button>
        </div>
      </div>
    );
  }

  // --- Input / analyse / pre-import review step ---
  return (
    <div>
      <div className="page-header">
        <h1>Bulk Import</h1>
      </div>

      <p style={{ color: "var(--color-text-muted)", marginBottom: 16 }}>
        Paste a JSON array of questions, or upload a .json file. Run the analyser, review the questions below, and remove
        anything you don't want — <strong>before</strong> importing.
      </p>

      <p className="page-intro">
        Subjects and topics are matched by name and created automatically if they don't exist yet. Exam codes are
        not — an unknown code fails that question, so create the exam first.
      </p>

      <p className="page-intro">
        Every imported question is also checked against the <strong>entire existing bank</strong>, not
        just this batch. Matches are recorded in <Link to="/duplicates">Duplicates</Link> for review
        rather than rejected — two questions can share wording and still be different.
      </p>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="card">
        <textarea
          rows={14}
          style={{ width: "100%", fontFamily: "var(--mono)", padding: 12 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste JSON array here, or upload a file below..."
        />
        <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
          <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleFileChange} />
          <div className="spacer" />
          <button type="button" className="btn btn-sm" onClick={() => setShowExample(true)}>
            View example format
          </button>
          <button type="button" className="btn btn-sm" onClick={handleClear} disabled={!text}>
            Clear
          </button>
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={handleAnalyze} disabled={!text.trim()}>
          Analyze
        </button>
      </div>

      {analysis && !isStale && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2>Review before import</h2>
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <span className="badge badge-easy">{analysis.validCount} valid</span>
            {analysis.invalidCount > 0 && (
              <span className="badge badge-hard">{analysis.invalidCount} invalid</span>
            )}
            <span style={{ fontSize: 13, color: "var(--color-text-subtle)" }}>
              Remove anything you don't want to import — no database changes happen until you click Import.
            </span>
          </div>

          <div style={{ maxHeight: 440, overflowY: "auto" }}>
            {analysis.results.map((r) => (
              <div
                key={r.index}
                className="translation-view"
                style={{ borderColor: r.valid ? "var(--color-border)" : "var(--color-danger)" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <strong>{r.valid ? "✅" : "❌"} Question #{r.index + 1}</strong>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeFromBatch(r.index)}>
                    Remove from batch
                  </button>
                </div>

                {r.question && typeof r.question === "object" && (
                  <div style={{ margin: "8px 0" }}>
                    <span className="badge" style={{ marginRight: 6 }}>{r.question.subjectName || "(no subject)"}</span>
                    <span className="badge" style={{ marginRight: 6 }}>{r.question.topicName || "(no topic)"}</span>
                    <span className="badge" style={{ marginRight: 6 }}>{r.question.difficulty || "(no difficulty)"}</span>
                    {Array.isArray(r.question.examCodes) && r.question.examCodes.length > 0 ? (
                      r.question.examCodes.map((code) => (
                        <span className="badge" style={{ marginRight: 6 }} key={code}>{code}</span>
                      ))
                    ) : (
                      <span className="badge">(no exam codes)</span>
                    )}
                    {Array.isArray(r.question.translations) &&
                      r.question.translations.map((t, ti) => (
                        <p key={ti} style={{ fontSize: 13.5, margin: "8px 0 0" }}>
                          <span className="badge badge-lang">{t?.languageCode || "?"}</span> {t?.questionText}
                        </p>
                      ))}
                  </div>
                )}

                {r.errors.length > 0 && (
                  <ul style={{ margin: "6px 0 0", color: "var(--color-danger)", fontSize: 13 }}>
                    {r.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
                {r.warnings.length > 0 && (
                  <ul style={{ margin: "6px 0 0", color: "#b45309", fontSize: 13 }}>
                    {r.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
              </div>
            ))}
            {analysis.results.length === 0 && (
              <div className="empty-state">Everything was removed from this batch.</div>
            )}
          </div>

          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={submitting || analysis.validCount === 0}
            >
              {submitting
                ? "Importing..."
                : analysis.invalidCount > 0
                ? `Import ${analysis.validCount} valid question(s) (skip ${analysis.invalidCount})`
                : `Import all ${analysis.validCount} question(s)`}
            </button>
          </div>
        </div>
      )}

      {isStale && (
        <p style={{ marginTop: 12, color: "var(--color-text-subtle)", fontSize: 13 }}>
          Content changed since last analysis — click Analyze again.
        </p>
      )}

      {showExample && (
        <Modal title="Example bulk import format" onClose={() => setShowExample(false)}>
          <p style={{ marginBottom: 10, color: "var(--color-text-muted)", fontSize: 13 }}>
            This is a reference only — it is not loaded into the import box.
          </p>
          <pre style={{ background: "var(--color-bg)", padding: 12, borderRadius: 8, overflowX: "auto", fontSize: 12.5 }}>
            {JSON.stringify(EXAMPLE, null, 2)}
          </pre>
        </Modal>
      )}
      {confirmDialog}
    </div>
  );
}
