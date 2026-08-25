import { Stack, useRouter } from "expo-router";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { useSessionHistory } from "../../../practice/sessionHistory";
import type { SessionRecord } from "../../../practice/sessionHistory";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { colors, radius, spacing } from "../../../ui/theme";

function formatRelativeTime(timestampMs: number, nowMs: number): string {
  const diffMinutes = Math.floor((nowMs - timestampMs) / (1000 * 60));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

function scoreColor(accuracyPercent: number): string {
  if (accuracyPercent >= 70) return colors.semantic.success;
  if (accuracyPercent >= 40) return colors.semantic.warning;
  return colors.semantic.error;
}

function SessionRow({ session, nowMs, onPress }: { session: SessionRecord; nowMs: number; onPress: () => void }) {
  const accuracyPercent = Math.round((session.correctCount / session.totalCount) * 100);
  const color = scoreColor(accuracyPercent);

  return (
    <Card style={styles.row} onPress={onPress}>
      <View style={[styles.scoreBadge, { backgroundColor: color }]}>
        <Text style={styles.scoreBadgeText}>
          {session.correctCount}/{session.totalCount}
        </Text>
      </View>

      <View style={styles.rowTextBlock}>
        <Text style={styles.rowTitle}>
          {session.topicName} · {session.levelLabel}
        </Text>
        <Text style={styles.rowSubtitle}>
          {session.subjectName} · {session.examLabel}
        </Text>
        {session.results.length > 0 && (
          <View style={styles.dotsRow}>
            {session.results.map((r) => (
              <View
                key={r.questionId}
                style={[styles.dot, { backgroundColor: r.isCorrect ? colors.semantic.success : colors.semantic.error }]}
              />
            ))}
          </View>
        )}
      </View>

      <Text style={styles.rowTime}>{formatRelativeTime(session.completedAt, nowMs)}</Text>
    </Card>
  );
}

export default function History() {
  const router = useRouter();
  const { sessions } = useSessionHistory();
  const nowMs = Date.now();

  return (
    <>
      <Stack.Screen options={{ title: "Session History" }} />
      <ScrollView contentContainerStyle={styles.container}>
        {sessions.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title="No practice sessions yet"
            body="Finish a quiz to see it here."
          />
        ) : (
          <View style={styles.list}>
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                nowMs={nowMs}
                onPress={() => router.push({ pathname: "/practice/summary", params: { sessionId: session.id } })}
              />
            ))}
          </View>
        )}
        <Text style={styles.footerNote}>Showing up to your 50 most recent sessions.</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing["3xl"],
  },
  list: {
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  scoreBadge: {
    borderRadius: radius.sm + 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md - 2,
    minWidth: 50,
    alignItems: "center",
  },
  scoreBadgeText: {
    color: colors.text.onAccent,
    fontSize: 13,
    fontWeight: "700",
  },
  rowTextBlock: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.text.muted,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: spacing.xs + 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  rowTime: {
    fontSize: 11,
    color: colors.text.muted,
    alignSelf: "flex-start",
  },
  footerNote: {
    marginTop: spacing.xl,
    textAlign: "center",
    fontSize: 12,
    color: colors.text.muted,
  },
});
