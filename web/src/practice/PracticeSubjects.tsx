import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertIcon, BookIcon, InboxIcon } from "../components/icons";
import { getSubjectStats, type SubjectStat } from "./practiceApi";
import { questionsLabel } from "@sarkaritaiyaari/core/i18n";
import { useT } from "../i18n/I18nContext";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { LoadingState } from "../components/LoadingState";

export default function PracticeSubjects() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const t = useT();
  const examCode = params.get("examCode");
  const examLabel = params.get("examLabel") ?? "";

  const [subjects, setSubjects] = useState<SubjectStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSubjectStats(examCode)
      .then((s) => {
        if (!cancelled) setSubjects(s);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load subjects.");
      });
    return () => {
      cancelled = true;
    };
  }, [examCode]);

  function openSubject(subject: SubjectStat) {
    const q = new URLSearchParams({
      examCode: examCode ?? "",
      examLabel,
      subjectId: subject.id,
      subjectName: subject.name,
    });
    navigate(`/practice/topics?${q.toString()}`);
  }

  return (
    <>
      <Breadcrumbs items={[{ label: "Practice", to: "/practice" }, { label: examLabel || "Subjects" }]} />

      <div className="page-header">
        <h1>{examLabel || "Subjects"}</h1>
        <p className="subtle">Choose a subject to see its topics.</p>
      </div>

      {error && (
        <div className="banner banner-error" role="alert">
          <AlertIcon aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {!error && subjects === null && <LoadingState variant="rows" rows={5} label="Loading subjects" />}
      {!error && subjects !== null && subjects.length === 0 && (
        <div className="notice">
          <InboxIcon aria-hidden="true" />
          <span>No subjects are defined for this exam yet.</span>
        </div>
      )}

      {!error && subjects !== null && subjects.length > 0 && (
        <div className="card">
          {subjects.map((subject) => {
            const disabled = subject.questionCount === 0;
            return (
              <button
                type="button"
                key={subject.id}
                className="stat-row stat-row-button"
                onClick={() => openSubject(subject)}
                disabled={disabled}
              >
                <span
                  className="stat-icon"
                  aria-hidden="true"
                  style={{ color: subject.color ?? undefined, background: subject.colorBg ?? undefined }}
                >
                  <BookIcon />
                </span>
                <div className="stat-body">
                  <div className="stat-name">{subject.name}</div>
                  <div className="subtle">
                    {disabled ? "No questions yet" : questionsLabel(subject.questionCount, t)}
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
