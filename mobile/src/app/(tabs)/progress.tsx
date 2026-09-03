import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSessionHistory } from "../../practice/sessionHistory";
import { toSubjectMeta } from "../../constants/subjects";
import { getAllSubjects, type SubjectMetaRow } from "../../db/subjectMeta";
import { PressableScale } from "../../ui/PressableScale";
import { AnimatedProgressBar } from "../../ui/AnimatedProgressBar";
import { ContextualLoading } from "../../ui/ContextualLoading";
import { DonutRing } from "../../ui/DonutRing";
import { FadeInItem } from "../../ui/FadeInList";
import { Card } from "../../ui/Card";
import { ListSkeleton } from "../../ui/Skeleton";
import { radius, spacing } from "../../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../../ui/ThemeContext";
import { useT } from "../../i18n/I18nContext";

// Takes the palette rather than reading a module constant: these three thresholds map to
// semantic colours that differ between themes (the dark palette's bright greens are
// unreadable on white — see palettes.ts).
function scoreColor(percent: number, colors: Theme["colors"]) {
  if (percent >= 70) return colors.semantic.success;
  if (percent >= 40) return colors.semantic.warning;
  return colors.semantic.error;
}

// Takes `t`, same reason as more.tsx's formatLastSynced.
function formatLastActive(completedAt: number, t: ReturnType<typeof useT>): string {
  const diffDays = Math.floor((Date.now() - completedAt) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return t("history.today");
  if (diffDays === 1) return t("history.relYesterday");
  return t("history.daysAgo", { count: diffDays });
}


export default function Progress() {
  const { colors, typography } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  // Neutral fallback for a subject an admin hasn't given an icon colour yet; the
  // constants module can't know the theme, so it comes from here.
  //
  // Memoized because the stats useMemo below depends on it: a fresh object literal every
  // render would make that dependency change every render and recompute the whole subject
  // breakdown each time, which is the opposite of what the memo is for.
  const subjectFallback = useMemo(
    () => ({ iconColor: colors.text.secondary, iconBg: colors.surfaceElevated2 }),
    [colors],
  );
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sessions } = useSessionHistory();
  // Breakdown covers whatever subjects are synced, not a fixed built-in list.
  const [syncedSubjects, setSyncedSubjects] = useState<SubjectMetaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllSubjects()
      .then(setSyncedSubjects)
      .catch(() => setSyncedSubjects([]))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    let totalCorrect = 0;
    let totalQuestions = 0;
    const bySubject: Record<string, { correct: number; total: number }> = {};

    for (const session of sessions) {
      totalCorrect += session.correctCount;
      totalQuestions += session.totalCount;
      const bucket = bySubject[session.subjectName] ?? { correct: 0, total: 0 };
      bucket.correct += session.correctCount;
      bucket.total += session.totalCount;
      bySubject[session.subjectName] = bucket;
    }

    const readinessPercent = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    const subjectBreakdown = syncedSubjects.map((subject) => {
      const bucket = bySubject[subject.name];
      const accuracyPercent = bucket && bucket.total > 0 ? Math.round((bucket.correct / bucket.total) * 100) : null;
      return { ...toSubjectMeta(subject, "", subjectFallback), accuracyPercent, attempted: bucket?.total ?? 0 };
    });

    return {
      totalCorrect,
      totalQuestions,
      sessionsCompleted: sessions.length,
      readinessPercent,
      subjectBreakdown,
    };
  }, [sessions, syncedSubjects, subjectFallback]);

  const hasActivity = stats.totalQuestions > 0;

  const mostRecentSession = sessions[0];

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <Text style={styles.title}>{t("progress.title")}</Text>

      {mostRecentSession && (
        <PressableScale style={styles.historyCard} onPress={() => router.push("/practice/history")}>
          <View style={styles.historyIconBox}>
            <Ionicons name="time-outline" size={21} color={colors.brand.light} />
          </View>
          <View style={styles.historyInfo}>
            <Text style={styles.historyTitle}>{t("progress.viewFullHistory")}</Text>
            <Text style={styles.historySub}>
              {t("progress.sessionsLogged", {
                count: stats.sessionsCompleted,
                when: formatLastActive(mostRecentSession.completedAt, t),
              })}
              {formatLastActive(mostRecentSession.completedAt, t)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.brand.light} />
        </PressableScale>
      )}

      <Card variant="gradient" style={styles.readinessCard}>
        <DonutRing percent={stats.readinessPercent} fillColor={colors.brand.light} />
        <View style={styles.readinessInfo}>
          <Text style={styles.readinessLabel}>{t("progress.readinessScore")}</Text>
          <Text style={styles.readinessHint}>
            {hasActivity
              ? t("progress.readinessBasis")
              : t("progress.readinessEmpty")}
          </Text>
        </View>
      </Card>

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalQuestions}</Text>
          <Text style={styles.statLabel}>{t("progress.questionsAttempted")}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.sessionsCompleted}</Text>
          <Text style={styles.statLabel}>{t("progress.sessionsCompleted")}</Text>
        </View>
      </View>

      <Text style={typography.sectionTitle}>{t("progress.subjectAccuracy")}</Text>
      {loading ? (
        <ContextualLoading message={t("progress.loading")} skeleton={<ListSkeleton count={4} />} />
      ) : (
      <View style={styles.subjectList}>
        {stats.subjectBreakdown.map((subject, index) => (
          <FadeInItem key={subject.name} index={index}>
            <View style={styles.subjectRow}>
              <View style={[styles.subjectIconCircle, { backgroundColor: subject.iconBg }]}>
                <Ionicons name={subject.icon} size={18} color={subject.iconColor} />
              </View>
              <View style={styles.subjectInfo}>
                <Text style={styles.subjectName}>{subject.name}</Text>
                {subject.accuracyPercent === null ? (
                  <Text style={styles.subjectEmpty}>{t("progress.notAttempted")}</Text>
                ) : (
                  <AnimatedProgressBar
                    progress={subject.accuracyPercent / 100}
                    fillColor={scoreColor(subject.accuracyPercent, colors)}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.subjectPercent,
                  subject.accuracyPercent !== null && { color: scoreColor(subject.accuracyPercent, colors) },
                ]}
              >
                {subject.accuracyPercent === null ? "—" : `${subject.accuracyPercent}%`}
              </Text>
            </View>
          </FadeInItem>
        ))}
      </View>
      )}

      <PressableScale style={styles.historyLink} onPress={() => router.push("/practice/history")}>
        <Text style={styles.historyLinkText}>{t("progress.viewFullHistory")}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.brand.primary} />
      </PressableScale>
    </ScrollView>
  );
}

const buildStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    container: {
      padding: spacing.xl,
      paddingTop: spacing.xl,
      paddingBottom: spacing["3xl"],
    },
    title: {
      ...typography.pageTitle,
      marginBottom: spacing.lg,
    },
    historyCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.base,
      marginBottom: spacing.base,
    },
    historyIconBox: {
      width: 44,
      height: 44,
      borderRadius: 13,
      backgroundColor: colors.surfaceElevated2,
      alignItems: "center",
      justifyContent: "center",
    },
    historyInfo: {
      flex: 1,
    },
    historyTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: 2,
    },
    historySub: {
      fontSize: 12,
      color: colors.text.muted,
    },
    readinessCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.base,
      marginBottom: spacing.base,
    },
    readinessInfo: {
      flex: 1,
    },
    readinessLabel: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.onAccent,
    },
    readinessHint: {
      fontSize: 12,
      color: colors.text.onAccentSecondary,
      marginTop: spacing.xs,
      lineHeight: 17,
    },
    statRow: {
      flexDirection: "row",
      gap: spacing.md,
      marginBottom: spacing.xl,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surfaceElevated2,
      borderRadius: radius.lg,
      padding: spacing.base,
    },
    statValue: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text.primary,
    },
    statLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: spacing.xs,
    },
    subjectList: {
      gap: spacing.md + 2,
      marginTop: spacing.md,
    },
    subjectRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    subjectIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    subjectInfo: {
      flex: 1,
    },
    subjectName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary,
      marginBottom: spacing.xs + 2,
    },
    subjectEmpty: {
      fontSize: 12,
      color: colors.text.muted,
      fontStyle: "italic",
    },
    subjectPercent: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.muted,
      width: 40,
      textAlign: "right",
    },
    historyLink: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.xs + 2,
      marginTop: spacing["2xl"],
      paddingVertical: spacing.md,
    },
    historyLinkText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.brand.primary,
    },
  });
