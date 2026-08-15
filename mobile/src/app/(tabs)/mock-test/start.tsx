import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { getSectionAvailability, type SectionAvailability } from "../../../db/mockTest";
import { getPaperById, type SyncedPaper } from "../../../db/examStructure";

export default function MockTestStart() {
  const router = useRouter();
  const { paperId, examLabel, paperName } = useLocalSearchParams<{
    paperId: string;
    examCode: string;
    examLabel: string;
    paperName: string;
  }>();
  const [paper, setPaper] = useState<SyncedPaper | null>(null);
  const [sections, setSections] = useState<SectionAvailability[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!paperId) return;
    (async () => {
      try {
        const loaded = await getPaperById(paperId);
        setPaper(loaded);
        if (loaded) setSections(await getSectionAvailability(loaded));
      } finally {
        setLoading(false);
      }
    })();
  }, [paperId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!paper) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>This paper is no longer part of the exam's structure.</Text>
      </View>
    );
  }

  const totalAvailable = sections?.reduce((sum, s) => sum + s.available, 0) ?? null;
  const totalRequested = paper.sections.reduce((sum, s) => sum + s.questionCount, 0);
  const isCapped = totalAvailable !== null && totalAvailable < totalRequested;
  const canStart = totalAvailable !== null && totalAvailable > 0;
  // Sections with their own limit are summed; otherwise the paper's overall time applies.
  const sectionallyTimed = paper.sections.some((s) => s.isSectionallyTimed);
  const totalMinutes = sectionallyTimed
    ? paper.sections.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0)
    : paper.durationMinutes;

  const startTest = () => {
    router.push({ pathname: "/mock-test/test", params: { paperId, examLabel, paperName } });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.examName}>
        {examLabel} — {paper.name}
      </Text>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Ionicons name="time-outline" size={20} color="#1a2b4a" />
          <Text style={styles.summaryValue}>{totalMinutes != null ? `${totalMinutes} min` : "—"}</Text>
          <Text style={styles.summaryLabel}>{sectionallyTimed ? "Total (sectional)" : "Duration"}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Ionicons name="help-circle-outline" size={20} color="#1a2b4a" />
          <Text style={styles.summaryValue}>{totalAvailable ?? totalRequested}</Text>
          <Text style={styles.summaryLabel}>Questions</Text>
        </View>
        <View style={styles.summaryCard}>
          <Ionicons name="ribbon-outline" size={20} color="#1a2b4a" />
          <Text style={styles.summaryValue}>
            {paper.marksCorrect != null ? `+${paper.marksCorrect}/-${paper.marksWrong ?? 0}` : "—"}
          </Text>
          <Text style={styles.summaryLabel}>Marking</Text>
        </View>
      </View>

      {isCapped && (
        <View style={styles.cappedNote}>
          <Ionicons name="information-circle-outline" size={16} color="#c9861f" />
          <Text style={styles.cappedNoteText}>
            Only {totalAvailable} of the usual {totalRequested} questions are available today — more content is
            added over time.
          </Text>
        </View>
      )}

      <Text style={styles.sectionsHeading}>Sections</Text>
      <View style={styles.sectionsList}>
        {paper.sections.map((section) => {
          const availability = sections?.find((s) => s.sectionName === section.name);
          return (
            <View key={section.id} style={styles.sectionRow}>
              <View style={[styles.sectionIconCircle, { backgroundColor: "#eef1f8" }]}>
                <Ionicons name="layers-outline" size={18} color="#5a6a85" />
              </View>
              <Text style={styles.sectionName}>
                {section.name}
                {section.isSectionallyTimed ? ` · ${section.durationMinutes} min` : ""}
              </Text>
              <Text style={styles.sectionCount}>
                {availability ? `${availability.available} questions` : "…"}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.instructionsBox}>
        <Text style={styles.instructionsTitle}>Before you start</Text>
        <Text style={styles.instructionsItem}>• The timer starts as soon as you tap Start and auto-submits at zero.</Text>
        <Text style={styles.instructionsItem}>• Answers aren't shown right or wrong until you submit — just like the real exam.</Text>
        {paper.marksWrong != null && paper.marksWrong > 0 && (
          <Text style={styles.instructionsItem}>
            • Wrong answers cost {paper.marksWrong} marks — skip if you're unsure rather than guessing blindly.
          </Text>
        )}
        {sectionallyTimed && (
          <Text style={styles.instructionsItem}>• This paper is sectionally timed — each section has its own limit.</Text>
        )}
        <Text style={styles.instructionsItem}>• Use the question navigator to jump around and mark questions for review.</Text>
      </View>

      <Pressable
        disabled={!canStart}
        onPress={startTest}
        style={({ pressed }) => [styles.startButton, !canStart && styles.startButtonDisabled, pressed && canStart && styles.startButtonPressed]}
      >
        <Text style={styles.startButtonText}>{canStart ? "Start Test" : "Not enough questions yet"}</Text>
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
    fontSize: 13,
    color: "#8a94a6",
    textAlign: "center",
  },
  examName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a2b4a",
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#eef1f8",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1a2b4a",
  },
  summaryLabel: {
    fontSize: 11,
    color: "#5a6a85",
  },
  cappedNote: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#fdf3e2",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  cappedNoteText: {
    flex: 1,
    fontSize: 12,
    color: "#8a6420",
    lineHeight: 17,
  },
  sectionsHeading: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8a94a6",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  sectionsList: {
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
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1a2b4a",
  },
  sectionCount: {
    fontSize: 12,
    color: "#8a94a6",
  },
  instructionsBox: {
    backgroundColor: "#f5f6f9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 6,
  },
  instructionsTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1a2b4a",
    marginBottom: 4,
  },
  instructionsItem: {
    fontSize: 12,
    color: "#5a6a85",
    lineHeight: 18,
  },
  startButton: {
    backgroundColor: "#1a2b4a",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  startButtonPressed: {
    backgroundColor: "#142138",
  },
  startButtonDisabled: {
    backgroundColor: "#c7cee0",
  },
  startButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
