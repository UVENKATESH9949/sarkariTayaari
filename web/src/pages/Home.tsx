import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getExams, ApiError, type ExamResponse } from "@sarkaritaiyaari/core/api";
import { useAuth } from "../auth/AuthContext";
import { InboxIcon } from "../components/icons";
import { ExamCard } from "../components/ExamCard";
import { LoadingState } from "../components/LoadingState";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";

/**
 * The dashboard — and, for now, the app's end-to-end proof.
 *
 * `GET /api/exams` is public, so this renders real backend data signed out. That makes it the
 * honest check that the whole chain works in a browser: the base URL is configured, the shared
 * API client runs unmodified outside React Native, and the backend's CORS allowlist actually
 * answers a real cross-origin request from this origin.
 *
 * A real per-student stats/"continue where you left off" section was attempted here and pulled
 * back out — see this file's own history note (recorded when it was removed). `GET /api/progress`
 * is the only endpoint that could supply it, and it returns a student's ENTIRE practice/mock
 * history with full per-question results, unpaginated. Measured directly against the demo
 * account (356 sessions + 88 attempts): 49 seconds, 3.9MB. That is fine as a one-time restore
 * into a local store (which is what it was built for) and unusable as something a page waits on
 * to render. A real dashboard needs a lightweight summary endpoint (counts + accuracy only, no
 * per-question results) that does not exist yet — backend work, not something to route around
 * from here. Until then, this page stays public-data-only, same as the phone app's own stance
 * that a fake or perpetually-loading number is worse than a missing one.
 */
export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [exams, setExams] = useState<ExamResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getExams()
      .then((result) => {
        if (cancelled) return;
        setExams(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? `${err.message}${err.status === 0 ? " (this is also what a blocked CORS request looks like)" : ""}`
            : "Could not load exams.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function openExam(examCode: string, examLabel: string) {
    navigate(`/practice/subjects?examCode=${encodeURIComponent(examCode)}&examLabel=${encodeURIComponent(examLabel)}`);
  }

  return (
    <>
      <div className="page-header">
        <h1>{user ? `Welcome back, ${user.displayName ?? "student"}` : "SarkariTaiyaari"}</h1>
        <p className="subtle">Practice questions, take mock tests and track your preparation.</p>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => setReloadToken((t) => t + 1)} />}

      {!error && (
        <>
          <div className="section-heading">
            <h2>Explore exams</h2>
          </div>

          {exams === null && <LoadingState rows={4} label="Loading active exams" />}

          {exams !== null && exams.length === 0 && (
            <EmptyState icon={<InboxIcon />} message="No active exams yet." />
          )}

          {exams !== null && exams.length > 0 && (
            <div className="exam-grid">
              {exams.map((exam) => (
                <ExamCard
                  key={exam.code}
                  identityKey={exam.code}
                  imageUrl={exam.imageUrl}
                  name={exam.name}
                  subtitle={exam.code}
                  onClick={() => openExam(exam.code, exam.name)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!user && !error && (
        <div className="notice" style={{ marginTop: "var(--space-lg)" }}>
          <span>Sign in from Account to track your practice history and mock test scores across devices.</span>
        </div>
      )}

      <div className="notice" style={{ marginTop: "var(--space-md)" }}>
        <span>Progress and the Exam Guide are still being built. Practice and Mock Test are ready above.</span>
      </div>
    </>
  );
}
