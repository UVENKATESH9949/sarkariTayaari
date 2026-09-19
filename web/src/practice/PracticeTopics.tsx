import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { questionsLabel } from "@sarkaritaiyaari/core/i18n";
import { useT } from "../i18n/I18nContext";
import { AlertIcon, ChartIcon, InboxIcon } from "../components/icons";
import { getTopicStats, type TopicStat } from "./practiceApi";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { LoadingState } from "../components/LoadingState";

export default function PracticeTopics() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const t = useT();
  const examCode = params.get("examCode");
  const examLabel = params.get("examLabel") ?? "";
  const subjectId = params.get("subjectId") ?? "";
  const subjectName = params.get("subjectName") ?? "";

  const [topics, setTopics] = useState<TopicStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTopicStats(subjectId, examCode)
      .then((ts) => {
        if (!cancelled) setTopics(ts);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load topics.");
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId, examCode]);

  function openTopic(topic: TopicStat) {
    const q = new URLSearchParams({
      examCode: examCode ?? "",
      examLabel,
      subjectId,
      subjectName,
      topicId: topic.id,
      topicName: topic.name,
    });
    navigate(`/practice/levels?${q.toString()}`);
  }

  const subjectsQuery = new URLSearchParams({ examCode: examCode ?? "", examLabel }).toString();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Practice", to: "/practice" },
          { label: examLabel || "Exam", to: `/practice/subjects?${subjectsQuery}` },
          { label: subjectName || "Topics" },
        ]}
      />

      <div className="page-header">
        <h1>{subjectName || "Topics"}</h1>
        <p className="subtle">{examLabel}</p>
      </div>

      {error && (
        <div className="banner banner-error" role="alert">
          <AlertIcon aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {!error && topics === null && <LoadingState variant="rows" rows={6} label="Loading topics" />}
      {!error && topics !== null && topics.length === 0 && (
        <div className="notice">
          <InboxIcon aria-hidden="true" />
          <span>No topics are defined for this subject yet.</span>
        </div>
      )}

      {!error && topics !== null && topics.length > 0 && (
        <div className="card">
          {topics.map((topic) => {
            const disabled = topic.questionCount === 0;
            return (
              <button
                type="button"
                key={topic.id}
                className="stat-row stat-row-button"
                onClick={() => openTopic(topic)}
                disabled={disabled}
              >
                <span className="stat-icon" aria-hidden="true"><ChartIcon /></span>
                <div className="stat-body">
                  <div className="stat-name">{topic.name}</div>
                  <div className="subtle">
                    {disabled ? "No questions yet" : questionsLabel(topic.questionCount, t)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
