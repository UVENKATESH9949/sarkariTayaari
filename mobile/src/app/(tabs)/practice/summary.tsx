import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { FlatList, Text, View, StyleSheet } from "react-native";
import { useSessionHistory } from "../../../practice/sessionHistory";
import type { QuestionResult } from "../../../practice/sessionHistory";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { radius, spacing } from "../../../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../../../ui/ThemeContext";
import { useT } from "../../../i18n/I18nContext";

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

function ResultCard({ result, index }: { result: QuestionResult; index: number }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
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

      <Text style={styles.resultQuestionText}>{result.questionText}</Text>

      <View style={styles.optionsList}>
        {result.options.map((option, optionIndex) => {
          const isCorrectOption = optionIndex === result.correctIndex;
          const isUserWrongPick = optionIndex === result.selectedIndex && !result.isCorrect;
          return (
            <View
              key={optionIndex}
              style={[
                styles.optionRow,
                isCorrectOption && styles.optionRowCorrect,
                isUserWrongPick && styles.optionRowWrong,
              ]}
            >
              <View
                style={[
                  styles.optionBadge,
                  isCorrectOption && styles.optionBadgeCorrect,
                  isUserWrongPick && styles.optionBadgeWrong,
                ]}
              >
                <Text style={[styles.optionBadgeText, (isCorrectOption || isUserWrongPick) && styles.optionBadgeTextLight]}>
                  {String.fromCharCode(65 + optionIndex)}
                </Text>
              </View>
              <Text style={styles.optionText}>{option}</Text>
              {isCorrectOption && <Ionicons name="checkmark-circle" size={16} color={colors.semantic.success} />}
              {isUserWrongPick && <Ionicons name="close-circle" size={16} color={colors.semantic.error} />}
            </View>
          );
        })}
      </View>

      <View style={styles.answerLines}>
        <Text style={styles.answerLine}>
          Your Answer:{" "}
          <Text style={[styles.answerLineValue, { color: result.isCorrect ? colors.semantic.success : colors.semantic.error }]}>
            {String.fromCharCode(65 + result.selectedIndex)}. {result.options[result.selectedIndex]}
          </Text>
        </Text>
        {!result.isCorrect && (
          <Text style={styles.answerLine}>
            Correct Answer:{" "}
            <Text style={[styles.answerLineValue, { color: colors.semantic.success }]}>
              {String.fromCharCode(65 + result.correctIndex)}. {result.options[result.correctIndex]}
            </Text>
          </Text>
        )}
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
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { getSession } = useSessionHistory();
  const session = getSession(sessionId ?? "");

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
  // Only worth a line when the two actually differ — i.e. the session was finished early.
  // Null on sessions predating the column and on anything restored from the server.
  const skippedCount =
    session.availableCount !== null && session.availableCount > session.totalCount
      ? session.availableCount - session.totalCount
      : 0;

  return (
    <>
      <Stack.Screen options={{ title: t("summary.title") }} />
      {/*
        Virtualized: this renders one expandable card per question of the session, and a
        session is as long as the quiz was (capped at PRACTICE_QUESTION_LIMIT, 200). All
        of the surrounding chrome moves into the header/footer slots so it still scrolls
        as one surface.
      */}
      <FlatList
        data={session.results}
        keyExtractor={(result) => result.questionId}
        contentContainerStyle={styles.container}
        renderItem={({ item, index }) => <ResultCard result={item} index={index} />}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={[styles.scoreCircle, { backgroundColor: tone.bg }]}>
              <Text style={[styles.scoreText, { color: tone.text }]}>
                {session.correctCount}/{session.totalCount}
              </Text>
            </View>
            <Text style={[styles.accuracyText, { color: tone.text }]}>
              {t("summary.accuracyLine", { percent: accuracyPercent })}
            </Text>
            <Text style={styles.contextText}>
              {session.examLabel ? `${session.examLabel} · ` : ""}
              {session.subjectName} · {session.topicName} · {session.levelLabel}
            </Text>
            <Text style={styles.dateText}>{formatDateTime(session.completedAt)}</Text>

            {/* Shown rather than folded into accuracy on purpose: the student chose to stop,
                and the set having had more questions is context, not a penalty. */}
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
              {/* "Answered", not "Total" — with early finishing the two are different, and
                  this cell is the accuracy denominator. */}
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

            <Text style={[typography.label, styles.sectionLabel]}>{t("summary.questionByQuestion")}</Text>
          </View>
        }
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
    emptyText: {
      ...typography.secondary,
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
    sectionLabel: {
      alignSelf: "flex-start",
      marginTop: spacing["2xl"],
      marginBottom: spacing.md,
    },
    // The header/footer slots carry the centring that the old single ScrollView container
    // applied to everything at once.
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
    resultQuestionText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text.primary,
      lineHeight: 22,
    },
    optionsList: {
      gap: spacing.sm,
    },
    optionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm + 2,
      backgroundColor: colors.surfaceElevated2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm + 2,
      padding: spacing.sm + 2,
    },
    optionRowCorrect: {
      borderColor: colors.semantic.success,
      backgroundColor: colors.semantic.successBg,
    },
    optionRowWrong: {
      borderColor: colors.semantic.error,
      backgroundColor: colors.semantic.errorBg,
    },
    optionBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
    },
    optionBadgeCorrect: {
      backgroundColor: colors.semantic.success,
    },
    optionBadgeWrong: {
      backgroundColor: colors.semantic.error,
    },
    optionBadgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.primary,
    },
    optionBadgeTextLight: {
      color: colors.text.onAccent,
    },
    optionText: {
      flex: 1,
      fontSize: 13,
      color: colors.text.primary,
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
