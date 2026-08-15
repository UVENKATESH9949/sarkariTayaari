import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { useSessionHistory } from "../../../practice/sessionHistory";

function scoreColor(accuracyPercent: number): { text: string; bg: string } {
  if (accuracyPercent >= 70) return { text: "#2f9e64", bg: "#e8f7f0" };
  if (accuracyPercent >= 40) return { text: "#c9861f", bg: "#fdf3e2" };
  return { text: "#c94f4f", bg: "#fdecec" };
}

export default function Summary() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { getSession } = useSessionHistory();
  const session = getSession(sessionId ?? "");

  if (!session) {
    return (
      <View style={styles.emptyScreen}>
        <Text style={styles.emptyText}>Session not found.</Text>
      </View>
    );
  }

  const accuracyPercent = Math.round((session.correctCount / session.totalCount) * 100);
  const colors = scoreColor(accuracyPercent);

  return (
    <>
      <Stack.Screen options={{ title: "Session Summary" }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.scoreCircle, { backgroundColor: colors.bg }]}>
          <Text style={[styles.scoreText, { color: colors.text }]}>
            {session.correctCount}/{session.totalCount}
          </Text>
        </View>
        <Text style={[styles.accuracyText, { color: colors.text }]}>{accuracyPercent}% accuracy</Text>
        <Text style={styles.contextText}>
          {session.subjectName} · {session.topicName} · {session.levelLabel}
        </Text>

        <Text style={styles.sectionLabel}>Question by question</Text>
        <View style={styles.list}>
          {session.results.map((result, index) => (
            <View key={result.questionId} style={styles.resultRow}>
              <View
                style={[
                  styles.resultIcon,
                  result.isCorrect ? styles.resultIconCorrect : styles.resultIconWrong,
                ]}
              >
                <Ionicons name={result.isCorrect ? "checkmark" : "close"} size={14} color="#ffffff" />
              </View>
              <Text style={styles.resultText} numberOfLines={2}>
                {index + 1}. {result.questionText}
              </Text>
            </View>
          ))}
        </View>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push("/practice/history")}
        >
          <Text style={styles.secondaryButtonText}>View Session History</Text>
        </Pressable>

        <Pressable style={styles.primaryButton} onPress={() => router.replace("/practice")}>
          <Text style={styles.primaryButtonText}>Back to Practice</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 32,
    alignItems: "center",
    paddingBottom: 48,
  },
  emptyScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#8a94a6",
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    fontSize: 30,
    fontWeight: "700",
  },
  accuracyText: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: "700",
  },
  contextText: {
    marginTop: 6,
    fontSize: 13,
    color: "#8a94a6",
    textAlign: "center",
  },
  sectionLabel: {
    alignSelf: "flex-start",
    marginTop: 32,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: "600",
    color: "#8a94a6",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  list: {
    width: "100%",
    gap: 10,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 10,
    padding: 12,
  },
  resultIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  resultIconCorrect: {
    backgroundColor: "#2f9e64",
  },
  resultIconWrong: {
    backgroundColor: "#c94f4f",
  },
  resultText: {
    flex: 1,
    fontSize: 13,
    color: "#1a2b4a",
    lineHeight: 19,
  },
  secondaryButton: {
    width: "100%",
    marginTop: 32,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1a2b4a",
  },
  secondaryButtonText: {
    color: "#1a2b4a",
    fontSize: 15,
    fontWeight: "600",
  },
  primaryButton: {
    width: "100%",
    marginTop: 12,
    backgroundColor: "#1a2b4a",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
});
