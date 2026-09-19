import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { questionsLabel } from "@sarkaritaiyaari/core/i18n";
import { useT } from "../i18n/I18nContext";
import { AlertIcon, TimerIcon } from "../components/icons";
import { getDifficultyCounts, getDifficultyLevels, type DifficultyLevel } from "./practiceApi";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { LoadingState } from "../components/LoadingState";

/**
 * The difficulty picker — the shared "start a quiz" funnel every entry point into Practice
 * converges on. Levels are whatever the admin synced, in admin order, not a fixed three.
 */
export default function PracticeLevels() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const t = useT();
  const examCode = params.get("examCode");
  const examLabel = params.get("examLabel") ?? "";
  const subjectId = params.get("subjectId") ?? "";
  const subjectName = params.get("subjectName") ?? "";
  const topicId = params.get("topicId") ?? "";
  const topicName = params.get("topicName") ?? "";

  const [levels, setLevels] = useState<DifficultyLevel[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDifficultyLevels(), getDifficultyCounts(topicId, examCode)])
      .then(([l, c]) => {
        if (cancelled) return;
        setLevels(l);
        setCounts(c);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load difficulty levels.");
      });
    return () => {
      cancelled = true;
    };
  }, [topicId, examCode]);

  const allCount = Object.values(counts).reduce((sum, n) => sum + n, 0);

  function startQuiz(difficulty: string, levelLabel: string) {
    const q = new URLSearchParams({
      examCode: examCode ?? "",
      examLabel,
      subjectId,
      subjectName,
      topicId,
      topicName,
      difficulty,
      levelLabel,
    });
    navigate(`/practice/quiz?${q.toString()}`);
  }

  const subjectsQuery = new URLSearchParams({ examCode: examCode ?? "", examLabel }).toString();
  const topicsQuery = new URLSearchParams({ examCode: examCode ?? "", examLabel, subjectId, subjectName }).toString();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Practice", to: "/practice" },
          { label: examLabel || "Exam", to: `/practice/subjects?${subjectsQuery}` },
          { label: subjectName || "Subject", to: `/practice/topics?${topicsQuery}` },
          { label: topicName || "Difficulty" },
        ]}
      />

      <div className="page-header">
        <h1>{topicName || "Difficulty"}</h1>
        <p className="subtle">{[examLabel, subjectName].filter(Boolean).join(" · ")}</p>
      </div>

      {error && (
        <div className="banner banner-error" role="alert">
          <AlertIcon aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {!error && levels === null && <LoadingState variant="rows" rows={4} label="Loading difficulty levels" />}

      {!error && levels !== null && (
        <div className="card">
          <button
            type="button"
            className="stat-row stat-row-button"
            onClick={() => startQuiz("all", "Mixed difficulty")}
            disabled={allCount === 0}
          >
            <span className="stat-icon" aria-hidden="true"><TimerIcon /></span>
            <div className="stat-body">
              <div className="stat-name">All difficulties</div>
              <div className="subtle">{allCount === 0 ? "No questions yet" : questionsLabel(allCount, t)}</div>
            </div>
          </button>

          {levels.map((level) => {
            const count = counts[level.code] ?? 0;
            const disabled = count === 0;
            return (
              <button
                type="button"
                key={level.code}
                className="stat-row stat-row-button"
                onClick={() => startQuiz(level.code, level.label)}
                disabled={disabled}
              >
                <span
                  className="stat-icon"
                  aria-hidden="true"
                  style={{ color: level.color ?? undefined, background: level.colorBg ?? undefined }}
                >
                  <TimerIcon />
                </span>
                <div className="stat-body">
                  <div className="stat-name">{level.label}</div>
                  <div className="subtle">{disabled ? "No questions yet" : questionsLabel(count, t)}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
