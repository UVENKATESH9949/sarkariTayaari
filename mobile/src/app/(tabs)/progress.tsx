import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { useSessionHistory } from "../../practice/sessionHistory";
import { toSubjectMeta } from "../../constants/subjects";
import { getAllSubjects, type SubjectMetaRow } from "../../db/subjectMeta";

function scoreColor(percent: number) {
  if (percent >= 70) return "#2f9e64";
  if (percent >= 40) return "#c9861f";
  return "#c94f4f";
}

export default function Progress() {
  const router = useRouter();
  const { sessions } = useSessionHistory();
  // Breakdown covers whatever subjects are synced, not a fixed built-in list.
  const [syncedSubjects, setSyncedSubjects] = useState<SubjectMetaRow[]>([]);

  useEffect(() => {
    getAllSubjects().then(setSyncedSubjects).catch(() => setSyncedSubjects([]));
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Your Progress</Text>

      <View style={styles.readinessCard}>
        <View style={styles.readinessCircle}>
          <Text style={styles.readinessPercent}>{stats.readinessPercent}%</Text>
        </View>
        <View style={styles.readinessInfo}>
          <Text style={styles.readinessLabel}>Exam Readiness Score</Text>
          <Text style={styles.readinessHint}>
            {hasActivity
              ? "Based on your accuracy across all practice sessions."
              : "Complete a practice session to see your score."}
          </Text>
        </View>
      </View>

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

      <Text style={styles.sectionTitle}>Subject-wise accuracy</Text>
      <View style={styles.subjectList}>
        {stats.subjectBreakdown.map((subject) => (
          <View key={subject.name} style={styles.subjectRow}>
            <View style={[styles.subjectIconCircle, { backgroundColor: subject.iconBg }]}>
              <Ionicons name={subject.icon} size={18} color={subject.iconColor} />
            </View>
            <View style={styles.subjectInfo}>
              <Text style={styles.subjectName}>{subject.name}</Text>
              {subject.accuracyPercent === null ? (
                <Text style={styles.subjectEmpty}>Not attempted yet</Text>
              ) : (
                <View style={styles.subjectBarTrack}>
                  <View
                    style={[
                      styles.subjectBarFill,
                      { width: `${subject.accuracyPercent}%`, backgroundColor: scoreColor(subject.accuracyPercent) },
                    ]}
                  />
                </View>
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
        ))}
      </View>

      <Pressable style={styles.historyLink} onPress={() => router.push("/practice/history")}>
        <Text style={styles.historyLinkText}>View full session history</Text>
        <Ionicons name="chevron-forward" size={16} color="#1a2b4a" />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: 48,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a2b4a",
    marginBottom: 20,
  },
  readinessCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "#1a2b4a",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  readinessCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  readinessPercent: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  readinessInfo: {
    flex: 1,
  },
  readinessLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  readinessHint: {
    fontSize: 12,
    color: "#c7cee0",
    marginTop: 4,
    lineHeight: 17,
  },
  statRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#f5f6f9",
    borderRadius: 14,
    padding: 16,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a2b4a",
  },
  statLabel: {
    fontSize: 12,
    color: "#5a6a85",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a2b4a",
    marginBottom: 12,
  },
  subjectList: {
    gap: 14,
  },
  subjectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
    color: "#1a2b4a",
    marginBottom: 6,
  },
  subjectEmpty: {
    fontSize: 12,
    color: "#8a94a6",
    fontStyle: "italic",
  },
  subjectBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#e2e6ee",
    overflow: "hidden",
  },
  subjectBarFill: {
    height: 6,
    borderRadius: 3,
  },
  subjectPercent: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8a94a6",
    width: 40,
    textAlign: "right",
  },
  historyLink: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 28,
    paddingVertical: 12,
  },
  historyLinkText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a2b4a",
  },
});
