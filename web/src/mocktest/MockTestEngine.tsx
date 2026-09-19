import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AlertIcon } from "../components/icons";
import { LoadingState } from "../components/LoadingState";
import { useActiveSession } from "../practice/activeSession";
import { getPaperById, buildMockTestQuestions, totalDurationMinutes } from "./mockTestApi";
import { getQuestionGroups } from "../questions/questionGroups";
import { QuestionBody } from "../questions/QuestionBody";
import { useQuestionTimer } from "../questions/useQuestionTimer";
import { initialDraftFor, draftToResponse, evaluateDraft, isDraftAttempted, type AnswerDraft } from "../questions/answerDraft";
import { newAttemptId, saveCompletedAttempt, uploadCompletedAttempt, type MockResult } from "./attempt";
import type { MockPaper } from "./types";
import type { Question, QuestionGroup } from "../questions/types";

/**
 * The Mock Test engine — blind (no reveal until submit), a countdown that auto-submits at
 * zero, mark-for-review, clear-response, and a question-navigator grid. `QuestionBody` is
 * always called with `revealed={false}`, which is what makes this the same renderer set as
 * Practice with none of Practice's immediate feedback — the renderers themselves have no
 * "blind mode" flag, they simply never receive a correctIndex/outcome to colour with.
 */
export default function MockTestEngine() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { token } = useAuth();
  const { start: startSession, end: endSession } = useActiveSession();

  const paperId = params.get("paperId") ?? "";
  const examLabel = params.get("examLabel");

  const [paper, setPaper] = useState<MockPaper | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [groups, setGroups] = useState<Record<string, QuestionGroup>>({});
  const [error, setError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [languageCode, setLanguageCode] = useState("en");
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const endAtRef = useRef<number>(0);
  const startedAtRef = useRef<string>("");
  const submittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getPaperById(paperId)
      .then(async (p) => {
        if (cancelled || !p) {
          if (!cancelled) setError("This paper could not be found.");
          return;
        }
        const qs = await buildMockTestQuestions(p);
        const groupIds = [...new Set(qs.map((q) => q.questionGroupId).filter((id): id is string => id !== null))];
        const groupMap = await getQuestionGroups(groupIds);
        if (cancelled) return;

        setPaper(p);
        setQuestions(qs);
        setGroups(groupMap);
        setDrafts(Object.fromEntries(qs.map((q) => [q.id, initialDraftFor(q.questionType)])));
        setVisited(new Set(qs.length > 0 ? [qs[0].id] : []));

        const durationSeconds = totalDurationMinutes(p) * 60;
        endAtRef.current = Date.now() + durationSeconds * 1000;
        startedAtRef.current = new Date().toISOString();
        setRemainingSeconds(durationSeconds);
        startSession();
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this test.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per paperId, not on every render
  }, [paperId]);

  const currentQuestion = questions?.[currentIndex] ?? null;
  // TASK-2801 Phase 1 — per-question display time, accumulated across revisits. A mock test is
  // navigated back and forth far more than a practice quiz, which is exactly why it accumulates
  // rather than timing from first view to answer.
  const timer = useQuestionTimer(currentQuestion?.id ?? null);
  const currentDraft = currentQuestion ? drafts[currentQuestion.id] : undefined;

  const availableLanguages = useMemo(
    () => (currentQuestion ? Object.keys(currentQuestion.translations) : []),
    [currentQuestion],
  );
  useEffect(() => {
    if (availableLanguages.length > 0 && !availableLanguages.includes(languageCode)) {
      setLanguageCode(availableLanguages[0]);
    }
  }, [availableLanguages, languageCode]);

  // Countdown driven by a fixed end-timestamp, not a decrementing counter — a background/
  // throttled tab still reports the correct remaining time on its next tick rather than
  // drifting from missed intervals.
  useEffect(() => {
    if (!paper) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        void finish(true);
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish is stable enough for this interval's purpose; re-creating it on every state change would restart the countdown
  }, [paper]);

  function goTo(index: number) {
    setCurrentIndex(index);
    const q = questions?.[index];
    if (q) setVisited((prev) => new Set(prev).add(q.id));
    setNavigatorOpen(false);
  }

  function handleDraftChange(next: AnswerDraft) {
    if (!currentQuestion) return;
    setDrafts((prev) => ({ ...prev, [currentQuestion.id]: next }));
  }

  function clearResponse() {
    if (!currentQuestion) return;
    setDrafts((prev) => ({ ...prev, [currentQuestion.id]: initialDraftFor(currentQuestion.questionType) }));
  }

  function toggleMarked() {
    if (!currentQuestion) return;
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(currentQuestion.id)) next.delete(currentQuestion.id);
      else next.add(currentQuestion.id);
      return next;
    });
  }

  async function finish(auto: boolean) {
    if (submittedRef.current || !questions || !paper) return;
    submittedRef.current = true;
    setSubmitting(true);

    // Banks the question still on screen at submit — including an auto-submit when the timer
    // runs out, where nothing navigates away first.
    timer.commitCurrent();

    const results: MockResult[] = questions.map((q) => {
      const draft = drafts[q.id];
      const response = draftToResponse(q.questionType, draft);
      const { outcome } = evaluateDraft(q.questionType, q.correctIndex, q.answerKey, q.contentStructure, draft);
      return {
        question: q,
        response,
        outcome,
        markedForReview: marked.has(q.id),
        timeMs: timer.timeMsFor(q.id),
      };
    });

    const correctCount = results.filter((r) => r.outcome === "CORRECT").length;
    const wrongCount = results.filter((r) => r.outcome === "INCORRECT").length;
    const unattemptedCount = results.length - correctCount - wrongCount;
    // Papers may legitimately have no marking scheme set; fall back to a plain +1/0 count
    // rather than scoring everything as zero — matches mobile's own established fallback.
    const marksCorrect = paper.marksCorrect ?? 1;
    const marksWrong = paper.marksWrong ?? 0;
    const totalMarksScored = correctCount * marksCorrect - wrongCount * marksWrong;
    const durationSeconds = totalDurationMinutes(paper) * 60;
    const timeTakenSeconds = auto ? durationSeconds : durationSeconds - remainingSeconds;

    const attempt = {
      id: newAttemptId(),
      examCode: paper.examCode,
      examLabel: examLabel ? `${examLabel} — ${paper.name}` : paper.name,
      paperName: paper.name,
      startedAt: startedAtRef.current,
      completedAt: new Date().toISOString(),
      durationSeconds,
      timeTakenSeconds,
      marksCorrect,
      marksWrong,
      totalMarksScored,
      correctCount,
      wrongCount,
      unattemptedCount,
      totalQuestions: results.length,
      results,
    };

    saveCompletedAttempt(attempt);
    if (token) void uploadCompletedAttempt(token, attempt);
    endSession();
    navigate(`/mock-test/result?attemptId=${encodeURIComponent(attempt.id)}`);
  }

  if (error) {
    return (
      <div className="banner banner-error" role="alert">
        <AlertIcon aria-hidden="true" />
        <span>{error}</span>
      </div>
    );
  }

  if (!questions || !currentQuestion || !currentDraft || !paper) {
    return <LoadingState variant="question" label="Preparing your test" />;
  }

  const total = questions.length;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeLow = remainingSeconds <= 5 * 60;
  const translation = currentQuestion.translations[languageCode] ?? Object.values(currentQuestion.translations)[0];

  // Shared between the narrow-screen modal and the always-visible desktop sidebar (see
  // `.quiz-sidebar` in styles/index.css) — the SAME state, just two places it can render,
  // never both reachable for a given viewport width.
  const navigatorContent = (
    <>
      <div className="navigator-legend">
        <span><i className="navigator-dot navigator-dot-answered" /> Answered</span>
        <span><i className="navigator-dot navigator-dot-marked" /> Marked</span>
        <span><i className="navigator-dot navigator-dot-notanswered" /> Not answered</span>
        <span><i className="navigator-dot navigator-dot-notvisited" /> Not visited</span>
      </div>
      <div className="navigator-scroll">
        <div className="navigator-grid">
          {questions.map((q, index) => {
            const answered = isDraftAttempted(drafts[q.id]);
            const isMarked = marked.has(q.id);
            const wasVisited = visited.has(q.id);
            let state = "navigator-notvisited";
            if (isMarked) state = "navigator-marked";
            else if (answered) state = "navigator-answered";
            else if (wasVisited) state = "navigator-notanswered";
            return (
              <button
                type="button"
                key={q.id}
                className={`navigator-cell ${state} ${index === currentIndex ? "navigator-current" : ""}`}
                onClick={() => goTo(index)}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div className="quiz-layout">
      <div className="quiz mocktest-engine">
        <div className="mocktest-header">
          <span className="subtle">
            {currentQuestion.sectionName} · Question {currentIndex + 1} of {total}
          </span>
          <span className={`mocktest-timer ${timeLow ? "mocktest-timer-low" : ""}`}>
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </span>
          <button type="button" className="btn btn-secondary quiz-nav-trigger" onClick={() => setNavigatorOpen(true)}>
            Questions
          </button>
        </div>

        {availableLanguages.length > 1 && (
          <div className="quiz-lang-row">
            {availableLanguages.map((code) => (
              <button
                key={code}
                type="button"
                className={code === languageCode ? "chip chip-active" : "chip"}
                onClick={() => setLanguageCode(code)}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        <div className="card quiz-card">
          {marked.has(currentQuestion.id) && <span className="pill mocktest-marked-pill">Marked for review</span>}
          <p className="quiz-question-text">{translation?.questionText}</p>
          <QuestionBody
            question={currentQuestion}
            group={currentQuestion.questionGroupId ? groups[currentQuestion.questionGroupId] : null}
            languageCode={languageCode}
            draft={currentDraft}
            onChange={handleDraftChange}
            revealed={false}
          />
        </div>

        <div className="mocktest-action-row">
          <button type="button" className="btn btn-secondary" onClick={clearResponse} disabled={!isDraftAttempted(currentDraft)}>
            Clear response
          </button>
          <button type="button" className="btn btn-secondary" onClick={toggleMarked}>
            {marked.has(currentQuestion.id) ? "Unmark" : "Mark for review"}
          </button>
        </div>

        <div className="quiz-nav-row">
          <button type="button" className="btn btn-secondary" onClick={() => goTo(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>
            Previous
          </button>
          <div className="row">
            <button type="button" className="btn btn-danger" onClick={() => setConfirmSubmitOpen(true)} disabled={submitting}>
              Submit test
            </button>
            <button type="button" className="btn" onClick={() => goTo(Math.min(total - 1, currentIndex + 1))} disabled={currentIndex === total - 1}>
              Save &amp; next
            </button>
          </div>
        </div>
      </div>

      <aside className="quiz-sidebar">
        <div className="card">
          <h2 className="mb-sm">Question Navigator</h2>
          {navigatorContent}
        </div>
      </aside>

      {navigatorOpen && (
        <div className="dialog-overlay" role="presentation" onClick={() => setNavigatorOpen(false)}>
          <div className="dialog-panel navigator-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Question Navigator</h2>
            {navigatorContent}
            <button type="button" className="btn btn-secondary btn-block mt-md" onClick={() => setNavigatorOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {confirmSubmitOpen && (
        <div className="dialog-overlay" role="presentation" onClick={() => setConfirmSubmitOpen(false)}>
          <div className="dialog-panel" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Submit this test?</h2>
            <p className="subtle mt-sm">
              You've answered {questions.filter((q) => isDraftAttempted(drafts[q.id])).length} of {total} questions. You
              cannot change any answers after submitting.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmSubmitOpen(false)}>
                Keep working
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void finish(false)} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
