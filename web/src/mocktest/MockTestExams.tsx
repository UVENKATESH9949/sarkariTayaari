import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InboxIcon } from "../components/icons";
import { ExamCard } from "../components/ExamCard";
import { LoadingState } from "../components/LoadingState";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { getMockTestExams, type MockExamOption } from "./mockTestApi";

/**
 * Mock Test's entry point. Deliberately has no "All Exams" shortcut (unlike Practice) — a
 * mock paper always belongs to one exam's own structure, so browsing "across all exams" has
 * no meaning here the way it does for Practice's question bank.
 */
export default function MockTestExams() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<MockExamOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getMockTestExams()
      .then((e) => {
        if (cancelled) return;
        setExams(e);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load exams.");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function openExam(examCode: string, examLabel: string) {
    navigate(`/mock-test/papers?examCode=${encodeURIComponent(examCode)}&examLabel=${encodeURIComponent(examLabel)}`);
  }

  return (
    <>
      <div className="page-header">
        <h1>Mock Test</h1>
        <p className="subtle">Full-length timed papers with real marking and negative marking.</p>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => setReloadToken((t) => t + 1)} />}

      {!error && exams === null && <LoadingState rows={6} label="Loading exams" />}

      {!error && exams !== null && exams.length === 0 && (
        <EmptyState icon={<InboxIcon />} message="No mockable papers are set up yet." />
      )}

      {!error && exams !== null && exams.length > 0 && (
        <div className="exam-grid">
          {exams.map((exam) => (
            <ExamCard
              key={exam.code}
              identityKey={exam.code}
              imageUrl={exam.imageUrl}
              name={exam.name}
              subtitle={`${exam.mockablePaperCount} mock ${exam.mockablePaperCount === 1 ? "paper" : "papers"}`}
              onClick={() => openExam(exam.code, exam.name)}
            />
          ))}
        </div>
      )}
    </>
  );
}
