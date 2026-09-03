import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { getLatestDiagnosticAttempt, type DiagnosticAttemptRecord } from "../db/diagnosticAttempts";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ContextualLoading } from "../ui/ContextualLoading";
import { CardSkeleton } from "../ui/Skeleton";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";

const STATE_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  LEARNING: "Learning",
  PRACTICING: "Practicing",
  MASTERED: "Strong",
  NEEDS_REVISION: "Needs revision",
};

function toneFor(state: string, colors: Theme["colors"]) {
  if (state === "MASTERED") return colors.semantic.success;
  if (state === "NEEDS_REVISION") return colors.semantic.warning;
  if (state === "PRACTICING") return colors.brand.light;
  return colors.text.muted;
}

/** Results for the diagnostic just completed by diagnostic-test.tsx — read back as "the
 * latest attempt for this exam" rather than passed through route params, since the
 * per-topic breakdown is too large to serialize cleanly into a URL. */
export default function DiagnosticResultScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const router = useRouter();
  const { examCode, examName } = useLocalSearchParams<{ examCode: string; examName?: string }>();

  const [attempt, setAttempt] = useState<DiagnosticAttemptRecord | null | undefined>(undefined);

  useEffect(() => {
    if (!examCode) return;
    getLatestDiagnosticAttempt(examCode).then(setAttempt);
  }, [examCode]);

  if (attempt === undefined) {
    return (
      <View style={styles.screen}>
        <ContextualLoading message="Loading results..." skeleton={<CardSkeleton height={220} />} />
      </View>
    );
  }

  const accuracy = attempt ? Math.round((attempt.correctCount / attempt.questionCount) * 100) : 0;
  const sorted = attempt ? [...attempt.perTopic].sort((a, b) => a.correctCount / a.totalCount - b.correctCount / b.totalCount) : [];

  return (
    <>
      <Stack.Screen options={{ title: "Diagnostic Results", headerBackVisible: false }} />
      <ScrollView contentContainerStyle={styles.container}>
        {!attempt ? (
          <Text style={styles.emptyText}>No diagnostic attempt found.</Text>
        ) : (
          <>
            <Card variant="gradient" style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Overall</Text>
              <Text style={styles.summaryScore}>
                {attempt.correctCount}/{attempt.questionCount} ({accuracy}%)
              </Text>
            </Card>

            {sorted.length > 0 && (
              <Text style={styles.weakAreaNote}>
                Your weakest area right now is <Text style={styles.weakAreaHighlight}>{sorted[0].topicName}</Text> in{" "}
                {sorted[0].subjectName} — start there.
              </Text>
            )}

            <Text style={styles.sectionLabel}>By topic — weakest first</Text>
            <Card variant="container" style={styles.card}>
              {sorted.map((t, i) => (
                <View key={t.topicId} style={[styles.topicRow, i > 0 && styles.topicRowBorder]}>
                  <Ionicons name="ellipse" size={10} color={toneFor(t.state, colors)} />
                  <View style={styles.topicInfo}>
                    <Text style={styles.topicName}>{t.topicName}</Text>
                    <Text style={styles.topicSubject}>{t.subjectName}</Text>
                  </View>
                  <View style={styles.topicScore}>
                    <Text style={[styles.topicScoreText, { color: toneFor(t.state, colors) }]}>
                      {t.correctCount}/{t.totalCount}
                    </Text>
                    <Text style={styles.topicStateText}>{STATE_LABEL[t.state] ?? t.state}</Text>
                  </View>
                </View>
              ))}
            </Card>

            <Text style={styles.footNote}>
              These results have already updated your topic mastery — check the Prepare section on
              the {examName || "exam"} Guide for what to study next.
            </Text>
          </>
        )}

        <Button
          size="lg"
          style={styles.doneButton}
          onPress={() => router.replace({ pathname: "/exam-guide", params: { examCode, examName: examName ?? "" } })}
        >
          Back to Exam Guide
        </Button>
      </ScrollView>
    </>
  );
}

const buildStyles = ({ colors, spacing: sp, typography }: Theme) =>
  StyleSheet.create({
    screen: { flex: 1 },
    container: { padding: sp.xl, paddingBottom: sp["3xl"] },
    emptyText: { fontSize: 14, color: colors.text.muted, textAlign: "center", marginTop: sp["3xl"] },
    summaryCard: { alignItems: "center", paddingVertical: sp.xl },
    summaryLabel: { fontSize: 13, color: "rgba(255,255,255,0.75)" },
    summaryScore: { fontSize: 28, fontWeight: "700", color: colors.text.onAccent, marginTop: sp.xs },
    sectionLabel: { ...typography.secondary, marginTop: sp.xl, marginBottom: sp.sm, fontWeight: "700" },
    weakAreaNote: { fontSize: 13, color: colors.text.secondary, lineHeight: 19, marginTop: sp.lg },
    weakAreaHighlight: { fontWeight: "700", color: colors.text.primary },
    card: { marginTop: sp.sm },
    topicRow: { flexDirection: "row", alignItems: "center", gap: sp.md, padding: sp.md + 2 },
    topicRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    topicInfo: { flex: 1 },
    topicName: { fontSize: 14, fontWeight: "600", color: colors.text.primary },
    topicSubject: { fontSize: 12, color: colors.text.muted, marginTop: 2 },
    topicScore: { alignItems: "flex-end" },
    topicScoreText: { fontSize: 14, fontWeight: "700" },
    topicStateText: { fontSize: 11, color: colors.text.muted, marginTop: 2 },
    footNote: { fontSize: 12, color: colors.text.muted, marginTop: sp.xl, lineHeight: 17, fontStyle: "italic" },
    doneButton: { marginTop: sp.xl },
  });
