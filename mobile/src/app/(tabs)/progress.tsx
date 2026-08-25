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
import { colors, radius, spacing, typography } from "../../ui/theme";

function scoreColor(percent: number) {
  if (percent >= 70) return colors.semantic.success;
  if (percent >= 40) return colors.semantic.warning;
  return colors.semantic.error;
}

function formatLastActive(completedAt: number): string {
  const diffDays = Math.floor((Date.now() - completedAt) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}

export default function Progress() {
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
      return { ...toSubjectMeta(subject), accuracyPercent, attempted: bucket?.total ?? 0 };
    });

    return {
      totalCorrect,
      totalQuestions,
      sessionsCompleted: sessions.length,
      readinessPercent,
      subjectBreakdown,
    };
  }, [sessions, syncedSubjects]);

  const hasActivity = stats.totalQuestions > 0;

  const mostRecentSession = sessions[0];

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <Text style={styles.title}>Your Progress</Text>

      {mostRecentSession && (
        <PressableScale style={styles.historyCard} onPress={() => router.push("/practice/history")}>
          <View style={styles.historyIconBox}>
            <Ionicons name="time-outline" size={21} color={colors.brand.light} />
          </View>
          <View style={styles.historyInfo}>
            <Text style={styles.historyTitle}>View full session history</Text>
            <Text style={styles.historySub}>
              {stats.sessionsCompleted} session{stats.sessionsCompleted === 1 ? "" : "s"} logged · last active{" "}
              {formatLastActive(mostRecentSession.completedAt)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.brand.light} />
        </PressableScale>
      )}

      <Card variant="gradient" style={styles.readinessCard}>
        <DonutRing percent={stats.readinessPercent} fillColor={colors.brand.light} />
        <View style={styles.readinessInfo}>
          <Text style={styles.readinessLabel}>Exam Readiness Score</Text>
          <Text style={styles.readinessHint}>
            {hasActivity
              ? "Based on your accuracy across all practice sessions."
              : "Complete a practice session to see your score."}
          </Text>
        </View>
      </Card>

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalQuestions}</Text>
          <Text style={styles.statLabel}>Questions attempted</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.sessionsCompleted}</Text>
          <Text style={styles.statLabel}>Sessions completed</Text>
        </View>
      </View>

      <Text style={typography.sectionTitle}>Subject-wise accuracy</Text>
      {loading ? (
        <ContextualLoading message="Preparing your performance report..." skeleton={<ListSkeleton count={4} />} />
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
                  <Text style={styles.subjectEmpty}>Not attempted yet</Text>
                ) : (
                  <AnimatedProgressBar
                    progress={subject.accuracyPercent / 100}
                    fillColor={scoreColor(subject.accuracyPercent)}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.subjectPercent,
                  subject.accuracyPercent !== null && { color: scoreColor(subject.accuracyPercent) },
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
        <Text style={styles.historyLinkText}>View full session history</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.brand.primary} />
      </PressableScale>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
