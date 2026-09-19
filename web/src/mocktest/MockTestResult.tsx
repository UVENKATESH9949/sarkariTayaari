import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertIcon } from "../components/icons";
import { CheckIcon as CheckBadge } from "../questions/renderers/renderIcons";
import { loadCompletedAttempt } from "./attempt";
import { describeYourAnswer, describeCorrectAnswer } from "../questions/describeAnswer";
import { Breadcrumbs } from "../components/Breadcrumbs";

export default function MockTestResult() {
  const [params] = useSearchParams();
  const attemptId = params.get("attemptId");
  // sessionStorage is synchronous — a plain derived read, not an effect. See PracticeSummary's identical note.
  const attempt = useMemo(() => (attemptId ? loadCompletedAttempt(attemptId) : null), [attemptId]);

  if (attempt === null) {
    return (
      <div className="banner banner-error" role="alert">
        <AlertIcon aria-hidden="true" />
        <span>
          This attempt's results aren't available — they're only kept for the current browser
          tab. <Link to="/mock-test">Start a new mock test</Link>.
        </span>
      </div>
    );
  }

  const subjectGroups = new Map<string, { correct: number; wrong: number; unattempted: number }>();
  for (const r of attempt.results) {
    const key = r.question.subjectName ?? "Other";
    const bucket = subjectGroups.get(key) ?? { correct: 0, wrong: 0, unattempted: 0 };
    if (r.outcome === "CORRECT") bucket.correct += 1;
    else if (r.outcome === "INCORRECT") bucket.wrong += 1;
    else bucket.unattempted += 1;
    subjectGroups.set(key, bucket);
  }

  const minutes = Math.floor(attempt.timeTakenSeconds / 60);
  const seconds = attempt.timeTakenSeconds % 60;

  return (
    <>
      <Breadcrumbs items={[{ label: "Mock Test", to: "/mock-test" }, { label: attempt.paperName ?? "Result" }]} />

      <div className="page-header">
        <h1>{attempt.paperName ?? "Mock test result"}</h1>
        <p className="subtle">
          {new Date(attempt.completedAt).toLocaleString()} · Time taken {minutes}m {seconds}s
        </p>
      </div>

      <div className="card summary-score">
        <div className="summary-score-number">{attempt.totalMarksScored}</div>
        <div>
          <div className="stat-name">
            {attempt.correctCount} correct · {attempt.wrongCount} wrong · {attempt.unattemptedCount} not attempted
          </div>
          <div className="subtle">
            +{attempt.marksCorrect} / {attempt.marksWrong ? `−${attempt.marksWrong}` : "0"} marking scheme, {attempt.totalQuestions} questions
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-sm">By subject</h2>
        {[...subjectGroups.entries()].map(([subject, b]) => (
          <div className="stat-row" key={subject}>
            <div className="stat-body">
              <div className="stat-name">{subject}</div>
              <div className="subtle">
                {b.correct} correct · {b.wrong} wrong · {b.unattempted} not attempted
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="stack mt-md">
        {attempt.results.map((result, index) => {
          const languageCode = Object.keys(result.question.translations)[0] ?? "en";
          const translation = result.question.translations[languageCode];
          const correct = result.outcome === "CORRECT";
          const wrong = result.outcome === "INCORRECT";
          return (
            <div key={result.question.id} className="card review-card">
              <div className="review-card-header">
                <span className="subtle">
                  Question {index + 1} · {result.question.subjectName}
                </span>
                <span className={correct ? "pill pill-success" : wrong ? "pill pill-error" : "pill"}>
                  {correct ? <CheckBadge aria-hidden="true" /> : null}
                  {correct ? "Correct" : wrong ? "Incorrect" : "Not attempted"}
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
              {translation?.explanation && (
                <p className="subtle mt-sm">{translation.explanation}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-lg">
        <Link to="/mock-test" className="btn">
          Back to Mock Test
        </Link>
      </div>
    </>
  );
}
