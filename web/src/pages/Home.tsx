import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  discoverExams,
  getExamBadges,
  ApiError,
  type ExamCard as ExamCardData,
  type ExamBadgeResponse,
} from "@sarkaritaiyaari/core/api";
import { useAuth } from "../auth/AuthContext";
import { InboxIcon, PlayIcon } from "../components/icons";
import { ExamSpotlightCard } from "../components/ExamSpotlightCard";
import { LoadingState } from "../components/LoadingState";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { groupExamsByCategory, categoryGlowHex, deriveCategory, posterWatermark } from "./homeCategories";

/**
 * The dashboard — and, for now, the app's end-to-end proof.
 *
 * `GET /api/exams/discover` is public, so this renders real backend data signed out. It's
 * the same endpoint mobile's Exams tab already uses (category/image/badge/cycle data in one
 * call) — Home previously called the plainer `GET /api/exams`, which carries none of that.
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
  const [exams, setExams] = useState<ExamCardData[] | null>(null);
  const [badges, setBadges] = useState<ExamBadgeResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([discoverExams({ size: 50 }), getExamBadges()])
      .then(([discovered, badgeList]) => {
        if (cancelled) return;
        setExams(discovered.content);
        setBadges(badgeList);
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

  function startMockTest(exam: ExamCardData | null) {
    if (!exam) {
      navigate("/mock-test");
      return;
    }
    navigate(`/mock-test/papers?examCode=${encodeURIComponent(exam.examCode)}&examLabel=${encodeURIComponent(exam.examName)}`);
  }

  const badgeByCode = new Map(badges.map((b) => [b.code, b]));
  const featured = exams?.find((e) => e.badge) ?? null;
  const featuredBadge = featured?.badge ? badgeByCode.get(featured.badge) : undefined;
  const rows = exams ? groupExamsByCategory(exams) : [];

  return (
    <>
      <div className="page-header">
        <h1>{user ? `Welcome back, ${user.displayName ?? "student"}` : "SarkariTaiyaari"}</h1>
        <p className="subtle">Practice questions, take mock tests and track your preparation.</p>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => setReloadToken((t) => t + 1)} />}

      {!error && exams === null && <LoadingState rows={4} label="Loading active exams" />}

      {!error && exams !== null && exams.length === 0 && (
        <EmptyState icon={<InboxIcon />} message="No active exams yet." />
      )}

      {!error && exams !== null && exams.length > 0 && (
        <>
          <section className="home-hero">
            <div className="home-hero-content">
              <span className="home-hero-eyebrow">
                <span className="home-hero-eyebrow-dot" aria-hidden="true" />
                {featured ? `${featuredBadge?.label ?? "Featured"} · ${deriveCategory(featured)}` : "Start here"}
              </span>
              <h2 className="home-hero-title">{featured ? featured.examName : "Prepare with confidence"}</h2>
              <p className="home-hero-subtitle">
                Full-length mock tests, topic-wise practice sets and previous year questions —
                timed exactly like the real exam.
              </p>
              <div className="row">
                <button type="button" className="btn" onClick={() => startMockTest(featured)}>
                  <PlayIcon className="home-hero-play" aria-hidden="true" />
                  Start free mock test
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => (featured ? openExam(featured.examCode, featured.examName) : navigate("/practice"))}
                >
                  View syllabus
                </button>
              </div>
            </div>
          </section>

          {rows.map(({ category, exams: rowExams }) => {
            const accentHex = categoryGlowHex(category);
            return (
              <div className="exam-row" key={category}>
                <div className="exam-row-heading">
                  <span className="exam-row-dot" style={{ background: accentHex }} aria-hidden="true" />
                  <h2>{category}</h2>
                  <span className="exam-row-count">
                    {rowExams.length} {rowExams.length === 1 ? "exam" : "exams"}
                  </span>
                </div>
                <div className="exam-row-scroll">
                  {rowExams.map((exam) => (
                    <ExamSpotlightCard
                      key={`${category}-${exam.examCode}`}
                      name={exam.examName}
                      examCode={exam.examCode}
                      imageUrl={exam.imageUrl}
                      watermark={posterWatermark(exam.examCode)}
                      subtitle={exam.vacancyCount ? `${exam.vacancyCount.toLocaleString()} vacancies` : category}
                      accentHex={accentHex}
                      onClick={() => openExam(exam.examCode, exam.examName)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          <div className="mt-md">
            <Link to="/practice" className="btn btn-secondary">
              Explore all exams
            </Link>
          </div>
        </>
      )}

      {!user && !error && (
        <div className="cta-banner mt-lg">
          <p>
            <strong>Sign in</strong> to keep your practice history and mock test scores across
            devices.
          </p>
          <Link to="/account" className="btn btn-secondary">
            Sign in
          </Link>
        </div>
      )}

      <div className="notice mt-md">
        <InboxIcon aria-hidden="true" />
        <span>Progress and the Exam Guide are still being built. Practice and Mock Test are ready above.</span>
      </div>
    </>
  );
}
