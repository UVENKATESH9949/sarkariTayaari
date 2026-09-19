import { useEffect, useMemo, useState } from "react";
import { useQuestionTimer } from "../questions/useQuestionTimer";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AlertIcon } from "../components/icons";
import { LoadingState } from "../components/LoadingState";
import { getPracticeQuestions } from "./practiceApi";
import { getQuestionGroups } from "../questions/questionGroups";
import { QuestionBody } from "../questions/QuestionBody";
import { initialDraftFor, draftToResponse, evaluateDraft, isDraftAttempted, needsConfirmStep, type AnswerDraft } from "../questions/answerDraft";
import { newSessionId, saveCompletedSession, uploadCompletedSession, type PracticeResult } from "./session";
import type { Question, QuestionGroup } from "../questions/types";

/**
 * The Practice engine: one question at a time, immediate reveal once an answer is confirmed
 * (unlike Mock Test, which stays blind until submit), a per-question Check-Answer step for
 * every type that cannot infer "done" from a single click, and Finish reachable from the
 * first confirmed question onward — the same rule mobile's quiz.tsx uses.
 */
export default function PracticeQuiz() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { token } = useAuth();

  const examCode = params.get("examCode");
  const examLabel = params.get("examLabel");
  const subjectName = params.get("subjectName");
  const topicId = params.get("topicId") ?? "";
  const topicName = params.get("topicName");
  const difficulty = params.get("difficulty") ?? "all";
  const levelLabel = params.get("levelLabel");

  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [groups, setGroups] = useState<Record<string, QuestionGroup>>({});
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [languageCode, setLanguageCode] = useState("en");
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQuestions(null);
    setError(null);
    getPracticeQuestions(topicId, difficulty, examCode)
      .then(async (qs) => {
        if (cancelled) return;
        const groupIds = [...new Set(qs.map((q) => q.questionGroupId).filter((id): id is string => id !== null))];
        const groupMap = await getQuestionGroups(groupIds);
        if (cancelled) return;
        setQuestions(qs);
        setGroups(groupMap);
        setDrafts(Object.fromEntries(qs.map((q) => [q.id, initialDraftFor(q.questionType)])));
        setCurrentIndex(0);
        setConfirmed(new Set());
      })
      .catch(() => {
        if (!cancelled) setError("Could not load questions for this level.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the actual scope changes
  }, [topicId, difficulty, examCode]);

  const currentQuestion = questions?.[currentIndex] ?? null;
  // TASK-2801 Phase 1 — per-question display time. Keyed on the question on screen, so moving
  // back and forth accumulates rather than restarting. Mirrors mobile's hook exactly.
  const timer = useQuestionTimer(currentQuestion?.id ?? null);
  const currentDraft = currentQuestion ? drafts[currentQuestion.id] : undefined;
  const revealed = currentQuestion ? confirmed.has(currentQuestion.id) : false;

  const availableLanguages = useMemo(
    () => (currentQuestion ? Object.keys(currentQuestion.translations) : []),
    [currentQuestion],
  );
  useEffect(() => {
    if (availableLanguages.length > 0 && !availableLanguages.includes(languageCode)) {
      setLanguageCode(availableLanguages[0]);
    }
  }, [availableLanguages, languageCode]);

  const outcome = useMemo(() => {
    if (!currentQuestion || !currentDraft || !revealed) return undefined;
    return evaluateDraft(
      currentQuestion.questionType,
      currentQuestion.correctIndex,
      currentQuestion.answerKey,
      currentQuestion.contentStructure,
      currentDraft,
    );
  }, [currentQuestion, currentDraft, revealed]);

  if (error) {
    return (
      <div className="banner banner-error" role="alert">
        <AlertIcon aria-hidden="true" />
        <span>{error}</span>
      </div>
    );
  }

  if (!questions || !currentQuestion || !currentDraft) {
    return <LoadingState variant="question" label="Loading questions" />;
  }

  const translation = currentQuestion.translations[languageCode] ?? Object.values(currentQuestion.translations)[0];
  const total = questions.length;
  const canCheck = needsConfirmStep(currentQuestion.questionType) && !revealed && isDraftAttempted(currentDraft);
  const canFinish = confirmed.size > 0;

  function handleDraftChange(next: AnswerDraft) {
    if (!currentQuestion) return;
    setDrafts((prev) => ({ ...prev, [currentQuestion.id]: next }));
    // Single-choice and true/false have exactly one action, so that action IS the confirmation.
    // Every other type needs an explicit Check Answer, since a multi-select/typed/paired/
    // ordered answer can't tell "still deciding" from "done" on its own.
    if (next.kind === "single" || next.kind === "boolean") {
      setConfirmed((prev) => new Set(prev).add(currentQuestion.id));
    }
  }

  function checkAnswer() {
    if (!currentQuestion) return;
    setConfirmed((prev) => new Set(prev).add(currentQuestion.id));
  }

  async function finish() {
    if (!questions) return;
    setFinishing(true);

    // The session finishes while its last question is still on screen, and the effect that banks
    // a period only runs on navigation or unmount — so without this the final question's time is
    // always lost.
    timer.commitCurrent();

    const results: PracticeResult[] = [];
    for (const q of questions) {
      if (!confirmed.has(q.id)) continue;
      const draft = drafts[q.id];
      const response = draftToResponse(q.questionType, draft);
      const result = evaluateDraft(q.questionType, q.correctIndex, q.answerKey, q.contentStructure, draft);
      results.push({
        question: q,
        response,
        outcome: result.outcome,
        scoreFraction: result.scoreFraction,
        timeMs: timer.timeMsFor(q.id),
      });
    }

    const session = {
      id: newSessionId(),
      completedAt: new Date().toISOString(),
      examLabel,
      subjectName,
      topicName,
      levelLabel,
      correctCount: results.filter((r) => r.outcome === "CORRECT").length,
      totalCount: results.length,
      results,
    };

    saveCompletedSession(session);
    if (token) void uploadCompletedSession(token, session);
    navigate(`/practice/summary?sessionId=${encodeURIComponent(session.id)}`);
  }

  return (
    <div className="quiz-layout">
      <div className="quiz">
        <div className="quiz-progress-row">
          <div className="quiz-progress-track">
            <div className="quiz-progress-fill" style={{ width: `${((currentIndex + 1) / total) * 100}%` }} />
          </div>
          <span className="subtle quiz-progress-label">
            Question {currentIndex + 1} of {total}
          </span>
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
          {currentQuestion.isPyq && (
            <span className="pyq-badge">
              Asked in {currentQuestion.pyqYear ?? "a previous year"}
              {currentQuestion.pyqShift ? ` · Shift ${currentQuestion.pyqShift}` : ""}
            </span>
          )}
          <p className="quiz-question-text">{translation?.questionText}</p>

          <QuestionBody
            question={currentQuestion}
            group={currentQuestion.questionGroupId ? groups[currentQuestion.questionGroupId] : null}
            languageCode={languageCode}
            draft={currentDraft}
            onChange={revealed ? undefined : handleDraftChange}
            revealed={revealed}
            outcome={outcome?.outcome}
          />

          {canCheck && (
            <button type="button" className="btn mt-md" onClick={checkAnswer}>
              Check answer
            </button>
          )}

          {revealed && outcome && (
            <div className={`quiz-reveal ${outcome.outcome === "CORRECT" ? "quiz-reveal-correct" : "quiz-reveal-incorrect"}`}>
              <strong>{outcome.outcome === "CORRECT" ? "Correct" : outcome.outcome === "UNATTEMPTED" ? "Not attempted" : "Incorrect"}</strong>
              {translation?.explanation && <p>{translation.explanation}</p>}
            </div>
          )}
        </div>

        <div className="quiz-nav-row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
          >
            Previous
          </button>
          <div className="row">
            {canFinish && (
              <button type="button" className="btn btn-secondary" onClick={() => void finish()} disabled={finishing}>
                {finishing ? "Finishing…" : "Finish"}
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
              disabled={currentIndex === total - 1}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <aside className="quiz-sidebar">
        <div className="card">
          <h2>This session</h2>
          <div className="stack mt-sm">
            {examLabel && <div className="subtle">{examLabel}</div>}
            {(subjectName || topicName) && (
              <div className="subtle">{[subjectName, topicName].filter(Boolean).join(" · ")}</div>
            )}
            {levelLabel && <div className="subtle">{levelLabel}</div>}
          </div>
        </div>
        <div className="card">
          <h2>Progress</h2>
          <div className="stat-headline mt-sm">
            <span className="stat-headline-number">{currentIndex + 1}</span>
            <span className="subtle">of {total}</span>
          </div>
          <div className="quiz-progress-track">
            <div className="quiz-progress-fill" style={{ width: `${((currentIndex + 1) / total) * 100}%` }} />
          </div>
        </div>
      </aside>
    </div>
  );
}
