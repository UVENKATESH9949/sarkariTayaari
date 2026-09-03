import { Stack, useRouter } from "expo-router";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { useSessionHistory } from "../../../practice/sessionHistory";
import type { SessionRecord } from "../../../practice/sessionHistory";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { radius, spacing } from "../../../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../../../ui/ThemeContext";
import { useT } from "../../../i18n/I18nContext";

// Takes `t` rather than calling useT(): this is a module-scope helper, and a hook cannot
// go here. Same shape as scoreColor below taking the palette.
type Translate = ReturnType<typeof useT>;

function formatRelativeTime(timestampMs: number, nowMs: number, t: Translate): string {
  const diffMinutes = Math.floor((nowMs - timestampMs) / (1000 * 60));
  if (diffMinutes < 1) return t("history.justNow");
  if (diffMinutes < 60) return t("history.minAgo", { count: diffMinutes });
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return t("history.hrAgo", { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return t("history.yesterday");
  return t("history.daysAgo", { count: diffDays });
}

// Takes the palette: these are semantic colours, which differ between themes.
function scoreColor(accuracyPercent: number, colors: Theme["colors"]): string {
  if (accuracyPercent >= 70) return colors.semantic.success;
  if (accuracyPercent >= 40) return colors.semantic.warning;
  return colors.semantic.error;
}

function SessionRow({ session, nowMs, onPress }: { session: SessionRecord; nowMs: number; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const accuracyPercent = Math.round((session.correctCount / session.totalCount) * 100);
  const color = scoreColor(accuracyPercent, colors);

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

      <Text style={styles.rowTime}>{formatRelativeTime(session.completedAt, nowMs, t)}</Text>
    </Card>
  );
}

export default function History() {
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const router = useRouter();
  const { sessions } = useSessionHistory();
  const nowMs = Date.now();

  return (
    <>
      <Stack.Screen options={{ title: t("history.title") }} />
      <ScrollView contentContainerStyle={styles.container}>
        {sessions.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title={t("history.empty")}
            body={t("history.emptyBody")}
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
        <Text style={styles.footerNote}>{t("history.limitNote")}</Text>
      </ScrollView>
    </>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
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
