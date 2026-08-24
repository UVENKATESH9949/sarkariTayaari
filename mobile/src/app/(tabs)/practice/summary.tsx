import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { useSessionHistory } from "../../../practice/sessionHistory";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { colors, radius, spacing, typography } from "../../../ui/theme";

function scoreTone(accuracyPercent: number): { text: string; bg: string } {
  if (accuracyPercent >= 70) return { text: colors.semantic.success, bg: colors.semantic.successBg };
  if (accuracyPercent >= 40) return { text: colors.semantic.warning, bg: colors.semantic.warningBg };
  return { text: colors.semantic.error, bg: colors.semantic.errorBg };
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
  const tone = scoreTone(accuracyPercent);

  return (
    <>
      <Stack.Screen options={{ title: "Session Summary" }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.scoreCircle, { backgroundColor: tone.bg }]}>
          <Text style={[styles.scoreText, { color: tone.text }]}>
            {session.correctCount}/{session.totalCount}
          </Text>
        </View>
        <Text style={[styles.accuracyText, { color: tone.text }]}>{accuracyPercent}% accuracy</Text>
        <Text style={styles.contextText}>
          {session.subjectName} · {session.topicName} · {session.levelLabel}
        </Text>

        <Text style={[typography.label, styles.sectionLabel]}>Question by question</Text>
        <View style={styles.list}>
          {session.results.map((result, index) => (
            <Card key={result.questionId} style={styles.resultRow}>
              <View
                style={[
                  styles.resultIcon,
                  { backgroundColor: result.isCorrect ? colors.semantic.success : colors.semantic.error },
                ]}
              >
                <Ionicons name={result.isCorrect ? "checkmark" : "close"} size={14} color={colors.text.onAccent} />
              </View>
              <Text style={styles.resultText} numberOfLines={2}>
                {index + 1}. {result.questionText}
              </Text>
            </Card>
          ))}
        </View>

        <Button variant="secondary" size="lg" onPress={() => router.push("/practice/history")} style={styles.secondaryButton}>
          View Session History
        </Button>

        <Button size="lg" onPress={() => router.replace("/practice")} style={styles.primaryButton}>
          Back to Practice
        </Button>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    paddingTop: spacing["2xl"],
    alignItems: "center",
    paddingBottom: spacing["4xl"],
  },
  emptyScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    ...typography.secondary,
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
    marginTop: spacing.md + 2,
    fontSize: 16,
    fontWeight: "700",
  },
  contextText: {
    marginTop: spacing.xs + 2,
    fontSize: 13,
    color: colors.text.muted,
    textAlign: "center",
  },
  sectionLabel: {
    alignSelf: "flex-start",
    marginTop: spacing["2xl"],
    marginBottom: spacing.md,
  },
  list: {
    width: "100%",
    gap: spacing.sm + 2,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm + 2,
    padding: spacing.md,
    borderRadius: radius.sm + 2,
  },
  resultIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  resultText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
    lineHeight: 19,
  },
  secondaryButton: {
    width: "100%",
    marginTop: spacing["2xl"],
  },
  primaryButton: {
    width: "100%",
    marginTop: spacing.md,
  },
});
