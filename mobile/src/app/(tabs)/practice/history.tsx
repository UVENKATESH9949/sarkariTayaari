import { Stack } from "expo-router";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { useSessionHistory } from "../../../practice/sessionHistory";
import type { SessionRecord } from "../../../practice/sessionHistory";

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
  if (accuracyPercent >= 70) return "#2f9e64";
  if (accuracyPercent >= 40) return "#c9861f";
  return "#c94f4f";
}

function SessionRow({ session, nowMs }: { session: SessionRecord; nowMs: number }) {
  const accuracyPercent = Math.round((session.correctCount / session.totalCount) * 100);
  const color = scoreColor(accuracyPercent);

  return (
    <View style={styles.row}>
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
                style={[styles.dot, { backgroundColor: r.isCorrect ? "#2f9e64" : "#c94f4f" }]}
              />
            ))}
          </View>
        )}
      </View>

      <Text style={styles.rowTime}>{formatRelativeTime(session.completedAt, nowMs)}</Text>
    </View>
  );
}

export default function History() {
  const { sessions } = useSessionHistory();
  const nowMs = Date.now();

  return (
    <>
      <Stack.Screen options={{ title: "Session History" }} />
      <ScrollView contentContainerStyle={styles.container}>
        {sessions.length === 0 ? (
          <Text style={styles.emptyText}>No practice sessions yet — finish a quiz to see it here.</Text>
        ) : (
          <View style={styles.list}>
            {sessions.map((session) => (
              <SessionRow key={session.id} session={session} nowMs={nowMs} />
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
    padding: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  emptyText: {
    marginTop: 40,
    textAlign: "center",
    fontSize: 14,
    color: "#8a94a6",
  },
  list: {
    gap: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 12,
    padding: 14,
  },
  scoreBadge: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 50,
    alignItems: "center",
  },
  scoreBadgeText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  rowTextBlock: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a2b4a",
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#8a94a6",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  rowTime: {
    fontSize: 11,
    color: "#a7afc0",
    alignSelf: "flex-start",
  },
  footerNote: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 12,
    color: "#a7afc0",
  },
});
