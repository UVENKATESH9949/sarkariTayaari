import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getFollowedExam } from "../../db/followedExams";
import { useBookmarks } from "../../practice/bookmarks";
import { useSessionHistory } from "../../practice/sessionHistory";
import { getWrongAnswers } from "../../practice/wrongAnswers";
import { useSyncStatus } from "../../sync/SyncContext";
import { PressableScale } from "../../ui/PressableScale";
import { FadeInItem } from "../../ui/FadeInList";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { colors, radius, spacing, typography } from "../../ui/theme";

// Streak/readiness are still mock — real streak computation and the final
// readiness formula haven't been decided yet (see Progress for the real,
// computed readiness score). The followed exam name and Revise counts below are real.
const MOCK = {
  streakDays: 3,
  readinessPercent: 62,
};

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [followedExamName, setFollowedExamName] = useState<string | null>(null);
  const { bookmarks } = useBookmarks();
  const { sessions } = useSessionHistory();
  const { isRefreshing, refresh, syncVersion } = useSyncStatus();

  useEffect(() => {
    getFollowedExam().then((exam) => setFollowedExamName(exam?.name ?? null));
    // syncVersion in deps: previously missing, so this never picked up a followed-exam
    // change from a background sync — only from manual pull-to-refresh below.
  }, [syncVersion]);

  const wrongAnswerCount = useMemo(() => getWrongAnswers(sessions).length, [sessions]);

  // Pull to refresh forces a check, bypassing the staleness window — this is the
  // user explicitly asking, so "synced recently" isn't a reason to do nothing.
  const onRefresh = async () => {
    await refresh({ force: true });
    const exam = await getFollowedExam();
    setFollowedExamName(exam?.name ?? null);
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xl }]}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.greeting}>Welcome back 👋</Text>
      <Text style={styles.title}>SarkariTaiyaari</Text>

      <View style={styles.streakCard}>
        <Ionicons name="flame" size={22} color={colors.semantic.warning} />
        <Text style={styles.streakText}>{MOCK.streakDays}-day streak</Text>
      </View>

      <Card style={styles.examCard}>
        <Text style={styles.examLabel}>Preparing for</Text>
        <Text style={styles.examName}>{followedExamName ?? " "}</Text>
      </Card>

      <Button size="lg" onPress={() => router.push("/practice")}>
        Continue Practice
      </Button>

      <Card variant="filled" onPress={() => router.push("/progress")} style={styles.readinessCard}>
        <View>
          <Text style={styles.readinessLabel}>Your readiness</Text>
          <Text style={styles.readinessPercent}>{MOCK.readinessPercent}%</Text>
        </View>
        <View style={styles.readinessCta}>
          <Text style={styles.readinessCtaText}>View progress</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.text.onAccent} />
        </View>
      </Card>

      <Text style={typography.label}>Revise</Text>
      <View style={styles.reviseRow}>
        <FadeInItem index={0} style={styles.reviseItem}>
          <PressableScale
            style={styles.reviseCard}
            onPress={() => router.push({ pathname: "/revise", params: { initialTab: "bookmarks" } })}
          >
            <Ionicons name="star" size={20} color={colors.semantic.warning} />
            <Text style={styles.reviseCount}>{bookmarks.length}</Text>
            <Text style={styles.reviseLabel}>Bookmarked</Text>
          </PressableScale>
        </FadeInItem>
        <FadeInItem index={1} style={styles.reviseItem}>
          <PressableScale
            style={styles.reviseCard}
            onPress={() => router.push({ pathname: "/revise", params: { initialTab: "wrong" } })}
          >
            <Ionicons name="close-circle" size={20} color={colors.semantic.error} />
            <Text style={styles.reviseCount}>{wrongAnswerCount}</Text>
            <Text style={styles.reviseLabel}>Wrong Answers</Text>
          </PressableScale>
        </FadeInItem>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing["3xl"],
    gap: spacing.base,
  },
  greeting: {
    ...typography.secondary,
  },
  title: {
    ...typography.pageTitle,
    marginBottom: spacing.sm,
  },
  streakCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.semantic.warningBg,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    alignSelf: "flex-start",
  },
  streakText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.semantic.warning,
  },
  examCard: {
    padding: spacing.lg,
  },
  examLabel: {
    ...typography.secondary,
  },
  examName: {
    ...typography.cardTitle,
    fontSize: 20,
    marginTop: spacing.xs,
  },
  readinessCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  readinessLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
  },
  readinessPercent: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text.onAccent,
    marginTop: 2,
  },
  readinessCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  readinessCtaText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.onAccent,
  },
  reviseRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  // Carries the flex share; reviseCard fills whatever width that gives it. Same
  // wrapper-vs-child sizing trap as the Practice grid — see FadeInItem's own comment.
  reviseItem: {
    flex: 1,
  },
  reviseCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  reviseCount: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
    marginTop: spacing.sm,
  },
  reviseLabel: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
});
