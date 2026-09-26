import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View, StyleSheet } from "react-native";
import { computePracticeResultAnalytics, type AnalyticsQuestionInput, type PracticeResultAnalytics } from "@sarkaritaiyaari/core/analytics";
import { useSessionHistory } from "../../../practice/sessionHistory";
import type { QuestionResult } from "../../../practice/sessionHistory";
import { useAppLanguage } from "../../../practice/appLanguage";
import { getQuestionSubtopicMeta } from "../../../db/questionMeta";
import { getDifficultyCounts, getDifficultyLevels, type DifficultyLevel, type DifficultyCounts } from "../../../data/practiceData";
import { useHybridMode } from "../../../data/hybridSource";
import { AnalyticsTab } from "../../../practice/AnalyticsTab";
import { AiFeedbackTab } from "../../../practice/AiFeedbackTab";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { radius, spacing } from "../../../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../../../ui/ThemeContext";
import { useT } from "../../../i18n/I18nContext";
import { OptionList } from "../../../questionRenderer/OptionList";
import { MultiSelectOptionList } from "../../../questionRenderer/MultiSelectOptionList";
import { FreeTextAnswerInput } from "../../../questionRenderer/FreeTextAnswerInput";
import { revealLetterCompactStyles } from "../../../questionRenderer/optionListStyles";
import { describeYourAnswer, describeCorrectAnswer } from "../../../questionRenderer/answerSummary";

type ResultTab = "question" | "analytics" | "ai";

// Takes the palette: these are semantic colours, which differ between themes.
function scoreTone(accuracyPercent: number, colors: Theme["colors"]): { text: string; bg: string } {
  if (accuracyPercent >= 70) return { text: colors.semantic.success, bg: colors.semantic.successBg };
  if (accuracyPercent >= 40) return { text: colors.semantic.warning, bg: colors.semantic.warningBg };
  return { text: colors.semantic.error, bg: colors.semantic.errorBg };
}

function formatDateTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · ${date.toLocaleTimeString(
    undefined,
    { hour: "numeric", minute: "2-digit" },
  )}`;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  const styles = useThemedStyles(buildStyles);
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tabButton, active && { backgroundColor: colors.brand.primary }]}
    >
      <Text style={[styles.tabButtonText, { color: active ? colors.text.onAccent : colors.text.secondary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ResultCard({
  result,
  index,
  meta,
}: {
  result: QuestionResult;
  index: number;
  meta?: { topicName: string | null; difficultyCode: string | null };
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const optionListStyles = useThemedStyles(revealLetterCompactStyles);
  const t = useT();
  return (
    <Card style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <Text style={styles.resultQuestionNumber}>Question {index + 1}</Text>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: result.isCorrect ? colors.semantic.successBg : colors.semantic.errorBg },
          ]}
        >
          <Ionicons
            name={result.isCorrect ? "checkmark" : "close"}
            size={12}
            color={result.isCorrect ? colors.semantic.success : colors.semantic.error}
          />
          <Text style={[styles.statusPillText, { color: result.isCorrect ? colors.semantic.success : colors.semantic.error }]}>
            {result.isCorrect ? "Correct" : "Incorrect"}
          </Text>
        </View>
      </View>

      {/* Sub-topic / difficulty / time — the extra facts the Analytics tab is built from,
          surfaced here too so Question Wise stays a complete record on its own. */}
      {(meta?.topicName || meta?.difficultyCode || result.timeMs) && (
        <View style={styles.metaRow}>
          {meta?.topicName && <Text style={styles.metaText}>{meta.topicName}</Text>}
          {meta?.difficultyCode && <Text style={styles.metaText}>{t("common.difficulty")}: {meta.difficultyCode}</Text>}
          {result.timeMs !== null && result.timeMs !== undefined && (
            <Text style={styles.metaText}>
              <Ionicons name="time-outline" size={11} color={colors.text.muted} /> {formatDuration(result.timeMs)}
            </Text>
          )}
        </View>
      )}

      <Text style={styles.resultQuestionText}>{result.questionText}</Text>

      {result.questionType === "MULTIPLE_CHOICE" ? (
        <MultiSelectOptionList
          options={result.options}
          styles={optionListStyles}
          selectedIndices={
            Array.isArray(result.response?.selectedOptions)
              ? (result.response!.selectedOptions as unknown[]).filter((v): v is number => typeof v === "number")
              : []
          }
          iconSize={16}
        />
      ) : result.questionType === "TRUE_FALSE" ? (
        <OptionList
          options={[t("quiz.trueOption"), t("quiz.falseOption")]}
          styles={optionListStyles}
          badge="letter"
          selectedIndex={typeof result.response?.selectedBoolean === "boolean" ? (result.response.selectedBoolean ? 0 : 1) : null}
          iconSize={16}
        />
      ) : result.questionType === "NUMERIC" ? (
        <FreeTextAnswerInput
          value={typeof result.response?.enteredValue === "number" ? String(result.response.enteredValue) : ""}
          disabled
          isCorrect={result.isCorrect}
        />
      ) : result.questionType === "FILL_BLANK" ? (
        <FreeTextAnswerInput
          value={typeof result.response?.enteredText === "string" ? result.response.enteredText : ""}
          disabled
          isCorrect={result.isCorrect}
        />
      ) : result.questionType === "MATCH" || result.questionType === "ORDERING" ? (
        // No per-key labels survive in a stored result snapshot (same limitation the
        // answerSummary.ts comment already documents for MULTIPLE_CHOICE/TRUE_FALSE) — the
        // "Your Answer"/"Correct Answer" lines below are this type's only summary here.
        null
      ) : (
        <OptionList
          options={result.options}
          styles={optionListStyles}
          badge="letter"
          selectedIndex={result.selectedIndex}
          correctIndex={result.correctIndex}
          iconSize={16}
        />
      )}

      <View style={styles.answerLines}>
        <Text style={styles.answerLine}>
          Your Answer:{" "}
          <Text style={[styles.answerLineValue, { color: result.isCorrect ? colors.semantic.success : colors.semantic.error }]}>
            {describeYourAnswer(result, { trueOption: t("quiz.trueOption"), falseOption: t("quiz.falseOption"), unattempted: t("common.unattempted") })}
          </Text>
        </Text>
        {!result.isCorrect &&
          (() => {
            const correctAnswer = describeCorrectAnswer(result, {
              trueOption: t("quiz.trueOption"),
              falseOption: t("quiz.falseOption"),
              unattempted: t("common.unattempted"),
            });
            return correctAnswer ? (
              <Text style={styles.answerLine}>
                Correct Answer:{" "}
                <Text style={[styles.answerLineValue, { color: colors.semantic.success }]}>{correctAnswer}</Text>
              </Text>
            ) : null;
          })()}
      </View>

      <View style={styles.explanationBox}>
        <Text style={styles.explanationLabel}>{t("common.explanation")}</Text>
        <Text style={styles.explanationText}>{result.explanation}</Text>
      </View>
    </Card>
  );
}

export default function Summary() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const router = useRouter();
  const { sessionId, topicId, examCode, examLabel, subjectName, topicName, levelKey, levelLabel } = useLocalSearchParams<{
    sessionId: string;
    topicId?: string;
    examCode?: string;
    examLabel?: string;
    subjectName?: string;
    topicName?: string;
    levelKey?: string;
    levelLabel?: string;
  }>();
  const { getSession, sessions } = useSessionHistory();
  const { defaultLanguageCode } = useAppLanguage();
  const mode = useHybridMode();
  const session = getSession(sessionId ?? "");

  const [tab, setTab] = useState<ResultTab>("question");

  // Each question's own sub-topic/difficulty, joined from the local questions table by id —
  // see db/questionMeta.ts for why no new column was needed for this.
  const [meta, setMeta] = useState<{ sessionId: string; byId: Map<string, { topicName: string | null; difficultyCode: string | null }> } | null>(
    null,
  );
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    getQuestionSubtopicMeta(session.results.map((r) => r.questionId)).then((byId) => {
      if (!cancelled) setMeta({ sessionId: session.id, byId });
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // The Next Level action's data — fetched in the background, never blocking the rest of the
  // screen (§15). Hidden entirely when unavailable rather than shown disabled.
  const [levelData, setLevelData] = useState<{ topicId: string; levels: DifficultyLevel[]; counts: DifficultyCounts } | null>(null);
  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    Promise.all([getDifficultyLevels(mode), getDifficultyCounts(topicId, examCode ?? null, mode)])
      .then(([levels, counts]) => {
        if (!cancelled) setLevelData({ topicId, levels, counts });
      })
      .catch(() => {
        /* Next Level simply doesn't appear — never an error state for a secondary action. */
      });
    return () => {
      cancelled = true;
    };
  }, [topicId, examCode, mode]);

  const nextLevel = useMemo(() => {
    if (!levelData || !topicId || levelData.topicId !== topicId || !levelKey) return null;
    const ordered = levelData.levels.filter((l) => (levelData.counts[l.code] ?? 0) > 0);
    const currentIndex = ordered.findIndex((l) => l.code === levelKey);
    if (currentIndex === -1 || currentIndex === ordered.length - 1) return null;
    return ordered[currentIndex + 1];
  }, [levelData, topicId, levelKey]);

  const analytics: PracticeResultAnalytics | null = useMemo(() => {
    if (!session || !meta || meta.sessionId !== session.id) return null;
    const questions: AnalyticsQuestionInput[] = session.results.map((r, i) => ({
      questionId: r.questionId,
      questionNumber: i + 1,
      isCorrect: r.isCorrect,
      timeMs: r.timeMs ?? null,
      subtopicName: meta.byId.get(r.questionId)?.topicName ?? null,
      difficultyCode: meta.byId.get(r.questionId)?.difficultyCode ?? null,
    }));

    // A cheap, on-device "previous performance" signal: the most recent other session for the
    // same topic, from history already held in memory — no extra query. `computePracticeResultAnalytics`
    // derives the current session's own accuracy itself from `questions`.
    const previous = sessions.find((s) => s.id !== session.id && s.topicName === session.topicName);
    const previousAccuracyPercent = previous && previous.totalCount > 0 ? Math.round((previous.correctCount / previous.totalCount) * 100) : null;

    return computePracticeResultAnalytics({ questions, previousAccuracyPercent });
  }, [session, meta, sessions]);

  if (!session) {
    return (
      <View style={styles.emptyScreen}>
        <EmptyState icon="alert-circle-outline" title={t("summary.notFound")} body={t("summary.notFoundBody")} />
      </View>
    );
  }

  // `totalCount` is the number ANSWERED, so accuracy is unaffected by stopping early.
  const accuracyPercent = Math.round((session.correctCount / session.totalCount) * 100);
  const incorrectCount = session.totalCount - session.correctCount;
  const tone = scoreTone(accuracyPercent, colors);
  const skippedCount =
    session.availableCount !== null && session.availableCount > session.totalCount
      ? session.availableCount - session.totalCount
      : 0;

  const retry = () => {
    if (!topicId || !levelKey) return;
    router.replace({
      pathname: "/practice/quiz",
      params: {
        examCode: examCode ?? "",
        examLabel: examLabel ?? "",
        subjectName: subjectName ?? "",
        topicId,
        topicName: topicName ?? session.topicName,
        levelKey,
        levelLabel: levelLabel ?? session.levelLabel,
      },
    });
  };

  const goNextLevel = () => {
    if (!nextLevel || !topicId) return;
    router.replace({
      pathname: "/practice/quiz",
      params: {
        examCode: examCode ?? "",
        examLabel: examLabel ?? "",
        subjectName: subjectName ?? "",
        topicId,
        topicName: topicName ?? session.topicName,
        levelKey: nextLevel.code,
        levelLabel: nextLevel.label,
      },
    });
  };

  const goNextTopic = () => {
    router.replace({ pathname: "/practice/browse", params: { examCode: examCode ?? "", examLabel: examLabel ?? "" } });
  };

  const header = (
    <View style={styles.headerBlock}>
      <View style={[styles.scoreCircle, { backgroundColor: tone.bg }]}>
        <Text style={[styles.scoreText, { color: tone.text }]}>
          {session.correctCount}/{session.totalCount}
        </Text>
      </View>
      <Text style={[styles.accuracyText, { color: tone.text }]}>{t("summary.accuracyLine", { percent: accuracyPercent })}</Text>
      <Text style={styles.contextText}>
        {session.examLabel ? `${session.examLabel} · ` : ""}
        {session.subjectName} · {session.topicName} · {session.levelLabel}
      </Text>
      <Text style={styles.dateText}>{formatDateTime(session.completedAt)}</Text>

      {skippedCount > 0 && (
        <Text style={styles.earlyFinishText}>
          {t("summary.earlyFinish", {
            answered: session.totalCount,
            available: session.availableCount ?? session.totalCount,
            skipped: skippedCount,
          })}
        </Text>
      )}

      <View style={styles.statsRow}>
        <StatCell label={t("common.answered")} value={String(session.totalCount)} />
        <StatCell label={t("common.correct")} value={String(session.correctCount)} color={colors.semantic.success} />
        <StatCell label={t("common.incorrect")} value={String(incorrectCount)} color={colors.semantic.error} />
        <StatCell label={t("common.accuracy")} value={`${accuracyPercent}%`} />
      </View>

      {session.durationMs !== null && (
        <View style={styles.durationRow}>
          <Ionicons name="time-outline" size={14} color={colors.text.muted} />
          <Text style={styles.durationText}>Time taken: {formatDuration(session.durationMs)}</Text>
        </View>
      )}

      {/* Primary actions — §1 of the spec. Retry/Next Level only appear when this session
          carries the route context they need (a fresh session, not one reopened from History). */}
      <View style={styles.actionsRow}>
        {topicId && levelKey && (
          <Button variant="secondary" size="md" onPress={retry} style={styles.actionButton}>
            {t("common.retry")}
          </Button>
        )}
        {nextLevel && (
          <Button variant="secondary" size="md" onPress={goNextLevel} style={styles.actionButton}>
            {t("summary.nextLevel")}
          </Button>
        )}
        <Button size="md" onPress={goNextTopic} style={styles.actionButton}>
          {t("summary.nextTopic")}
        </Button>
      </View>

      <View style={styles.tabBar}>
        <TabButton label={t("summary.tabQuestionWise")} active={tab === "question"} onPress={() => setTab("question")} />
        <TabButton label={t("summary.tabAnalytics")} active={tab === "analytics"} onPress={() => setTab("analytics")} />
        <TabButton label={t("summary.tabAiFeedback")} active={tab === "ai"} onPress={() => setTab("ai")} />
      </View>

      {tab === "question" && <Text style={[typography.label, styles.sectionLabel]}>{t("summary.questionByQuestion")}</Text>}

      {tab === "analytics" &&
        (analytics ? (
          <View style={styles.tabContent}>
            <AnalyticsTab analytics={analytics} />
          </View>
        ) : (
          <View style={styles.tabContent} />
        ))}

      {tab === "ai" &&
        (analytics ? (
          <View style={styles.tabContent}>
            <AiFeedbackTab
              session={session}
              analytics={analytics}
              examCode={examCode ?? session.examCode}
              subjectName={subjectName ?? session.subjectName}
              topicName={topicName ?? session.topicName}
              levelLabel={levelLabel ?? session.levelLabel}
              languageCode={defaultLanguageCode}
            />
          </View>
        ) : (
          <View style={styles.tabContent} />
        ))}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: t("summary.title") }} />
      {/*
        Question Wise is virtualized (one card per question); Analytics/AI Feedback render as
        part of the header instead, since their content isn't a long per-question list. This
        keeps one scroll surface for all three tabs rather than three separate screens.
      */}
      <FlatList
        data={tab === "question" ? session.results : []}
        keyExtractor={(result) => result.questionId}
        contentContainerStyle={styles.container}
        renderItem={({ item, index }) => (
          <ResultCard result={item} index={index} meta={meta && meta.sessionId === session.id ? meta.byId.get(item.questionId) : undefined} />
        )}
        ListHeaderComponent={header}
        ListFooterComponent={
          <View style={styles.footerBlock}>
            <Button
              variant="secondary"
              size="lg"
              onPress={() => router.push("/practice/history")}
              style={styles.secondaryButton}
            >
              {t("summary.viewHistory")}
            </Button>

            <Button size="lg" onPress={() => router.replace("/practice")} style={styles.primaryButton}>
              {t("summary.backToPractice")}
            </Button>
          </View>
        }
      />
    </>
  );
}

const buildStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    container: {
      padding: spacing.xl,
      paddingTop: spacing["2xl"],
      alignItems: "center",
      paddingBottom: spacing["4xl"],
    },
    emptyScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    scoreCircle: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignItems: "center",
      justifyContent: "center",
    },
    scoreText: {
      fontSize: 30,
      fontWeight: "700",
    },
    accuracyText: {
      marginTop: spacing.md + 2,
      fontSize: 16,
      fontWeight: "700",
    },
    contextText: {
      marginTop: spacing.xs + 2,
      fontSize: 13,
      color: colors.text.muted,
      textAlign: "center",
    },
    earlyFinishText: {
      marginTop: spacing.sm,
      fontSize: 12.5,
      fontWeight: "600",
      color: colors.brand.light,
      textAlign: "center",
    },
    dateText: {
      marginTop: spacing.xs,
      fontSize: 12,
      color: colors.text.muted,
    },
    statsRow: {
      flexDirection: "row",
      width: "100%",
      marginTop: spacing.xl,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
    },
    statCell: {
      flex: 1,
      alignItems: "center",
    },
    statValue: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text.primary,
    },
    statLabel: {
      marginTop: 2,
      fontSize: 11,
      color: colors.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    durationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      marginTop: spacing.md,
    },
    durationText: {
      fontSize: 12,
      color: colors.text.muted,
    },
    actionsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: spacing.sm,
      width: "100%",
      marginTop: spacing.lg,
    },
    actionButton: {
      flexGrow: 1,
      minWidth: 100,
    },
    tabBar: {
      flexDirection: "row",
      width: "100%",
      marginTop: spacing.xl,
      backgroundColor: colors.surfaceElevated2,
      borderRadius: radius.lg,
      padding: 3,
      gap: 3,
    },
    tabButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      alignItems: "center",
    },
    tabButtonText: {
      fontSize: 12.5,
      fontWeight: "700",
    },
    tabContent: {
      width: "100%",
      marginTop: spacing.lg,
    },
    sectionLabel: {
      alignSelf: "flex-start",
      marginTop: spacing["2xl"],
      marginBottom: spacing.md,
    },
    headerBlock: {
      width: "100%",
      alignItems: "center",
    },
    footerBlock: {
      width: "100%",
    },
    resultCard: {
      width: "100%",
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    resultHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    resultQuestionNumber: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.muted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 3,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.pill,
    },
    statusPillText: {
      fontSize: 11,
      fontWeight: "700",
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    metaText: {
      fontSize: 11.5,
      color: colors.text.muted,
    },
    resultQuestionText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text.primary,
      lineHeight: 22,
    },
    answerLines: {
      gap: 4,
    },
    answerLine: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    answerLineValue: {
      fontWeight: "700",
    },
    explanationBox: {
      backgroundColor: colors.surfaceElevated2,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    explanationLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text.secondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: spacing.xs,
    },
    explanationText: {
      fontSize: 13,
      color: colors.text.primary,
      lineHeight: 20,
    },
    secondaryButton: {
      width: "100%",
      marginTop: spacing["2xl"],
    },
    primaryButton: {
      width: "100%",
      marginTop: spacing.md,
    },
  });
