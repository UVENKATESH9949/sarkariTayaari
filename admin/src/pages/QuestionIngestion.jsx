import { useCallback, useEffect, useRef, useState } from "react";
import {
  ingestQuestionDocument,
  uploadQuestionDocument,
  listQuestionIngestionDocuments,
  listQuestionCandidates,
  acceptQuestionCandidate,
  rejectQuestionCandidate,
  listTopics,
  listAllExams,
  listDifficultyLevels,
} from "../api.js";

const CONFIDENCE_BADGE = { HIGH: "badge-easy", MEDIUM: "badge-medium", LOW: "badge-hard" };
const STATUS_BADGE = { PENDING: "badge-medium", ACCEPTED: "badge-easy", REJECTED: "badge-hard", EDITED: "badge-medium" };

/**
 * TASK-2501 Phase 2 -- one staged candidate's evidence plus Accept/Reject. {@code
 * topicId}/{@code examCodes}/{@code difficulty} are the fields a rule-based extractor can
 * never know on its own (see {@code QuestionCandidateBuilder}'s own note) -- a reviewer
 * supplies them here as Accept overrides, merged into the stored payload.
 */
function CandidateCard({ candidate, topics, exams, difficulties, onChanged }) {
  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  const [examCode, setExamCode] = useState(exams[0]?.code ?? "");
  const [difficulty, setDifficulty] = useState(difficulties[0]?.code ?? "");
  const [correctAnswer, setCorrectAnswer] = useState(candidate.payload?.correctAnswer ?? "");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const isPending = candidate.status === "PENDING";
  const warnings = candidate.validationWarnings?.messages ?? [];
  const translation = candidate.payload?.translations?.[0] ?? {};

  async function handleAccept(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const overrides = { topicId, examCodes: [examCode], difficulty };
      if (correctAnswer.trim()) overrides.correctAnswer = correctAnswer.trim().toUpperCase();
      await acceptQuestionCandidate(candidate.id, overrides);
      onChanged();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function handleReject(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await rejectQuestionCandidate(candidate.id, rejectReason.trim());
      onChanged();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16, padding: 16 }}>
      <div className="row-actions" style={{ justifyContent: "space-between" }}>
        <div>
          <span className={`badge ${CONFIDENCE_BADGE[candidate.confidence] ?? "badge-medium"}`}>
            {candidate.confidence}
          </span>{" "}
          <span className={`badge ${STATUS_BADGE[candidate.status] ?? "badge-medium"}`}>{candidate.status}</span>
          {candidate.possibleDuplicateOfQuestionId && (
            <>
              {" "}
              <span className="badge badge-hard">
                possible duplicate ({candidate.duplicateSimilarityPercent}%)
              </span>
            </>
          )}
        </div>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {new Date(candidate.createdAt).toLocaleString()}
        </span>
      </div>

      <p style={{ fontWeight: 600, margin: "12px 0 4px" }}>{translation.questionText}</p>
      <ul style={{ margin: "0 0 8px", paddingLeft: 20 }}>
        {(translation.options ?? []).map((option, i) => (
          <li key={i}>
            {String.fromCharCode(65 + i)}. {option}
          </li>
        ))}
      </ul>
      <p className="field-note">Extracted answer: {candidate.payload?.correctAnswer ?? "(none found)"}</p>

      {candidate.sourceExcerpt && <p className="field-note">Source: "{candidate.sourceExcerpt}"</p>}

      {warnings.length > 0 && (
        <div className="banner banner-error">
          {warnings.map((message, i) => (
            <div key={i}>⚠ {message}</div>
          ))}
        </div>
      )}

      {candidate.rejectionReason && <p className="field-note">Rejected: {candidate.rejectionReason}</p>}
      {candidate.appliedQuestionId && (
        <p className="field-note">
          Created question: <code>{candidate.appliedQuestionId}</code>
        </p>
      )}

      {error && <div className="banner banner-error">{error}</div>}

      {isPending && (
        <div>
          <form onSubmit={handleAccept} className="form-row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="form-field">
              <label>Topic</label>
              <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.subjectName} / {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Exam</label>
              <select value={examCode} onChange={(e) => setExamCode(e.target.value)}>
                {exams.map((exam) => (
                  <option key={exam.code} value={exam.code}>
                    {exam.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Difficulty</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                {difficulties.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Correct answer (A-D)</label>
              <input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} maxLength={1} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy || !topicId || !examCode || !difficulty}>
              Accept
            </button>
          </form>

          {!showReject ? (
            <button className="btn" style={{ marginTop: 8 }} onClick={() => setShowReject(true)}>
              Reject
            </button>
          ) : (
            <form onSubmit={handleReject} className="form-row" style={{ alignItems: "flex-end", marginTop: 8 }}>
              <div className="form-field" style={{ maxWidth: "none", flex: 1 }}>
                <label>Rejection reason</label>
                <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} required autoFocus />
              </div>
              <button className="btn btn-danger" type="submit" disabled={busy || !rejectReason.trim()}>
                Confirm reject
              </button>
              <button type="button" className="btn" onClick={() => setShowReject(false)}>
                Cancel
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * TASK-2501 Phase 2 -- paste a source URL, ingest it (fetch -> store -> extract -> split ->
 * stage), then review the resulting candidates. Accepting one calls the exact same
 * {@code QuestionService.create()} the ordinary Add Question form already uses -- the
 * result is a real question, held back as {@code content_status = DRAFT} until published
 * (either here isn't needed -- use the Questions list's own Publish action once satisfied).
 */
export default function QuestionIngestion() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const [documents, setDocuments] = useState([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [topics, setTopics] = useState([]);
  const [exams, setExams] = useState([]);
  const [difficulties, setDifficulties] = useState([]);

  const loadDocuments = useCallback(() => {
    listQuestionIngestionDocuments()
      .then((rows) => {
        setDocuments(rows);
        if (rows.length > 0 && !selectedDocumentId) setSelectedDocumentId(rows[0].documentId);
      })
      .catch((e) => setError(e.message));
  }, [selectedDocumentId]);

  useEffect(() => {
    loadDocuments();
    Promise.all([listTopics(), listAllExams(), listDifficultyLevels()])
      .then(([topicRows, examRows, difficultyRows]) => {
        setTopics([...topicRows].sort((a, b) => `${a.subjectName}/${a.name}`.localeCompare(`${b.subjectName}/${b.name}`)));
        setExams([...examRows].sort((a, b) => a.code.localeCompare(b.code)));
        setDifficulties(difficultyRows);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCandidates = useCallback(() => {
    if (!selectedDocumentId) {
      setCandidates([]);
      return;
    }
    setLoading(true);
    setError(null);
    listQuestionCandidates(selectedDocumentId, statusFilter === "ALL" ? undefined : statusFilter)
      .then(setCandidates)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedDocumentId, statusFilter]);

  useEffect(loadCandidates, [loadCandidates]);

  async function handleIngest(e) {
    e.preventDefault();
    setIngestError(null);
    setIngesting(true);
    try {
      const result = await ingestQuestionDocument(sourceUrl.trim());
      setSummary(result);
      setSourceUrl("");
      loadDocuments();
      setSelectedDocumentId(result.documentId);
    } catch (err) {
      setIngestError(err.message);
    } finally {
      setIngesting(false);
    }
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIngestError(null);
    setUploading(true);
    try {
      const result = await uploadQuestionDocument(file);
      setSummary(result);
      loadDocuments();
      setSelectedDocumentId(result.documentId);
    } catch (err) {
      setIngestError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onCandidateChanged() {
    loadCandidates();
    loadDocuments();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Question Ingestion</h1>
      </div>

      <p className="page-intro">
        TASK-2501 Phase 2 -- paste a link to a PYQ paper PDF, or upload one from your
        computer. It's split into candidate questions by a deterministic rule-based
        extractor (no AI yet), and staged here for review. Accepting a candidate creates a
        real question exactly the way the Add Question form does, held back as a draft
        until you publish it from the Questions list.
      </p>

      <form onSubmit={handleIngest} className="form-row" style={{ alignItems: "flex-end" }}>
        <div className="form-field" style={{ maxWidth: "none", flex: 1 }}>
          <label>Source document URL</label>
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://example.com/ssc-cgl-2024-tier1.pdf"
            required
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={ingesting || !sourceUrl.trim()}>
          {ingesting ? "Ingesting..." : "Ingest"}
        </button>
      </form>

      <div className="form-row" style={{ alignItems: "center", marginTop: 8 }}>
        <span className="field-note">Or upload a PDF from your computer:</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          disabled={uploading}
          onChange={handleFileSelected}
        />
        {uploading && <span className="field-note">Uploading...</span>}
      </div>

      {ingestError && <div className="banner banner-error">{ingestError}</div>}

      {summary && (
        <div className="card" style={{ margin: "16px 0", padding: 16 }}>
          <strong>Extracted {summary.extracted}</strong> — {summary.autoAcceptable} auto-acceptable (HIGH
          confidence, no warnings, no duplicates), {summary.needsReview} need a look,{" "}
          {summary.possibleDuplicates} flagged as possible duplicates.
        </div>
      )}

      <div className="form-row">
        <div className="form-field">
          <label>Document</label>
          <select value={selectedDocumentId} onChange={(e) => setSelectedDocumentId(e.target.value)}>
            {documents.map((d) => (
              <option key={d.documentId} value={d.documentId}>
                {d.sourceUrl} ({d.candidateCount} candidates)
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="PENDING">Pending</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="REJECTED">Rejected</option>
            <option value="ALL">All</option>
          </select>
        </div>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {loading && <p>Loading...</p>}

      {!loading && documents.length === 0 && (
        <div className="empty-state">No documents ingested yet — paste a source URL above.</div>
      )}

      {!loading && documents.length > 0 && candidates.length === 0 && (
        <div className="empty-state">No {statusFilter.toLowerCase()} candidates for this document.</div>
      )}

      {!loading &&
        candidates.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            topics={topics}
            exams={exams}
            difficulties={difficulties}
            onChanged={onCandidateChanged}
          />
        ))}
    </div>
  );
}
