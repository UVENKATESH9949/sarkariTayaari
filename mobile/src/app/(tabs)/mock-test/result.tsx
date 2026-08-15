import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { getMockTestAttempt, type MockTestAttemptRecord } from "../../../db/mockTest";
import { toSubjectMeta } from "../../../constants/subjects";
import { getAllSubjects, type SubjectMetaRow } from "../../../db/subjectMeta";

function scoreColor(percent: number): { text: string; bg: string } {
  if (percent >= 70) return { text: "#2f9e64", bg: "#e8f7f0" };
  if (percent >= 40) return { text: "#c9861f", bg: "#fdf3e2" };
  return { text: "#c94f4f", bg: "#fdecec" };
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export default function MockTestResult() {
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
      if (r.selectedIndex === null) bucket.unattempted += 1;
      else if (r.selectedIndex === r.correctIndex) bucket.correct += 1;
      else bucket.wrong += 1;
      bySubject.set(r.subjectName, bucket);
    }
    return Array.from(bySubject.entries()).map(([subjectName, b]) => ({ subjectName, ...b }));
  }, [attempt]);

  if (!attempt) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Loading result…</Text>
      </View>
    );
  }

  const maxMarks = attempt.totalQuestions * attempt.marksCorrect;
  const scorePercent = maxMarks > 0 ? Math.round((attempt.totalMarksScored / maxMarks) * 100) : 0;
  const colors = scoreColor(scorePercent);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={[styles.scoreCard, { backgroundColor: colors.bg }]}>
        <Text style={[styles.scoreValue, { color: colors.text }]}>
          {attempt.totalMarksScored} / {maxMarks}
        </Text>
        <Text style={[styles.scoreLabel, { color: colors.text }]}>marks scored</Text>
      </View>

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#2f9e64" }]}>{attempt.correctCount}</Text>
          <Text style={styles.statLabel}>Correct</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#c94f4f" }]}>{attempt.wrongCount}</Text>
          <Text style={styles.statLabel}>Wrong</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#8a94a6" }]}>{attempt.unattemptedCount}</Text>
          <Text style={styles.statLabel}>Unattempted</Text>
        </View>
      </View>

      <View style={styles.timeRow}>
        <Ionicons name="time-outline" size={16} color="#8a94a6" />
        <Text style={styles.timeText}>
          {formatDuration(attempt.timeTakenSeconds)} of {formatDuration(attempt.durationSeconds)} used
        </Text>
      </View>

      <Text style={styles.sectionHeading}>Section-wise breakdown</Text>
      <View style={styles.sectionList}>
        {sectionBreakdown.map((s) => {
          const meta = toSubjectMeta(
            subjectStyles.find((row) => row.name === s.subjectName),
            s.subjectName,
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

      <Text style={styles.sectionHeading}>Question by question</Text>
      <View style={styles.list}>
        {attempt.results.map((r, index) => {
          const isExpanded = expandedId === r.questionId;
          const status = r.selectedIndex === null ? "unattempted" : r.selectedIndex === r.correctIndex ? "correct" : "wrong";
          return (
            <Pressable
              key={r.questionId}
              style={styles.card}
              onPress={() => setExpandedId(isExpanded ? null : r.questionId)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Ionicons
                    name={
                      status === "correct"
                        ? "checkmark-circle"
                        : status === "wrong"
                          ? "close-circle"
                          : "remove-circle-outline"
                    }
                    size={18}
                    color={status === "correct" ? "#2f9e64" : status === "wrong" ? "#c94f4f" : "#8a94a6"}
                  />
                  <Text style={styles.cardTag}>
                    {index + 1}. {r.subjectName}
                  </Text>
                  {r.markedForReview && <Ionicons name="bookmark" size={14} color="#c9861f" />}
                </View>
                <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color="#8a94a6" />
              </View>
              <Text style={styles.cardQuestion} numberOfLines={isExpanded ? undefined : 2}>
                {r.questionText}
              </Text>

              {isExpanded && (
                <View style={styles.expandedContent}>
                  <View style={styles.optionsList}>
                    {r.options.map((option, optIndex) => {
                      const isCorrect = optIndex === r.correctIndex;
                      const isPickedWrong = r.selectedIndex === optIndex && optIndex !== r.correctIndex;
                      return (
                        <View
                          key={optIndex}
                          style={[
                            styles.optionRow,
                            isCorrect && styles.optionCorrect,
                            isPickedWrong && styles.optionWrong,
                          ]}
                        >
                          <Text style={styles.optionText}>{option}</Text>
                          {isCorrect && <Ionicons name="checkmark-circle" size={18} color="#2f9e64" />}
                          {isPickedWrong && <Ionicons name="close-circle" size={18} color="#c94f4f" />}
                        </View>
                      );
                    })}
                  </View>
                  <View style={styles.explanationBox}>
                    <Text style={styles.explanationLabel}>Explanation</Text>
                    <Text style={styles.explanationText}>{r.explanation}</Text>
                  </View>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.backButton} onPress={() => router.replace("/mock-test")}>
        <Text style={styles.backButtonText}>Back to Mock Test</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 14,
    color: "#8a94a6",
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
    backgroundColor: "#f5f6f9",
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
    color: "#8a94a6",
    marginTop: 2,
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
    color: "#8a94a6",
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8a94a6",
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
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
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
    color: "#1a2b4a",
  },
  sectionStats: {
    fontSize: 12,
    color: "#5a6a85",
  },
  list: {
    gap: 12,
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 14,
    padding: 16,
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
    color: "#5a6a85",
  },
  cardQuestion: {
    fontSize: 15,
    color: "#1a2b4a",
    lineHeight: 21,
  },
  expandedContent: {
    marginTop: 14,
  },
  optionsList: {
    gap: 8,
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 10,
    padding: 11,
  },
  optionCorrect: {
    borderColor: "#2f9e64",
    backgroundColor: "#e8f7f0",
  },
  optionWrong: {
    borderColor: "#c94f4f",
    backgroundColor: "#fdecec",
  },
  optionText: {
    fontSize: 13,
    color: "#1a2b4a",
    flex: 1,
  },
  explanationBox: {
    marginTop: 12,
    backgroundColor: "#eef1f8",
    borderRadius: 10,
    padding: 12,
  },
  explanationLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5a6a85",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  explanationText: {
    fontSize: 13,
    color: "#1a2b4a",
    lineHeight: 19,
  },
  backButton: {
    backgroundColor: "#1a2b4a",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  backButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
});
