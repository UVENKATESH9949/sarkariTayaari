import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FlatList, Pressable, Text, View, StyleSheet } from "react-native";
import { getMockTestAttempt, type MockTestAttemptRecord } from "../../../db/mockTest";
import { getOrBuildMockFeedback } from "../../../ai/sessionFeedback";
import { useAppLanguage } from "../../../practice/appLanguage";
import { toSubjectMeta } from "../../../constants/subjects";
import { getAllSubjects, type SubjectMetaRow } from "../../../db/subjectMeta";
import { Button } from "../../../ui/Button";
import { ContextualLoading } from "../../../ui/ContextualLoading";
import { CardSkeleton } from "../../../ui/Skeleton";
import { spacing } from "../../../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../../../ui/ThemeContext";
import { useT } from "../../../i18n/I18nContext";
import { OptionList } from "../../../questionRenderer/OptionList";
import { MultiSelectOptionList } from "../../../questionRenderer/MultiSelectOptionList";
import { FreeTextAnswerInput } from "../../../questionRenderer/FreeTextAnswerInput";
import { describeYourAnswer } from "../../../questionRenderer/answerSummary";
import { revealPlainStyles } from "../../../questionRenderer/optionListStyles";

// Takes the palette: these are semantic colours, which differ between themes.
function scoreTone(percent: number, colors: Theme["colors"]): { text: string; bg: string } {
  if (percent >= 70) return { text: colors.semantic.success, bg: colors.semantic.successBg };
  if (percent >= 40) return { text: colors.semantic.warning, bg: colors.semantic.warningBg };
  return { text: colors.semantic.error, bg: colors.semantic.errorBg };
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

type QuestionResult = MockTestAttemptRecord["results"][number];

/**
 * `selectedIndex === correctIndex` was the whole rule before TASK-2301 Phase P2 Wave A —
 * both are always null for MULTIPLE_CHOICE/TRUE_FALSE, which would read as permanently
 * "unattempted" under that rule alone. `outcome` is the type-agnostic source of truth for
 * every result saved since Wave A; a result saved before it (no stored `outcome`) falls
 * back to the original index comparison, which is the only signal it has.
 */
function resultStatus(r: QuestionResult): "correct" | "wrong" | "unattempted" {
  if (r.outcome === "CORRECT") return "correct";
  if (r.outcome === "INCORRECT") return "wrong";
  if (r.outcome === "UNATTEMPTED") return "unattempted";
  if (r.selectedIndex === null) return "unattempted";
  return r.selectedIndex === r.correctIndex ? "correct" : "wrong";
}

/** Extracted so the FlatList's renderItem stays small — the body is unchanged. */
function QuestionResultCard({
  result: r,
  index,
  isExpanded,
  onToggle,
}: {
  result: QuestionResult;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const optionListStyles = useThemedStyles(revealPlainStyles);
  const t = useT();
  const status = resultStatus(r);
  return (
    <Pressable style={styles.card} onPress={onToggle}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons
            name={
              status === "correct" ? "checkmark-circle" : status === "wrong" ? "close-circle" : "remove-circle-outline"
            }
            size={18}
            color={status === "correct" ? colors.semantic.success : status === "wrong" ? colors.semantic.error : colors.text.muted}
          />
          <Text style={styles.cardTag}>
            {index + 1}. {r.subjectName}
          </Text>
          {r.markedForReview && <Ionicons name="bookmark" size={14} color={colors.semantic.warning} />}
        </View>
        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.text.muted} />
      </View>
      <Text style={styles.cardQuestion} numberOfLines={isExpanded ? undefined : 2}>
        {r.questionText}
      </Text>

      {isExpanded && (
        <View style={styles.expandedContent}>
          {r.questionType === "MULTIPLE_CHOICE" ? (
            <MultiSelectOptionList
              options={r.options}
              styles={optionListStyles}
              selectedIndices={
                Array.isArray(r.response?.selectedOptions)
                  ? (r.response!.selectedOptions as unknown[]).filter((v): v is number => typeof v === "number")
                  : []
              }
              iconSize={18}
            />
          ) : r.questionType === "TRUE_FALSE" ? (
            <OptionList
              options={[t("quiz.trueOption"), t("quiz.falseOption")]}
              styles={optionListStyles}
              badge="none"
              selectedIndex={typeof r.response?.selectedBoolean === "boolean" ? (r.response.selectedBoolean ? 0 : 1) : null}
              iconSize={18}
            />
          ) : r.questionType === "NUMERIC" ? (
            <FreeTextAnswerInput
              value={typeof r.response?.enteredValue === "number" ? String(r.response.enteredValue) : ""}
              disabled
            />
          ) : r.questionType === "FILL_BLANK" ? (
            <FreeTextAnswerInput
              value={typeof r.response?.enteredText === "string" ? r.response.enteredText : ""}
              disabled
            />
          ) : r.questionType === "MATCH" || r.questionType === "ORDERING" ? (
            // No per-key labels survive in a stored result snapshot — same limitation
            // documented on answerSummary.ts for MULTIPLE_CHOICE/TRUE_FALSE.
            <Text style={styles.explanationText}>
              Your Answer:{" "}
              {describeYourAnswer(r, {
                trueOption: t("quiz.trueOption"),
                falseOption: t("quiz.falseOption"),
                unattempted: t("common.unattempted"),
              })}
            </Text>
          ) : (
            <OptionList
              options={r.options}
              styles={optionListStyles}
              badge="none"
              selectedIndex={r.selectedIndex}
              correctIndex={r.correctIndex}
              iconSize={18}
            />
          )}
          <View style={styles.explanationBox}>
            <Text style={styles.explanationLabel}>{t("common.explanation")}</Text>
            <Text style={styles.explanationText}>{r.explanation}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

/**
 * TASK-2701 Phase 7.2 — the AI-phrased feedback narrative, the Mock Test twin of
 * `practice/summary.tsx`'s `SessionFeedbackNarrative`. Same keyed-on-id pattern to dodge
 * `react-hooks/set-state-in-effect`'s cascading-render violation.
 */
function MockFeedbackNarrative({ attempt }: { attempt: MockTestAttemptRecord }) {
  const styles = useThemedStyles(buildStyles);
  const { colors } = useTheme();
  const t = useT();
  const { defaultLanguageCode } = useAppLanguage();
  const [loaded, setLoaded] = useState<{ attemptId: string; narrative: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrBuildMockFeedback({ attempt, examCode: attempt.examCode, languageCode: defaultLanguageCode })
      .then((narrative) => {
        if (!cancelled) setLoaded({ attemptId: attempt.id, narrative });
      })
      .catch((err) => {
        // Additive only — a failure here must never take down a screen whose stat blocks are
        // already complete and correct without it.
        console.warn("Failed to load mock attempt feedback", err);
        if (!cancelled) setLoaded({ attemptId: attempt.id, narrative: null });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, defaultLanguageCode]);

  const narrative = loaded && loaded.attemptId === attempt.id ? loaded.narrative : null;
  if (!narrative) return null;

  return (
    <View style={styles.feedbackBox}>
      <View style={styles.feedbackHeader}>
        <Ionicons name="sparkles" size={16} color={colors.brand.primary} />
        <Text style={styles.feedbackLabel}>{t("mock.feedbackLabel")}</Text>
      </View>
      <Text style={styles.feedbackText}>{narrative}</Text>
    </View>
  );
}

export default function MockTestResult() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  // Neutral fallback for a subject an admin hasn't given an icon colour yet; the
  // constants module can't know the theme, so it comes from here.
  const subjectFallback = { iconColor: colors.text.secondary, iconBg: colors.surfaceElevated2 };
  const router = useRouter();
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const [attempt, setAttempt] = useState<MockTestAttemptRecord | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subjectStyles, setSubjectStyles] = useState<SubjectMetaRow[]>([]);

  useEffect(() => {
    if (!attemptId) return;
    getMockTestAttempt(attemptId).then(setAttempt);
  }, [attemptId]);

  useEffect(() => {
    getAllSubjects().then(setSubjectStyles).catch(() => setSubjectStyles([]));
  }, []);

  const sectionBreakdown = useMemo(() => {
    if (!attempt) return [];
    const bySubject = new Map<string, { correct: number; wrong: number; unattempted: number; total: number }>();
    for (const r of attempt.results) {
      const bucket = bySubject.get(r.subjectName) ?? { correct: 0, wrong: 0, unattempted: 0, total: 0 };
      bucket.total += 1;
      const status = resultStatus(r);
      if (status === "unattempted") bucket.unattempted += 1;
      else if (status === "correct") bucket.correct += 1;
      else bucket.wrong += 1;
      bySubject.set(r.subjectName, bucket);
    }
    return Array.from(bySubject.entries()).map(([subjectName, b]) => ({ subjectName, ...b }));
  }, [attempt]);

  if (!attempt) {
    return (
      <View style={styles.container}>
        <ContextualLoading
          message={t("mock.loadingResult")}
          skeleton={
            <>
              <CardSkeleton height={110} />
              <View style={[styles.statRow, { marginTop: spacing.base }]}>
                <CardSkeleton height={72} />
                <CardSkeleton height={72} />
                <CardSkeleton height={72} />
              </View>
            </>
          }
        />
      </View>
    );
  }

  const maxMarks = attempt.totalQuestions * attempt.marksCorrect;
  const scorePercent = maxMarks > 0 ? Math.round((attempt.totalMarksScored / maxMarks) * 100) : 0;
  const tone = scoreTone(scorePercent, colors);

  const header = (
    <>
      <View style={[styles.scoreCard, { backgroundColor: tone.bg }]}>
        <Text style={[styles.scoreValue, { color: tone.text }]}>
          {attempt.totalMarksScored} / {maxMarks}
        </Text>
        <Text style={[styles.scoreLabel, { color: tone.text }]}>marks scored</Text>
      </View>

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.semantic.success }]}>{attempt.correctCount}</Text>
          <Text style={styles.statLabel}>{t("common.correct")}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.semantic.error }]}>{attempt.wrongCount}</Text>
          <Text style={styles.statLabel}>{t("common.wrong")}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.text.muted }]}>{attempt.unattemptedCount}</Text>
          <Text style={styles.statLabel}>{t("common.unattempted")}</Text>
        </View>
      </View>

      <MockFeedbackNarrative attempt={attempt} />

      <View style={styles.timeRow}>
        <Ionicons name="time-outline" size={16} color={colors.text.muted} />
        <Text style={styles.timeText}>
          {formatDuration(attempt.timeTakenSeconds)} of {formatDuration(attempt.durationSeconds)} used
        </Text>
      </View>

      <Text style={styles.sectionHeading}>{t("mock.sectionBreakdown")}</Text>
      <View style={styles.sectionList}>
        {sectionBreakdown.map((s) => {
          const meta = toSubjectMeta(
            subjectStyles.find((row) => row.name === s.subjectName),
            s.subjectName,
            subjectFallback,
          );
          return (
            <View key={s.subjectName} style={styles.sectionRow}>
              <View style={[styles.sectionIconCircle, { backgroundColor: meta.iconBg }]}>
                <Ionicons name={meta.icon} size={16} color={meta.iconColor} />
              </View>
              <Text style={styles.sectionName}>{s.subjectName}</Text>
              <Text style={styles.sectionStats}>
                {s.correct}✓ {s.wrong}✗ {s.unattempted}−
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionHeading}>{t("summary.questionByQuestion")}</Text>
    </>
  );

  // Virtualized: an attempt carries ~80-100 of these, each expandable with a full option
  // list inside, and they were all mounted up front — real cost on the budget hardware
  // this app targets. All the chrome above moves into the header slot so it still scrolls
  // as one surface.
  return (
    <FlatList
      data={attempt.results}
      keyExtractor={(r) => r.questionId}
      contentContainerStyle={styles.container}
      ListHeaderComponent={header}
      renderItem={({ item, index }) => (
        <QuestionResultCard
          result={item}
          index={index}
          isExpanded={expandedId === item.questionId}
          onToggle={() => setExpandedId(expandedId === item.questionId ? null : item.questionId)}
        />
      )}
      ListFooterComponent={
        <Button size="lg" onPress={() => router.replace("/mock-test")}>
          {t("mock.backToMock")}
        </Button>
      }
    />
  );
}

const buildStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    container: {
      padding: 20,
      paddingTop: 24,
      paddingBottom: 40,
    },
    loadingMessage: {
      ...typography.secondary,
      marginBottom: spacing.md,
    },
    scoreCard: {
      borderRadius: 16,
      paddingVertical: 28,
      alignItems: "center",
      marginBottom: 16,
    },
    scoreValue: {
      fontSize: 30,
      fontWeight: "700",
    },
    scoreLabel: {
      fontSize: 13,
      marginTop: 4,
    },
    statRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 16,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surfaceElevated2,
      borderRadius: 12,
      padding: 14,
      alignItems: "center",
    },
    statValue: {
      fontSize: 20,
      fontWeight: "700",
    },
    statLabel: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    feedbackBox: {
      width: "100%",
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 16,
    },
    feedbackHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 6,
    },
    feedbackLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.brand.primary,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    feedbackText: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.text.primary,
      textAlign: "left",
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      justifyContent: "center",
      marginBottom: 24,
    },
    timeText: {
      fontSize: 12,
      color: colors.text.muted,
    },
    sectionHeading: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 10,
    },
    sectionList: {
      gap: 8,
      marginBottom: 24,
    },
    sectionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
    },
    sectionIconCircle: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionName: {
      flex: 1,
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.primary,
    },
    sectionStats: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 16,
      // Was the wrapping `list` style's `gap` before this became a FlatList; per-cell
      // spacing is the equivalent once the cells are separate children.
      marginBottom: 12,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    cardHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flex: 1,
    },
    cardTag: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    cardQuestion: {
      fontSize: 15,
      color: colors.text.primary,
      lineHeight: 21,
    },
    expandedContent: {
      marginTop: 14,
    },
    explanationBox: {
      marginTop: 12,
      backgroundColor: colors.surfaceElevated2,
      borderRadius: 10,
      padding: 12,
    },
    explanationLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    explanationText: {
      fontSize: 13,
      color: colors.text.primary,
      lineHeight: 19,
    },
  });
