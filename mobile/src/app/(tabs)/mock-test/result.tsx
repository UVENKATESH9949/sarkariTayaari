import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { getMockTestAttempt, type MockTestAttemptRecord } from "../../../db/mockTest";
import { toSubjectMeta } from "../../../constants/subjects";
import { getAllSubjects, type SubjectMetaRow } from "../../../db/subjectMeta";
import { Button } from "../../../ui/Button";
import { CardSkeleton } from "../../../ui/Skeleton";
import { colors, spacing } from "../../../ui/theme";

function scoreTone(percent: number): { text: string; bg: string } {
  if (percent >= 70) return { text: colors.semantic.success, bg: colors.semantic.successBg };
  if (percent >= 40) return { text: colors.semantic.warning, bg: colors.semantic.warningBg };
  return { text: colors.semantic.error, bg: colors.semantic.errorBg };
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
      <View style={styles.container}>
        <CardSkeleton height={110} />
        <View style={[styles.statRow, { marginTop: spacing.base }]}>
          <CardSkeleton height={72} />
          <CardSkeleton height={72} />
          <CardSkeleton height={72} />
        </View>
      </View>
    );
  }

  const maxMarks = attempt.totalQuestions * attempt.marksCorrect;
  const scorePercent = maxMarks > 0 ? Math.round((attempt.totalMarksScored / maxMarks) * 100) : 0;
  const tone = scoreTone(scorePercent);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={[styles.scoreCard, { backgroundColor: tone.bg }]}>
        <Text style={[styles.scoreValue, { color: tone.text }]}>
          {attempt.totalMarksScored} / {maxMarks}
        </Text>
        <Text style={[styles.scoreLabel, { color: tone.text }]}>marks scored</Text>
      </View>

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.semantic.success }]}>{attempt.correctCount}</Text>
          <Text style={styles.statLabel}>Correct</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.semantic.error }]}>{attempt.wrongCount}</Text>
          <Text style={styles.statLabel}>Wrong</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.text.muted }]}>{attempt.unattemptedCount}</Text>
          <Text style={styles.statLabel}>Unattempted</Text>
        </View>
      </View>

      <View style={styles.timeRow}>
        <Ionicons name="time-outline" size={16} color={colors.text.muted} />
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
                    color={status === "correct" ? colors.semantic.success : status === "wrong" ? colors.semantic.error : colors.text.muted}
                  />
                  <Text style={styles.cardTag}>
                    {index + 1}. {r.subjectName}
                  </Text>
                  {r.markedForReview && <Ionicons name="bookmark" size={14} color={colors.semantic.warning} />}
                </View>
                <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.text.muted} />
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
                          {isCorrect && <Ionicons name="checkmark-circle" size={18} color={colors.semantic.success} />}
                          {isPickedWrong && <Ionicons name="close-circle" size={18} color={colors.semantic.error} />}
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

      <Button size="lg" onPress={() => router.replace("/mock-test")}>
        Back to Mock Test
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 24,
    paddingBottom: 40,
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
    backgroundColor: colors.surfaceElevated2,
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
    color: colors.text.muted,
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
    color: colors.text.muted,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.muted,
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
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text.primary,
  },
  sectionStats: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  list: {
    gap: 12,
    marginBottom: 24,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text.secondary,
  },
  cardQuestion: {
    fontSize: 15,
    color: colors.text.primary,
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
    borderColor: colors.border,
    borderRadius: 10,
    padding: 11,
  },
  optionCorrect: {
    borderColor: colors.semantic.success,
    backgroundColor: colors.semantic.successBg,
  },
  optionWrong: {
    borderColor: colors.semantic.error,
    backgroundColor: colors.semantic.errorBg,
  },
  optionText: {
    fontSize: 13,
    color: colors.text.primary,
    flex: 1,
  },
  explanationBox: {
    marginTop: 12,
    backgroundColor: colors.surfaceElevated2,
    borderRadius: 10,
    padding: 12,
  },
  explanationLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  explanationText: {
    fontSize: 13,
    color: colors.text.primary,
    lineHeight: 19,
  },
});
