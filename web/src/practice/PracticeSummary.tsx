import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertIcon } from "../components/icons";
import { CheckIcon as CheckBadge } from "../questions/renderers/renderIcons";
import { loadCompletedSession } from "./session";
import { describeYourAnswer, describeCorrectAnswer } from "../questions/describeAnswer";

export default function PracticeSummary() {
  const [params] = useSearchParams();
  const sessionId = params.get("sessionId");
  // sessionStorage is synchronous, so this is a plain derived read, not an effect — there is
  // nothing async to synchronize with. useMemo just avoids re-parsing the JSON on every
  // unrelated re-render.
  const session = useMemo(() => (sessionId ? loadCompletedSession(sessionId) : null), [sessionId]);

  if (session === null) {
    return (
      <div className="banner banner-error" role="alert">
        <AlertIcon aria-hidden="true" />
        <span>
          This session's results aren't available — they're only kept for the current browser
          tab. <Link to="/practice">Start a new practice session</Link>.
        </span>
      </div>
    );
  }

  const accuracy = session.totalCount === 0 ? 0 : Math.round((session.correctCount / session.totalCount) * 100);

  return (
    <>
      <div className="page-header">
        <h1>Session summary</h1>
        <p className="subtle">
          {[session.examLabel, session.subjectName, session.topicName, session.levelLabel].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="card summary-score">
        <div className="summary-score-number">{accuracy}%</div>
        <div>
          <div className="stat-name">
            {session.correctCount} of {session.totalCount} correct
          </div>
          <div className="subtle">{new Date(session.completedAt).toLocaleString()}</div>
        </div>
      </div>

      <div className="stack" style={{ marginTop: "var(--space-md)" }}>
        {session.results.map((result, index) => {
          const languageCode = Object.keys(result.question.translations)[0] ?? "en";
          const translation = result.question.translations[languageCode];
          const correct = result.outcome === "CORRECT";
          return (
            <div key={result.question.id} className="card review-card">
              <div className="review-card-header">
                <span className="subtle">Question {index + 1}</span>
                <span className={correct ? "pill pill-success" : "pill pill-error"}>
                  {correct ? <CheckBadge aria-hidden="true" /> : null}
                  {correct ? "Correct" : result.outcome === "UNATTEMPTED" ? "Not attempted" : "Incorrect"}
                </span>
              </div>
              <p className="quiz-question-text">{translation?.questionText}</p>
              <div className="review-answer-row">
                <span className="subtle">Your answer:</span>
                <span>{describeYourAnswer(result.question, result.response, languageCode)}</span>
              </div>
              {!correct && (
                <div className="review-answer-row">
                  <span className="subtle">Correct answer:</span>
                  <span>{describeCorrectAnswer(result.question, languageCode)}</span>
                </div>
              )}
              {translation?.explanation && <p className="subtle" style={{ marginTop: "var(--space-sm)" }}>{translation.explanation}</p>}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "var(--space-lg)" }}>
        <Link to="/practice" className="btn">
          Back to Practice
        </Link>
      </div>
    </>
  );
}
