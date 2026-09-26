import { Ionicons } from "@expo/vector-icons";
import { Text, View, StyleSheet } from "react-native";
import type { PracticeResultAnalytics, SubtopicAnalytics, FlaggedQuestion } from "@sarkaritaiyaari/core/analytics";
import { Card } from "../ui/Card";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { useT } from "../i18n/I18nContext";

function formatSeconds(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function StatBlock({ value, label }: { value: string; label: string }) {
  const styles = useThemedStyles(buildStyles);
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** The subtopic performance label as an icon + tone, shared by the sub-topic card and the callouts. */
function labelTone(colors: Theme["colors"], label: SubtopicAnalytics["performanceLabel"]) {
  switch (label) {
    case "STRONG":
      return { icon: "checkmark-circle" as const, color: colors.semantic.success, bg: colors.semantic.successBg };
    case "WEAK":
      return { icon: "alert-circle" as const, color: colors.semantic.error, bg: colors.semantic.errorBg };
    case "NEEDS_PRACTICE":
      return { icon: "warning" as const, color: colors.semantic.warning, bg: colors.semantic.warningBg };
    case "INSUFFICIENT_DATA":
    default:
      return { icon: "help-circle-outline" as const, color: colors.text.muted, bg: colors.surfaceElevated2 };
  }
}

function SubtopicRow({ subtopic }: { subtopic: SubtopicAnalytics }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const tone = labelTone(colors, subtopic.performanceLabel);
  const labelText = {
    STRONG: t("analyticsTab.label.STRONG"),
    NEEDS_PRACTICE: t("analyticsTab.label.NEEDS_PRACTICE"),
    WEAK: t("analyticsTab.label.WEAK"),
    INSUFFICIENT_DATA: t("analyticsTab.label.INSUFFICIENT_DATA"),
  }[subtopic.performanceLabel];

  return (
    <View style={styles.subtopicRow}>
      <View style={styles.subtopicHeader}>
        <Text style={styles.subtopicName} numberOfLines={2}>
          {subtopic.name}
        </Text>
        <View style={[styles.labelPill, { backgroundColor: tone.bg }]}>
          <Ionicons name={tone.icon} size={12} color={tone.color} />
          <Text style={[styles.labelPillText, { color: tone.color }]}>{labelText}</Text>
        </View>
      </View>
      <Text style={styles.subtopicMeta}>
        {t("analyticsTab.subtopicAccuracy", { percent: String(subtopic.accuracyPercent) })}
        {subtopic.averageTimeMs !== null
          ? ` · ${t("analyticsTab.subtopicAverage", { time: formatSeconds(subtopic.averageTimeMs) })}`
          : ""}
      </Text>
    </View>
  );
}

function FlaggedQuestionRow({ item, showCorrectness }: { item: FlaggedQuestion; showCorrectness: boolean }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  return (
    <View style={styles.flaggedRow}>
      <Text style={styles.flaggedQuestion}>{t("analyticsTab.questionShort", { number: String(item.questionNumber) })}</Text>
      <Text style={styles.flaggedTime}>{formatSeconds(item.timeMs)}</Text>
      {showCorrectness && (
        <Text style={[styles.flaggedStatus, { color: item.isCorrect ? colors.semantic.success : colors.semantic.error }]}>
          {item.isCorrect ? t("common.correct") : t("common.incorrect")}
        </Text>
      )}
      {item.subtopicName && (
        <Text style={styles.flaggedSubtopic} numberOfLines={1}>
          {item.subtopicName}
        </Text>
      )}
    </View>
  );
}

export function AnalyticsTab({ analytics }: { analytics: PracticeResultAnalytics }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();

  return (
    <View style={styles.container}>
      {/* A. Overall performance */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t("analyticsTab.overallTitle")}</Text>
        <View style={styles.statsGrid}>
          <StatBlock value={`${analytics.score.accuracyPercent}%`} label={t("common.accuracy")} />
          <StatBlock value={`${analytics.score.correctCount}/${analytics.score.questionsAttempted}`} label={t("analyticsTab.correctOfAttempted")} />
          <StatBlock
            value={analytics.score.totalTimeMs !== null ? formatSeconds(analytics.score.totalTimeMs) : "—"}
            label={t("analyticsTab.totalTime")}
          />
          <StatBlock
            value={analytics.score.averageTimeMs !== null ? formatSeconds(analytics.score.averageTimeMs) : "—"}
            label={t("analyticsTab.avgPerQuestion")}
          />
        </View>
      </Card>

      {/* B. High time questions */}
      {analytics.highTimeQuestions.length > 0 && (
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="warning" size={16} color={colors.semantic.warning} />
            <Text style={styles.cardTitle}>{t("analyticsTab.highTimeTitle")}</Text>
          </View>
          {analytics.highTimeQuestions.map((item) => (
            <FlaggedQuestionRow key={item.questionId} item={item} showCorrectness />
          ))}
        </Card>
      )}

      {/* C. Fast + accurate questions */}
      {analytics.fastAccurateQuestions.length > 0 && (
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flash" size={16} color={colors.semantic.success} />
            <Text style={styles.cardTitle}>{t("analyticsTab.fastAccurateTitle")}</Text>
          </View>
          {analytics.fastAccurateQuestions.map((item) => (
            <FlaggedQuestionRow key={item.questionId} item={item} showCorrectness={false} />
          ))}
        </Card>
      )}

      {/* Sub-topic analysis */}
      {analytics.subtopics.length > 0 && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t("analyticsTab.subtopicTitle")}</Text>
          {analytics.subtopics.map((s) => (
            <SubtopicRow key={s.name} subtopic={s} />
          ))}
        </Card>
      )}

      {/* Weak areas */}
      {analytics.weakAreas.length > 0 && (
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="alert-circle" size={16} color={colors.semantic.error} />
            <Text style={styles.cardTitle}>{t("analyticsTab.weakAreasTitle")}</Text>
          </View>
          {analytics.weakAreas.map((s) => (
            <SubtopicRow key={s.name} subtopic={s} />
          ))}
        </Card>
      )}

      {/* Strong areas */}
      {analytics.strongAreas.length > 0 && (
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="checkmark-circle" size={16} color={colors.semantic.success} />
            <Text style={styles.cardTitle}>{t("analyticsTab.strongAreasTitle")}</Text>
          </View>
          {analytics.strongAreas.map((s) => (
            <SubtopicRow key={s.name} subtopic={s} />
          ))}
        </Card>
      )}
    </View>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: { width: "100%", gap: spacing.md },
    card: { width: "100%", gap: spacing.sm },
    cardTitle: { fontSize: 14, fontWeight: "700", color: colors.text.primary },
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    statsGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.xs },
    statBlock: { width: "50%", paddingVertical: spacing.sm },
    statValue: { fontSize: 20, fontWeight: "700", color: colors.text.primary },
    statLabel: { fontSize: 11.5, color: colors.text.muted, marginTop: 2 },
    subtopicRow: {
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
      paddingTop: spacing.sm,
      marginTop: spacing.sm,
      gap: 4,
    },
    subtopicHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    subtopicName: { flex: 1, fontSize: 13.5, fontWeight: "600", color: colors.text.primary },
    subtopicMeta: { fontSize: 12, color: colors.text.secondary },
    labelPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 3,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.pill,
    },
    labelPillText: { fontSize: 10.5, fontWeight: "700" },
    flaggedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
      paddingTop: spacing.sm,
      marginTop: spacing.sm,
    },
    flaggedQuestion: { fontSize: 12.5, fontWeight: "700", color: colors.text.primary, minWidth: 34 },
    flaggedTime: { fontSize: 12.5, color: colors.text.secondary, minWidth: 48 },
    flaggedStatus: { fontSize: 12, fontWeight: "600" },
    flaggedSubtopic: { flex: 1, fontSize: 12, color: colors.text.muted, textAlign: "right" },
  });
