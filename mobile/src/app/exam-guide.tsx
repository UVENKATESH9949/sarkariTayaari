import { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Linking, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setDocumentStatus, getChangesFromPrevious, getPreparePlan, type CycleComparison, type DocumentSummary, type ExamGuide, type PreparePlan, type SourceSummary } from "../api/examGuide";
import { cancelReminder, createReminder, listReminders, type Reminder } from "../api/reminders";
import { getExamGuideHybrid } from "../data/examGuideData";
import { getSyncedExams, getDifficultyLevels, getExamBadges, type ExamOption, type DifficultyLevel, type ExamBadge } from "../data/practiceData";
import { useHybridMode } from "../data/hybridSource";
import { loadSession } from "../db/authSession";
import { followExam, unfollowExam, isExamFollowed } from "../db/followedExams";
import { getMockAttemptSummary, type MockAttemptSummary } from "../db/mockTest";
import { useSessionHistory } from "../practice/sessionHistory";
import { daysUntil, formatDate, priorityTier } from "../examGuide/dates";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { SectionLabel } from "../ui/SectionLabel";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { ContextualLoading } from "../ui/ContextualLoading";
import { CardSkeleton } from "../ui/Skeleton";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { useT } from "../i18n/I18nContext";
import { trackEvent } from "../telemetry/analytics";

function statusLabel(status: string): string {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const DOCUMENT_STATUS_CYCLE: Record<string, string> = {
  MISSING: "READY",
  READY: "NOT_APPLICABLE",
  NOT_APPLICABLE: "MISSING",
};

/**
 * The Exam Guide landing page (spec §5) for one exam's current recruitment cycle.
 * Reached by tapping the exam card on Home. Renders nothing that isn't in the API
 * response — no client-side guessing at eligibility, dates or fees, per the spec's own
 * §55 "source trust" requirement.
 */
export default function ExamGuideScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { examCode, examName } = useLocalSearchParams<{ examCode: string; examName?: string }>();
  const mode = useHybridMode();

  const [guide, setGuide] = useState<ExamGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [savingDocId, setSavingDocId] = useState<string | null>(null);
  // Difficulty/badge live on the plain `exams` reference row, already synced locally for
  // every other screen that shows an exam list (Practice, Mock Test) — reading it here
  // costs nothing extra and doesn't conflict with this screen's own live-fetch-only
  // Exam Guide content, which is a separate, new data source.
  const [difficultyLevels, setDifficultyLevels] = useState<DifficultyLevel[]>([]);
  const [examBadges, setExamBadges] = useState<ExamBadge[]>([]);
  const [examOption, setExamOption] = useState<ExamOption | null>(null);
  const [followed, setFollowed] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [mockSummary, setMockSummary] = useState<MockAttemptSummary | null>(null);
  const { sessions } = useSessionHistory();
  // §30 "What's Changed This Year" — fetched lazily, only once the user taps to see it.
  const [changes, setChanges] = useState<CycleComparison | null>(null);
  const [changesLoading, setChangesLoading] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  // §22 "Personalized Preparation Roadmap" — live-only, not part of the §44 offline cache:
  // it's per-user (mastery state) and would need the server's ranking/prerequisite logic
  // duplicated client-side to cache properly, which isn't worth it for a "what's next"
  // list that's cheap to refetch.
  const [preparePlan, setPreparePlan] = useState<PreparePlan | null>(null);
  // §8 "Reminder System" — keyed by importantDateId so each date row can show its own
  // set/unset state without a lookup on every render.
  const [reminders, setReminders] = useState<Reminder[]>([]);

  /**
   * Fetches the guide without any synchronous setState of its own — every state update
   * here happens inside a promise callback, never directly in the function body. That is
   * what lets the mount effect below call this directly as its body: a `setState` call
   * synchronous WITHIN an effect risks a cascading extra render, which is what the
   * separate `retry` handler is for instead (an event handler, not an effect, so setting
   * loading/error there before calling this is fine).
   */
  const fetchGuide = useCallback(() => {
    if (!examCode) return Promise.resolve();
    return Promise.all([loadSession(), getExamGuideHybrid(examCode, mode)])
      .then(([session, result]) => {
        setToken(session?.token ?? null);
        setGuide(result);
      })
      .catch((err) => setError(err.message ?? String(err)))
      .finally(() => setLoading(false));
  }, [examCode, mode]);

  useEffect(() => {
    fetchGuide();
  }, [fetchGuide]);

  // Fired once the guide actually has content, not on every mount/retry — matches the
  // spec's own event name (§56) and gives it the exam code, which the generic
  // screen_view breadcrumb (path-only) can't distinguish.
  useEffect(() => {
    if (guide) trackEvent("exam_guide_opened", { examCode: guide.examCode, demo: guide.demo });
  }, [guide]);

  // Separate effect, separate data source: this reads the app's ordinary synced exam
  // list, not the new live-fetch Exam Guide API, so a failure here (offline, say) must
  // not block the guide content from rendering.
  useEffect(() => {
    if (!examCode) return;
    Promise.all([getSyncedExams(mode), getDifficultyLevels(mode), getExamBadges(mode)])
      .then(([exams, levels, badges]) => {
        setExamOption(exams.find((e) => e.code === examCode) ?? null);
        setDifficultyLevels(levels);
        setExamBadges(badges);
      })
      .catch(() => {
        // Silently degraded: the difficulty/badge pills just don't render.
      });
  }, [examCode, mode]);

  // "Add to My Exams" (spec §5/§50) — reads/writes the same `followed_exams` rows
  // my-exams.tsx does, so following here shows up there and vice versa.
  useEffect(() => {
    if (!examCode) return;
    isExamFollowed(examCode).then(setFollowed);
  }, [examCode]);

  useEffect(() => {
    if (!examCode) return;
    getMockAttemptSummary(examCode)
      .then(setMockSummary)
      .catch(() => setMockSummary(null));
  }, [examCode]);

  useEffect(() => {
    if (!examCode) return;
    getPreparePlan(examCode, token)
      .then(setPreparePlan)
      .catch(() => setPreparePlan(null));
  }, [examCode, token]);

  const loadReminders = useCallback(() => {
    if (!token) return;
    listReminders(token)
      .then(setReminders)
      .catch(() => setReminders([]));
  }, [token]);

  useEffect(loadReminders, [loadReminders]);

  function handleSetReminder(dateId: string, title: string, startDate: string) {
    if (!token) return;
    const target = new Date(startDate);
    const leadOptions: { label: string; days: number }[] = [
      { label: "On the day", days: 0 },
      { label: "1 day before", days: 1 },
      { label: "3 days before", days: 3 },
    ];
    Alert.alert(
      "Set a reminder",
      title,
      [
        ...leadOptions.map((opt) => ({
          text: opt.label,
          onPress: () => {
            const remindAt = new Date(target.getTime() - opt.days * 24 * 60 * 60 * 1000);
            createReminder(
              {
                examCode: guide!.examCode,
                importantDateId: dateId,
                remindAt: remindAt.toISOString(),
                message: `${guide!.examName}: ${title}`,
              },
              token,
            )
              .then(loadReminders)
              .catch(() => {});
          },
        })),
        { text: "Cancel", style: "cancel" },
      ],
    );
  }

  function handleCancelReminder(dateId: string) {
    if (!token) return;
    const reminder = reminders.find((r) => r.importantDateId === dateId);
    if (!reminder) return;
    cancelReminder(reminder.id, token).then(loadReminders).catch(() => {});
  }

  function toggleChanges() {
    if (changesOpen) {
      setChangesOpen(false);
      return;
    }
    setChangesOpen(true);
    if (changes || changesLoading || !guide) return;
    setChangesLoading(true);
    getChangesFromPrevious(guide.examCode, guide.recruitmentCycleId)
      .then(setChanges)
      .catch(() => setChanges({ hasPrevious: false, previousCycleName: null, changes: [] }))
      .finally(() => setChangesLoading(false));
  }

  async function toggleFollow() {
    if (!examCode || followPending) return;
    setFollowPending(true);
    try {
      if (followed) {
        await unfollowExam(examCode);
        trackEvent("exam_unfollowed", { examCode });
      } else {
        await followExam(examCode);
        trackEvent("exam_followed", { examCode });
      }
      setFollowed(!followed);
    } finally {
      setFollowPending(false);
    }
  }

  // §64 "Integration with existing Progress" — this exam's slice of practice history,
  // already loaded app-wide by SessionHistoryProvider; no new query needed. Capped at
  // the same 50 most-recent sessions every other reader of this hook sees.
  const practiceAccuracy = useMemo(() => {
    const forExam = sessions.filter((s) => s.examCode === examCode);
    if (forExam.length === 0) return null;
    const totalCorrect = forExam.reduce((sum, s) => sum + s.correctCount, 0);
    const totalAnswered = forExam.reduce((sum, s) => sum + s.totalCount, 0);
    return { sessionCount: forExam.length, accuracyPercent: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : null };
  }, [sessions, examCode]);

  const difficultyInfo = useMemo(
    () => (examOption?.difficulty ? difficultyLevels.find((d) => d.code === examOption.difficulty) ?? null : null),
    [examOption, difficultyLevels],
  );
  const badgeInfo = useMemo(
    () => (examOption?.badge ? examBadges.find((b) => b.code === examOption.badge) ?? null : null),
    [examOption, examBadges],
  );

  const sourceById = useMemo(() => {
    const map = new Map<string, SourceSummary>();
    guide?.sources.forEach((s) => map.set(s.id, s));
    return map;
  }, [guide]);

  function sourceNote(sourceId: string | null): SourceSummary | null {
    return sourceId ? sourceById.get(sourceId) ?? null : null;
  }

  /** The first cited source across a section's rows — sections in practice cite one
   * source consistently, so a single attribution line per section is the useful grain,
   * not one per row. */
  function sectionSource(items: { sourceId: string | null }[]): SourceSummary | null {
    const found = items.find((item) => item.sourceId)?.sourceId ?? null;
    return sourceNote(found);
  }

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchGuide();
  }, [fetchGuide]);

  const applicationCloseCountdown = useMemo(
    () => (guide ? daysUntil(guide.applicationEnd) : null),
    [guide],
  );

  // Q1 "How does this fit my personal plan?" — same urgency signal My Exams' recommendation
  // heuristic already scores on (an application closing within ~45 days), surfaced here in
  // prose rather than only reachable from a different screen.
  const planFitNote = useMemo(() => {
    if (applicationCloseCountdown !== null && applicationCloseCountdown >= 0 && applicationCloseCountdown <= 45) {
      return "This exam's application deadline is coming up soon — it's worth prioritising over exams with more time left.";
    }
    if (practiceAccuracy) {
      return "You already have practice history here — keep building on it.";
    }
    return null;
  }, [applicationCloseCountdown, practiceAccuracy]);

  async function cycleDocumentStatus(doc: DocumentSummary) {
    if (!token) return;
    const next = DOCUMENT_STATUS_CYCLE[doc.userStatus ?? "MISSING"];
    if (next === "READY") trackEvent("document_marked_ready", { examCode, documentId: doc.id });
    setSavingDocId(doc.id);
    // Optimistic: the write is a single boolean-ish field with no validation that can
    // fail server-side except the network itself, so there is nothing meaningful to
    // roll back to that the user would understand better than just trying again.
    setGuide((prev) =>
      prev
        ? { ...prev, documents: prev.documents.map((d) => (d.id === doc.id ? { ...d, userStatus: next } : d)) }
        : prev,
    );
    try {
      await setDocumentStatus(doc.id, next, token);
    } catch {
      fetchGuide();
    } finally {
      setSavingDocId(null);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.xl }]}>
        <ContextualLoading message={t("quiz.loading")} skeleton={<CardSkeleton height={140} />} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top + spacing.xl }]}>
        <ErrorState title={t("common.tryAgain")} body={error} onRetry={retry} />
      </View>
    );
  }

  if (!guide) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top + spacing.xl }]}>
        <EmptyState
          icon="document-text-outline"
          title="Exam Guide not available yet"
          body={`${examName ?? examCode} doesn't have a recruitment cycle configured yet. Check back once one is published.`}
        />
      </View>
    );
  }

  const relaxationEntries = Object.entries(guide.eligibility?.categoryRelaxation ?? {});

  return (
    <>
      <Stack.Screen options={{ title: guide.examName }} />
      <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.base }]}>
        {/* Demo content is never hidden — spec's own requirement, and the reason `demo`
            is a persistent column rather than a one-time seeding note. */}
        {guide.demo && (
          <View style={styles.demoBanner}>
            <Ionicons name="flask-outline" size={14} color={colors.semantic.warning} />
            <Text style={styles.demoBannerText}>
              Demo content — not backed by a real notification. Replace it in the admin console.
            </Text>
          </View>
        )}

        <View style={styles.examNameRow}>
          <Text style={[styles.examName, styles.examNameFlex]}>{guide.examName}</Text>
        </View>
        <View style={styles.statusRow}>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{statusLabel(guide.status)}</Text>
          </View>
          {/* Difficulty/badge come from the exam's own reference row (V11), already synced
              for every other screen — reused here, not re-modelled per cycle. */}
          {difficultyInfo && (
            <View style={[styles.tonePill, { backgroundColor: difficultyInfo.colorBg ?? colors.surfaceElevated2 }]}>
              <Text style={[styles.tonePillText, { color: difficultyInfo.color ?? colors.text.secondary }]}>
                {difficultyInfo.label}
              </Text>
            </View>
          )}
          {badgeInfo && (
            <View style={[styles.tonePill, { backgroundColor: badgeInfo.colorBg ?? colors.surfaceElevated2 }]}>
              <Text style={[styles.tonePillText, { color: badgeInfo.color ?? colors.text.secondary }]}>
                {badgeInfo.label}
              </Text>
            </View>
          )}
          {applicationCloseCountdown !== null && applicationCloseCountdown >= 0 && (
            <Text style={[styles.countdownText, { color: priorityTier(applicationCloseCountdown, colors).color }]}>
              {priorityTier(applicationCloseCountdown, colors).label} · Application closes in{" "}
              {applicationCloseCountdown} day{applicationCloseCountdown === 1 ? "" : "s"}
            </Text>
          )}
        </View>

        {/* Exam Guide spec §31 "Notification Simplifier" — this whole screen already is a
            plain-language summary of the official notification; the gap was that it never
            said so. One line, not a rewrite. */}
        <Text style={styles.simplifierNote}>
          A plain-language summary of the official notification — always verify critical
          details against the source itself before applying.
        </Text>

        {guide.overviewText && <Text style={styles.overviewText}>{guide.overviewText}</Text>}

        <View style={styles.quickFactsGrid}>
          {guide.eligibility?.qualification && (
            <QuickFact icon="school-outline" label="Qualification" value={guide.eligibility.qualification} />
          )}
          {(guide.eligibility?.minimumAge || guide.eligibility?.maximumAge) && (
            <QuickFact
              icon="calendar-outline"
              label="Age"
              value={`${guide.eligibility?.minimumAge ?? "—"}–${guide.eligibility?.maximumAge ?? "—"} years*`}
            />
          )}
          {guide.vacancyCount !== null && (
            <QuickFact icon="people-outline" label="Vacancies" value={String(guide.vacancyCount)} />
          )}
          {guide.fees.length > 0 && (
            <QuickFact
              icon="cash-outline"
              label="Fee (General)"
              value={
                guide.fees.find((f) => f.category === "GENERAL")?.exempted
                  ? "Exempted"
                  : `₹${guide.fees.find((f) => f.category === "GENERAL")?.amountRupees ?? "—"}`
              }
            />
          )}
        </View>

        {(practiceAccuracy || mockSummary) && (
          <>
            <SectionLabel label="Your Progress" style={styles.sectionSpacing} />
            <Card variant="container" style={styles.card}>
              {practiceAccuracy && (
                <View style={[styles.progressRow]}>
                  <Ionicons name="book-outline" size={18} color={colors.brand.light} />
                  <View style={styles.docInfo}>
                    <Text style={styles.dateTitle}>
                      Practice accuracy{practiceAccuracy.accuracyPercent !== null ? `: ${practiceAccuracy.accuracyPercent}%` : ""}
                    </Text>
                    <Text style={styles.dateValue}>
                      From {practiceAccuracy.sessionCount} recent session{practiceAccuracy.sessionCount === 1 ? "" : "s"}
                    </Text>
                  </View>
                </View>
              )}
              {mockSummary && (
                <View style={[styles.progressRow, practiceAccuracy && styles.dateRowBorder]}>
                  <Ionicons name="timer-outline" size={18} color={colors.brand.light} />
                  <View style={styles.docInfo}>
                    <Text style={styles.dateTitle}>{mockSummary.attempted} mock test{mockSummary.attempted === 1 ? "" : "s"} attempted</Text>
                    <Text style={styles.dateValue}>Best score: {mockSummary.bestScore}</Text>
                  </View>
                </View>
              )}
            </Card>
          </>
        )}

        {/* Q1 "How does this fit my personal plan?" — reuses the same deadline-urgency
            signal My Exams' recommendation heuristic scores on, surfaced here in prose
            instead of only as a score on a different screen. Deliberately outside the
            Your Progress gate above: the deadline branch applies even with no practice
            history yet. */}
        {planFitNote && <Text style={styles.planFitText}>{planFitNote}</Text>}

        {/* Doc 1 §20/§23/§24: "Where do I start?" — links out to Practice/Mock Test, which
            already exist app-wide; this screen does not re-implement them, just points at
            them with this exam pre-selected. */}
        <SectionLabel label="Prepare" style={styles.sectionSpacing} />
        <View style={styles.prepareRow}>
          <Pressable
            style={styles.prepareCard}
            accessibilityRole="button"
            accessibilityLabel="Syllabus and Trends"
            onPress={() => router.push({ pathname: "/syllabus-trends", params: { examCode: guide.examCode, examName: guide.examName } })}
          >
            <Ionicons name="book-outline" size={20} color={colors.brand.light} />
            <Text style={styles.prepareCardText}>Syllabus &amp; Trends</Text>
          </Pressable>
          <Pressable
            style={styles.prepareCard}
            accessibilityRole="button"
            accessibilityLabel="Mock Tests"
            onPress={() => router.push({ pathname: "/mock-test/papers", params: { examCode: guide.examCode, examLabel: guide.examName } })}
          >
            <Ionicons name="timer-outline" size={20} color={colors.brand.light} />
            <Text style={styles.prepareCardText}>Mock Tests</Text>
          </Pressable>
        </View>
        {/* Q1 "What has appeared in previous years?" — the data already exists (Epic L's
            PYQ tagging, shown as an "Asked in <year> · Shift <n>" badge inside the quiz
            itself) but wasn't linked from here. Pointing at Syllabus & Trends above
            rather than building a separate PYQ browser, which doesn't exist. */}
        <Text style={styles.prepareHint}>
          Questions tagged with the year they actually appeared show an &quot;Asked in...&quot;
          badge inside Syllabus &amp; Trends.
        </Text>

        <Pressable
          style={styles.diagnosticCard}
          accessibilityRole="button"
          accessibilityLabel="Take a diagnostic test"
          onPress={() => router.push({ pathname: "/diagnostic-test", params: { examCode: guide.examCode, examName: guide.examName } })}
        >
          <Ionicons name="analytics-outline" size={20} color={colors.brand.light} />
          <View style={{ flex: 1 }}>
            <Text style={styles.prepareCardText}>Take a Diagnostic Test</Text>
            <Text style={styles.dateValue}>A quick, mixed-topic set to see where you stand</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
        </Pressable>

        {preparePlan && preparePlan.topics.length > 0 && (
          <Card variant="container" style={[styles.card, styles.prepareChecklist]}>
            {preparePlan.topics.slice(0, 5).map((item, i) => {
              const mastered = item.masteryState === "MASTERED";
              const icon =
                mastered ? "checkmark-circle"
                : item.masteryState === "NEEDS_REVISION" ? "refresh-circle-outline"
                : item.masteryState === "PRACTICING" ? "trending-up-outline"
                : item.masteryState === "LEARNING" ? "book-outline"
                : "ellipse-outline";
              const iconColor = mastered
                ? colors.semantic.success
                : item.masteryState === "NEEDS_REVISION"
                  ? colors.semantic.warning
                  : colors.text.muted;
              return (
                <Pressable
                  key={item.topicId}
                  style={[styles.prepareChecklistRow, i > 0 && styles.dateRowBorder]}
                  disabled={!item.prerequisitesMet}
                  onPress={() =>
                    router.push({
                      pathname: "/practice/levels",
                      params: {
                        examCode: guide.examCode,
                        examLabel: guide.examName,
                        subjectName: item.subjectName,
                        topicId: item.topicId,
                        topicName: item.topicName,
                      },
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${item.topicName}, ${item.subjectName}${item.recommended ? ", recommended next" : ""}`}
                >
                  <Ionicons name={icon} size={18} color={iconColor} />
                  <View style={styles.docInfo}>
                    <View style={styles.dateTitleRow}>
                      <Text style={styles.dateTitle}>{item.topicName}</Text>
                      {item.recommended && (
                        <View style={[styles.dateTierPill, { backgroundColor: colors.brand.glowSoft }]}>
                          <Text style={[styles.dateTierPillText, { color: colors.brand.light }]}>Next up</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.dateValue}>
                      {item.subjectName}
                      {!item.prerequisitesMet ? " · Complete prerequisites first" : ""}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </Card>
        )}

        {guide.importantDates.length > 0 && (
          <>
            <SectionLabel label="Important Dates" style={styles.sectionSpacing} />
            <Card variant="container" style={styles.card}>
              {guide.importantDates.map((d, i) => (
                <View key={d.id} style={[styles.dateRow, i > 0 && styles.dateRowBorder]}>
                  <View style={styles.dateDot} />
                  <View style={styles.dateInfo}>
                    <View style={styles.dateTitleRow}>
                      <Text style={styles.dateTitle}>{d.title}</Text>
                      {(() => {
                        const remaining = daysUntil(d.startDate);
                        if (remaining === null || remaining < 0) return null;
                        const tier = priorityTier(remaining, colors);
                        return (
                          <View style={[styles.dateTierPill, { backgroundColor: tier.color + "22" }]}>
                            <Text style={[styles.dateTierPillText, { color: tier.color }]}>{tier.label}</Text>
                          </View>
                        );
                      })()}
                    </View>
                    <Text style={styles.dateValue}>
                      {formatDate(d.startDate)}
                      {d.endDate ? ` – ${formatDate(d.endDate)}` : ""}
                      {!d.official ? " · Expected" : ""}
                    </Text>
                  </View>
                  {token && d.startDate && (
                    (() => {
                      const hasReminder = reminders.some((r) => r.importantDateId === d.id);
                      return (
                        <Pressable
                          style={styles.reminderButton}
                          onPress={() => (hasReminder ? handleCancelReminder(d.id) : handleSetReminder(d.id, d.title, d.startDate!))}
                          accessibilityRole="button"
                          accessibilityLabel={hasReminder ? `Cancel reminder for ${d.title}` : `Set reminder for ${d.title}`}
                        >
                          <Ionicons
                            name={hasReminder ? "notifications" : "notifications-outline"}
                            size={18}
                            color={hasReminder ? colors.brand.light : colors.text.muted}
                          />
                        </Pressable>
                      );
                    })()
                  )}
                </View>
              ))}
            </Card>
            <SourceLine source={sectionSource(guide.importantDates)} />
          </>
        )}

        {guide.eligibility && (
          <>
            <SectionLabel label="Eligibility" style={styles.sectionSpacing} />
            <Card variant="container" style={styles.card}>
              {guide.eligibility.nationality && <InfoRow label="Nationality" value={guide.eligibility.nationality} />}
              {guide.eligibility.genderRequirement && <InfoRow label="Gender" value={guide.eligibility.genderRequirement} />}
              {relaxationEntries.length > 0 && (
                <InfoRow
                  label="Age relaxation"
                  value={relaxationEntries.map(([cat, years]) => `${cat} +${years}y`).join(", ")}
                />
              )}
              {guide.eligibility.specialRequirements && (
                <Text style={styles.disclaimerText}>{guide.eligibility.specialRequirements}</Text>
              )}
            </Card>
            <Text style={styles.disclaimerText}>
              This is informational guidance based on the current recruitment cycle. Final eligibility is
              determined by the official recruiting authority.
            </Text>
            <SourceLine source={sourceNote(guide.eligibility.sourceId)} />
            <Pressable
              style={styles.checkerButton}
              accessibilityRole="button"
              accessibilityLabel="Check my eligibility"
              onPress={() => router.push({ pathname: "/eligibility-checker", params: { examCode: guide.examCode, examName: guide.examName } })}
            >
              <Ionicons name="checkmark-done-outline" size={16} color={colors.brand.light} />
              <Text style={styles.checkerButtonText}>Check My Eligibility</Text>
            </Pressable>
          </>
        )}

        {guide.documents.length > 0 && (
          <>
            <SectionLabel
              label="Documents"
              count={
                token
                  ? `${guide.documents.filter((d) => d.userStatus === "READY").length}/${guide.documents.length} ready`
                  : undefined
              }
              style={styles.sectionSpacing}
            />
            <Card variant="container" style={styles.card}>
              {guide.documents.map((doc, i) => (
                <Pressable
                  key={doc.id}
                  disabled={!token || savingDocId === doc.id}
                  onPress={() => cycleDocumentStatus(doc)}
                  style={[styles.docRow, i > 0 && styles.dateRowBorder]}
                  accessibilityRole="button"
                  accessibilityLabel={`${doc.documentName}, currently ${doc.userStatus ?? "missing"}`}
                  accessibilityHint="Tap to change status"
                >
                  <Ionicons
                    name={
                      doc.userStatus === "READY"
                        ? "checkmark-circle"
                        : doc.userStatus === "NOT_APPLICABLE"
                          ? "remove-circle-outline"
                          : "ellipse-outline"
                    }
                    size={20}
                    color={
                      doc.userStatus === "READY"
                        ? colors.semantic.success
                        : doc.userStatus === "NOT_APPLICABLE"
                          ? colors.text.muted
                          : colors.text.secondary
                    }
                  />
                  <View style={styles.docInfo}>
                    <Text style={styles.dateTitle}>
                      {doc.documentName}
                      {doc.required === "IF_APPLICABLE" ? " (if applicable)" : ""}
                    </Text>
                    {(doc.format || doc.dimensions) && (
                      <Text style={styles.dateValue}>{[doc.format, doc.dimensions].filter(Boolean).join(" · ")}</Text>
                    )}
                  </View>
                </Pressable>
              ))}
              {!token && (
                <Text style={styles.disclaimerText}>Sign in to track which documents you have ready.</Text>
              )}
            </Card>
            <SourceLine source={sectionSource(guide.documents)} />
          </>
        )}

        {guide.applicationSteps.length > 0 && (
          <>
            <SectionLabel label="How to Apply" style={styles.sectionSpacing} />
            <Card variant="container" style={styles.card}>
              {guide.applicationSteps.map((step, i) => (
                <View key={step.stepNumber} style={[styles.stepRow, i > 0 && styles.dateRowBorder]}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{step.stepNumber}</Text>
                  </View>
                  <View style={styles.docInfo}>
                    <Text style={styles.dateTitle}>{step.title}</Text>
                    {step.description && <Text style={styles.dateValue}>{step.description}</Text>}
                    {step.warning && <Text style={styles.stepWarning}>⚠ {step.warning}</Text>}
                    {step.officialUrl && (
                      <Pressable onPress={() => Linking.openURL(step.officialUrl!)} style={styles.stepLink} accessibilityRole="link" accessibilityLabel="Official page for this step">
                        <Text style={styles.stepLinkText}>Official page</Text>
                        <Ionicons name="open-outline" size={11} color={colors.brand.light} />
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </Card>
          </>
        )}

        {guide.applicationMistakes.length > 0 && (
          <>
            <SectionLabel label="Common Mistakes to Avoid" style={styles.sectionSpacing} />
            <Card variant="container" style={styles.card}>
              {guide.applicationMistakes.map((mistake, i) => (
                <View key={i} style={[styles.mistakeRow, i > 0 && styles.dateRowBorder]}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.semantic.error} />
                  <Text style={styles.dateValue}>{mistake}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {guide.fees.length > 0 && (
          <>
            <SectionLabel label="Application Fee" style={styles.sectionSpacing} />
            <Card variant="container" style={styles.card}>
              {guide.fees.map((fee, i) => (
                <View key={fee.category} style={[styles.feeRow, i > 0 && styles.dateRowBorder]}>
                  <Text style={styles.dateTitle}>{statusLabel(fee.category)}</Text>
                  <Text style={styles.dateValue}>{fee.exempted ? "Exempted" : `₹${fee.amountRupees}`}</Text>
                </View>
              ))}
            </Card>
            <SourceLine source={sectionSource(guide.fees)} />
          </>
        )}

        {guide.careerPosts.length > 0 && (
          <>
            <SectionLabel label="Career &amp; Growth" style={styles.sectionSpacing} />
            <Card variant="container" style={styles.card}>
              {guide.careerPosts.map((post, i) => (
                <View key={post.id} style={[styles.careerPostRow, i > 0 && styles.dateRowBorder]}>
                  <Text style={styles.dateTitle}>{post.postTitle}</Text>
                  {(post.payLevel || post.salaryMinRupees || post.salaryMaxRupees) && (
                    <Text style={styles.dateValue}>
                      {post.payLevel}
                      {post.payLevel && (post.salaryMinRupees || post.salaryMaxRupees) ? " · " : ""}
                      {(post.salaryMinRupees || post.salaryMaxRupees)
                        ? `₹${post.salaryMinRupees ?? "—"} - ₹${post.salaryMaxRupees ?? "—"} /month`
                        : ""}
                    </Text>
                  )}
                  {post.description && <Text style={styles.careerPostText}>{post.description}</Text>}
                  {post.growthPath && (
                    <View style={styles.growthPathBox}>
                      <Ionicons name="trending-up-outline" size={14} color={colors.brand.light} />
                      <Text style={styles.careerPostText}>{post.growthPath}</Text>
                    </View>
                  )}
                </View>
              ))}
            </Card>
            <SourceLine source={sectionSource(guide.careerPosts)} />
          </>
        )}

        <Pressable
          style={styles.historyLink}
          accessibilityRole="button"
          accessibilityLabel="View notification history"
          onPress={() => router.push({ pathname: "/exam-guide-history", params: { examCode: guide.examCode, examName: guide.examName } })}
        >
          <Ionicons name="time-outline" size={14} color={colors.text.muted} />
          <Text style={styles.historyLinkText}>Notification history</Text>
        </Pressable>

        <Pressable
          style={styles.historyLink}
          accessibilityRole="button"
          accessibilityLabel={changesOpen ? "Hide what's changed this cycle" : "Show what's changed this cycle"}
          onPress={toggleChanges}
        >
          <Ionicons name="git-compare-outline" size={14} color={colors.text.muted} />
          <Text style={styles.historyLinkText}>What&apos;s changed this cycle</Text>
          <Ionicons name={changesOpen ? "chevron-up" : "chevron-down"} size={12} color={colors.text.muted} />
        </Pressable>

        {changesOpen && (
          <Card variant="container" style={[styles.card, styles.changesCard]}>
            {changesLoading && <Text style={styles.dateValue}>Comparing with the previous cycle...</Text>}
            {!changesLoading && changes && !changes.hasPrevious && (
              <Text style={styles.dateValue}>No earlier cycle to compare against yet.</Text>
            )}
            {!changesLoading && changes && changes.hasPrevious && changes.changes.length === 0 && (
              <Text style={styles.dateValue}>Nothing has changed since {changes.previousCycleName}.</Text>
            )}
            {!changesLoading && changes && changes.hasPrevious && changes.changes.length > 0 && (
              <>
                <Text style={styles.dateValue}>Compared with {changes.previousCycleName}:</Text>
                {changes.changes.map((c, i) => (
                  <View key={c.field} style={[styles.changeRow, i > 0 && styles.dateRowBorder]}>
                    <Text style={styles.dateTitle}>{c.field}</Text>
                    <Text style={styles.dateValue}>
                      {c.previousValue ?? "—"} → {c.currentValue ?? "—"}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </Card>
        )}

        {guide.lastVerifiedAt && (
          <Text style={styles.lastVerifiedText}>Last verified: {formatDate(guide.lastVerifiedAt)}</Text>
        )}
      </ScrollView>

      {/* Footer module (spec §40) — the same persistent bottom action bar pattern
          practice/quiz.tsx and mock-test/test.tsx use: a flex sibling after the
          ScrollView, always rendered so the layout never jumps. The two actions mirror a
          familiar "Save / Apply" job-listing bar: Follow is this screen's save action,
          View Official Notification is its primary forward action. Disabled (not
          hidden) when there's no notification URL yet, same convention as quiz.tsx's
          Previous/Next. */}
      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Button
            variant="secondary"
            onPress={toggleFollow}
            disabled={followPending}
            icon={followed ? "star" : "star-outline"}
            style={styles.footerSecondary}
          >
            {followed ? "Following" : "Follow"}
          </Button>
          <Button
            onPress={() => {
              trackEvent("official_application_clicked", { examCode: guide.examCode });
              Linking.openURL(guide.notificationUrl!);
            }}
            disabled={!guide.notificationUrl}
            icon="open-outline"
            style={styles.footerPrimary}
          >
            View Official Notification
          </Button>
        </View>
      </View>
      </View>
    </>
  );
}

function QuickFact({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  return (
    <View style={styles.quickFactCard}>
      <Ionicons name={icon} size={18} color={colors.brand.light} />
      <Text style={styles.quickFactValue} numberOfLines={2}>{value}</Text>
      <Text style={styles.quickFactLabel}>{label}</Text>
    </View>
  );
}

function SourceLine({ source }: { source: SourceSummary | null }) {
  const styles = useThemedStyles(buildStyles);
  const { colors } = useTheme();
  if (!source) return null;
  const label = source.sourceType === "ADMIN_ESTIMATE" ? `Estimate — ${source.sourceName}` : source.sourceName;
  const content = <Text style={styles.sourceLineText}>Source: {label}</Text>;
  if (!source.url) return <View style={styles.sourceLine}>{content}</View>;
  return (
    <Pressable style={styles.sourceLine} onPress={() => Linking.openURL(source.url!)} accessibilityRole="link" accessibilityLabel={`Source: ${label}`}>
      <Text style={[styles.sourceLineText, { color: colors.brand.light }]}>Source: {label}</Text>
      <Ionicons name="open-outline" size={11} color={colors.brand.light} />
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(buildStyles);
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const buildStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing["2xl"],
    },
    container: {
      padding: spacing.xl,
      paddingBottom: spacing["3xl"],
    },
    demoBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm - 2,
      backgroundColor: colors.semantic.warningBg,
      borderRadius: radius.md,
      padding: spacing.sm + 2,
      marginBottom: spacing.base,
    },
    demoBannerText: {
      flex: 1,
      fontSize: 12,
      fontWeight: "600",
      color: colors.semantic.warning,
    },
    examName: {
      ...typography.pageTitle,
    },
    examNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    examNameFlex: {
      flex: 1,
    },
    progressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md + 2,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginTop: spacing.sm,
      marginBottom: spacing.base,
      flexWrap: "wrap",
    },
    statusPill: {
      backgroundColor: colors.brand.glowSoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 1,
    },
    statusPillText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.brand.light,
    },
    tonePill: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 1,
    },
    tonePillText: {
      fontSize: 12,
      fontWeight: "700",
    },
    countdownText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.semantic.warning,
    },
    simplifierNote: {
      fontSize: 12,
      color: colors.text.muted,
      fontStyle: "italic",
      lineHeight: 17,
      marginBottom: spacing.base,
    },
    overviewText: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 19,
      marginBottom: spacing.base,
    },
    quickFactsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    quickFactCard: {
      flexGrow: 1,
      minWidth: "45%",
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: 4,
    },
    quickFactValue: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
    },
    quickFactLabel: {
      fontSize: 11,
      color: colors.text.muted,
    },
    checkerButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm - 2,
      marginTop: spacing.md,
      alignSelf: "flex-start",
    },
    checkerButtonText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.brand.light,
    },
    prepareRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    prepareCard: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    prepareCardText: {
      flex: 1,
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.primary,
    },
    prepareHint: {
      fontSize: 11,
      color: colors.text.muted,
      fontStyle: "italic",
      marginTop: spacing.sm - 2,
      lineHeight: 15,
    },
    planFitText: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: spacing.sm,
      lineHeight: 17,
    },
    diagnosticCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginTop: spacing.sm,
    },
    prepareChecklist: {
      marginTop: spacing.sm,
    },
    prepareChecklistRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md + 2,
    },
    sourceLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: spacing.sm - 2,
      alignSelf: "flex-start",
    },
    sourceLineText: {
      fontSize: 11,
      color: colors.text.muted,
    },
    stepLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: spacing.xs + 2,
    },
    stepLinkText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.brand.light,
    },
    sectionSpacing: {
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
    },
    card: {
      marginTop: spacing.sm,
    },
    dateRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
      padding: spacing.md + 2,
    },
    dateRowBorder: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    dateDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.brand.light,
      marginTop: 6,
    },
    reminderButton: {
      padding: spacing.xs,
    },
    dateInfo: {
      flex: 1,
    },
    dateTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm - 2,
    },
    dateTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary,
    },
    dateTierPill: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm - 1,
      paddingVertical: 1,
    },
    dateTierPillText: {
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    dateValue: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
    },
    infoRow: {
      paddingVertical: spacing.sm,
    },
    infoLabel: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.4,
      color: colors.text.muted,
      marginBottom: 2,
    },
    infoValue: {
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 20,
    },
    disclaimerText: {
      fontSize: 12,
      color: colors.text.muted,
      fontStyle: "italic",
      marginTop: spacing.sm,
      lineHeight: 17,
    },
    docRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md + 2,
    },
    docInfo: {
      flex: 1,
    },
    stepRow: {
      flexDirection: "row",
      gap: spacing.md,
      padding: spacing.md + 2,
    },
    stepNumber: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.brand.glowSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    stepNumberText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.brand.light,
    },
    stepWarning: {
      fontSize: 12,
      color: colors.semantic.warning,
      marginTop: spacing.xs,
    },
    mistakeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.md,
    },
    feeRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: spacing.md + 2,
    },
    careerPostRow: {
      padding: spacing.md + 2,
      gap: spacing.xs + 2,
    },
    careerPostText: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
    },
    growthPathBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm - 2,
      backgroundColor: colors.surfaceElevated2,
      borderRadius: radius.md,
      padding: spacing.sm + 2,
      marginTop: spacing.xs,
    },
    historyLink: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs + 2,
      marginTop: spacing.xl,
    },
    historyLinkText: {
      fontSize: 12,
      color: colors.text.muted,
    },
    changesCard: {
      padding: spacing.md + 2,
    },
    changeRow: {
      paddingVertical: spacing.sm,
    },
    lastVerifiedText: {
      fontSize: 11,
      color: colors.text.muted,
      textAlign: "center",
      marginTop: spacing.xl,
    },
    footer: {
      padding: spacing.xl,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    footerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    footerSecondary: {
      flex: 1,
    },
    footerPrimary: {
      flex: 1.4,
    },
  });
