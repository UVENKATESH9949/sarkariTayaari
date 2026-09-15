import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InboxIcon } from "../components/icons";
import { ExamCard } from "../components/ExamCard";
import { Badge } from "../components/Badge";
import { LoadingState } from "../components/LoadingState";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ALL_EXAMS, getExamBadges, getDifficultyLevels, getPracticeExams, type ExamBadge, type DifficultyLevel, type ExamOption } from "./practiceApi";

/**
 * Practice's entry point: pick an exam (or browse across all of them) to drill into its
 * subjects. Search is client-side over the fetched list — the catalogue is small (a dozen
 * active exams), so a second request per keystroke would buy nothing.
 */
export default function PracticeExams() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<ExamOption[] | null>(null);
  const [badges, setBadges] = useState<ExamBadge[]>([]);
  const [levels, setLevels] = useState<DifficultyLevel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPracticeExams(), getExamBadges(), getDifficultyLevels()])
      .then(([e, b, l]) => {
        if (cancelled) return;
        setExams(e);
        setBadges(b);
        setLevels(l);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load exams.");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const badgeByCode = new Map(badges.map((b) => [b.code, b]));
  const levelByCode = new Map(levels.map((l) => [l.code, l]));
  const filtered = exams?.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())) ?? null;

  function openExam(examCode: string, examLabel: string) {
    navigate(`/practice/subjects?examCode=${encodeURIComponent(examCode)}&examLabel=${encodeURIComponent(examLabel)}`);
  }

  return (
    <>
      <div className="page-header">
        <h1>Practice</h1>
        <p className="subtle">Pick an exam to start drilling into its subjects and topics.</p>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => setReloadToken((t) => t + 1)} />}

      {!error && (
        <>
          <input
            className="field-input"
            style={{ marginBottom: "var(--space-lg)" }}
            placeholder="Search exams…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search exams"
          />

          {filtered === null && <LoadingState rows={6} label="Loading exams" />}

          {filtered !== null && filtered.length === 0 && (
            <EmptyState icon={<InboxIcon />} message={`No exams match "${query}".`} />
          )}

          {filtered !== null && (
            <div className="exam-grid">
              <ExamCard
                variant="all"
                name="All Government Exams"
                subtitle="Practice across every exam's question bank"
                onClick={() => openExam(ALL_EXAMS, "All Government Exams")}
              />

              {filtered.map((exam) => {
                const badge = exam.badge ? badgeByCode.get(exam.badge) : undefined;
                const level = exam.difficulty ? levelByCode.get(exam.difficulty) : undefined;
                return (
                  <ExamCard
                    key={exam.code}
                    identityKey={exam.code}
                    imageUrl={exam.imageUrl}
                    name={exam.name}
                    subtitle={`${exam.questionCount} questions`}
                    onClick={() => openExam(exam.code, exam.name)}
                    pills={
                      (badge || level) && (
                        <>
                          {badge && (
                            <Badge color={badge.color} background={badge.colorBg}>
                              {badge.label}
                            </Badge>
                          )}
                          {level && (
                            <Badge color={level.color} background={level.colorBg}>
                              {level.label}
                            </Badge>
                          )}
                        </>
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
