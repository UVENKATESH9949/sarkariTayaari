import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View, StyleSheet } from "react-native";
import { getFollowedExam } from "../../db/followedExams";
import { useBookmarks } from "../../practice/bookmarks";
import { useSessionHistory } from "../../practice/sessionHistory";
import { getWrongAnswers } from "../../practice/wrongAnswers";
import { useSyncStatus } from "../../sync/SyncContext";

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

      <Pressable style={styles.continueButton} onPress={() => router.push("/practice")}>
        <Text style={styles.continueButtonText}>Continue Practice</Text>
      </Pressable>

      <Pressable style={styles.readinessCard} onPress={() => router.push("/progress")}>
        <View>
          <Text style={styles.readinessLabel}>Your readiness</Text>
          <Text style={styles.readinessPercent}>{MOCK.readinessPercent}%</Text>
        </View>
        <View style={styles.readinessCta}>
          <Text style={styles.readinessCtaText}>View progress</Text>
          <Ionicons name="chevron-forward" size={16} color="#1a2b4a" />
        </View>
      </Pressable>

      <Text style={styles.sectionLabel}>Revise</Text>
      <View style={styles.reviseRow}>
        <Pressable
          style={({ pressed }) => [styles.reviseCard, pressed && styles.reviseCardPressed]}
          onPress={() => router.push({ pathname: "/revise", params: { initialTab: "bookmarks" } })}
        >
          <Ionicons name="star" size={20} color="#e8a63c" />
          <Text style={styles.reviseCount}>{bookmarks.length}</Text>
          <Text style={styles.reviseLabel}>Bookmarked</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.reviseCard, pressed && styles.reviseCardPressed]}
          onPress={() => router.push({ pathname: "/revise", params: { initialTab: "wrong" } })}
        >
          <Ionicons name="close-circle" size={20} color="#c94f4f" />
          <Text style={styles.reviseCount}>{wrongAnswerCount}</Text>
          <Text style={styles.reviseLabel}>Wrong Answers</Text>
        </Pressable>
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
  reviseCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 14,
    padding: 16,
  },
  reviseCardPressed: {
    backgroundColor: "#f5f6f9",
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
