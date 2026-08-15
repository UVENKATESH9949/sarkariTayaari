import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { getSyncedExams } from "../../../db/practiceContent";
import { getMockablePapers, type SyncedPaper } from "../../../db/examStructure";
import { useSyncStatus } from "../../../sync/SyncContext";

type ListedPaper = SyncedPaper & { examName: string };

export default function MockTestLanding() {
  const router = useRouter();
  const [papers, setPapers] = useState<ListedPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const { syncVersion } = useSyncStatus();

  // One entry per mock-testable paper, not per exam: an exam can have several
  // (Prelims and Mains), and descriptive or interview papers are excluded entirely.
  useEffect(() => {
    (async () => {
      try {
        const exams = await getSyncedExams();
        const collected: ListedPaper[] = [];
        for (const exam of exams) {
          const mockable = await getMockablePapers(exam.code);
          mockable.forEach((paper) => collected.push({ ...paper, examName: exam.name }));
        }
        setPapers(collected);
      } finally {
        setLoading(false);
      }
    })();
  }, [syncVersion]);

  const openStart = (paper: ListedPaper) => {
    router.push({
      pathname: "/mock-test/start",
      params: {
        paperId: paper.id,
        examCode: paper.examCode,
        examLabel: paper.examName,
        paperName: paper.name,
      },
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Full-length Mock Tests</Text>
      <Text style={styles.subheading}>
        Timed, exam-pattern tests with real negative marking — just like the real thing.
      </Text>

      {loading && <ActivityIndicator />}

      {!loading && (
        <View style={styles.list}>
          {papers.map((paper) => {
            const totalQuestions = paper.sections.reduce((sum, s) => sum + s.questionCount, 0);
            const marking =
              paper.marksCorrect != null ? ` · +${paper.marksCorrect}/-${paper.marksWrong ?? 0} marking` : "";
            return (
              <Pressable
                key={paper.id}
                onPress={() => openStart(paper)}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <View style={styles.cardIconCircle}>
                  <Ionicons name="timer-outline" size={24} color="#ffffff" />
                </View>
                <View style={styles.cardTextBlock}>
                  <Text style={styles.cardTitle}>
                    {paper.examName} — {paper.name}
                  </Text>
                  <Text style={styles.cardSubtitle}>
                    {paper.stageName} · {totalQuestions} questions
                    {paper.durationMinutes != null ? ` · ${paper.durationMinutes} min` : ""}
                    {marking}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#c3cadb" />
              </Pressable>
            );
          })}

          {papers.length === 0 && (
            <Text style={styles.emptyText}>
              No mock tests yet. An exam needs a paper defined in its structure before a test can be built from it.
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a2b4a",
  },
  subheading: {
    marginTop: 6,
    fontSize: 13,
    color: "#8a94a6",
    marginBottom: 24,
    lineHeight: 19,
  },
  list: {
    gap: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#1a2b4a",
    borderRadius: 14,
    padding: 16,
  },
  cardPressed: {
    backgroundColor: "#142138",
  },
  cardIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTextBlock: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#c3cadb",
    marginTop: 3,
  },
  emptyText: {
    fontSize: 13,
    color: "#8a94a6",
    textAlign: "center",
    paddingVertical: 20,
  },
});
