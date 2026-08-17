import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View, StyleSheet } from "react-native";
import { getFollowedExam } from "../../db/followedExams";
import { useBookmarks } from "../../practice/bookmarks";
import { useSessionHistory } from "../../practice/sessionHistory";
import { getWrongAnswers } from "../../practice/wrongAnswers";
import { useSyncStatus } from "../../sync/SyncContext";
import { PressableScale } from "../../ui/PressableScale";
import { FadeInItem } from "../../ui/FadeInList";

// Streak/readiness are still mock — real streak computation and the final
// readiness formula haven't been decided yet (see Progress for the real,
// computed readiness score). The followed exam name and Revise counts below are real.
const MOCK = {
  streakDays: 3,
  readinessPercent: 62,
};

export default function Home() {
  const router = useRouter();
  const [followedExamName, setFollowedExamName] = useState<string | null>(null);
  const { bookmarks } = useBookmarks();
  const { sessions } = useSessionHistory();
  const { isRefreshing, refresh } = useSyncStatus();

  useEffect(() => {
    getFollowedExam().then((exam) => setFollowedExamName(exam?.name ?? null));
  }, []);

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
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.greeting}>Welcome back 👋</Text>
      <Text style={styles.title}>SarkariTaiyaari</Text>

      <View style={styles.streakCard}>
        <Ionicons name="flame" size={22} color="#e8823c" />
        <Text style={styles.streakText}>{MOCK.streakDays}-day streak</Text>
      </View>

      <View style={styles.examCard}>
        <Text style={styles.examLabel}>Preparing for</Text>
        <Text style={styles.examName}>{followedExamName ?? " "}</Text>
      </View>

      <PressableScale style={styles.continueButton} onPress={() => router.push("/practice")}>
        <Text style={styles.continueButtonText}>Continue Practice</Text>
      </PressableScale>

      <PressableScale style={styles.readinessCard} onPress={() => router.push("/progress")}>
        <View>
          <Text style={styles.readinessLabel}>Your readiness</Text>
          <Text style={styles.readinessPercent}>{MOCK.readinessPercent}%</Text>
        </View>
        <View style={styles.readinessCta}>
          <Text style={styles.readinessCtaText}>View progress</Text>
          <Ionicons name="chevron-forward" size={16} color="#1a2b4a" />
        </View>
      </PressableScale>

      <Text style={styles.sectionLabel}>Revise</Text>
      <View style={styles.reviseRow}>
        <FadeInItem index={0} style={styles.reviseItem}>
          <PressableScale
            style={styles.reviseCard}
            onPress={() => router.push({ pathname: "/revise", params: { initialTab: "bookmarks" } })}
          >
            <Ionicons name="star" size={20} color="#e8a63c" />
            <Text style={styles.reviseCount}>{bookmarks.length}</Text>
            <Text style={styles.reviseLabel}>Bookmarked</Text>
          </PressableScale>
        </FadeInItem>
        <FadeInItem index={1} style={styles.reviseItem}>
          <PressableScale
            style={styles.reviseCard}
            onPress={() => router.push({ pathname: "/revise", params: { initialTab: "wrong" } })}
          >
            <Ionicons name="close-circle" size={20} color="#c94f4f" />
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
    padding: 24,
    paddingTop: 32,
    paddingBottom: 48,
    gap: 16,
  },
  greeting: {
    fontSize: 15,
    color: "#5a6a85",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1a2b4a",
    marginBottom: 8,
  },
  streakCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff3e9",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
  },
  streakText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#a85d20",
  },
  examCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 14,
    padding: 18,
  },
  examLabel: {
    fontSize: 13,
    color: "#8a94a6",
  },
  examName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a2b4a",
    marginTop: 4,
  },
  continueButton: {
    backgroundColor: "#1a2b4a",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  continueButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  readinessCard: {
    backgroundColor: "#eef1f8",
    borderRadius: 14,
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  readinessLabel: {
    fontSize: 13,
    color: "#5a6a85",
  },
  readinessPercent: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a2b4a",
    marginTop: 2,
  },
  readinessCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  readinessCtaText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a2b4a",
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8a94a6",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  reviseRow: {
    flexDirection: "row",
    gap: 12,
  },
  // Carries the flex share; reviseCard fills whatever width that gives it. Same
  // wrapper-vs-child sizing trap as the Practice grid — see FadeInItem's own comment.
  reviseItem: {
    flex: 1,
  },
  reviseCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 14,
    padding: 16,
  },
  reviseCount: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a2b4a",
    marginTop: 8,
  },
  reviseLabel: {
    fontSize: 12,
    color: "#8a94a6",
    marginTop: 2,
  },
});
