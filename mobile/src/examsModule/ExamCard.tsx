import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ExamCard as ExamCardData } from "../api/examDiscovery";
import { formatDate } from "../examGuide/dates";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { StatPill } from "../ui/StatPill";
import { spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { primaryActionIcon, primaryActionLabel, statusLabel, statusTone } from "./statusLabels";

type ExamCardProps = {
  exam: ExamCardData;
  isFollowed: boolean;
  /** Disabled while a toggle is in flight, so a fast double-tap can't fire the write twice. */
  followPending: boolean;
  onToggleFollow: () => void;
  onPress: () => void;
  onPrimaryAction: () => void;
};

/** The Exams module's own card (spec §5-15) — one card, every section reuses it. */
export function ExamCard({ exam, isFollowed, followPending, onToggleFollow, onPress, onPrimaryAction }: ExamCardProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const tone = statusTone(exam.status, exam.closingSoon, colors);

  const deadlineFact = exam.status && exam.applicationEnd
    ? { label: "Apply by", value: formatDate(exam.applicationEnd) ?? "" }
    : exam.examStart
      ? { label: "Exam on", value: formatDate(exam.examStart) ?? "" }
      : null;

  return (
    <Card variant="elevated" onPress={onPress} style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.examName} numberOfLines={2}>
            {exam.examName}
          </Text>
          {exam.category ? <Text style={styles.category}>{exam.category}</Text> : null}
        </View>
        <View style={styles.headerTrailing}>
          {exam.badge ? <Badge label={exam.badge} /> : null}
          <Pressable
            style={styles.starButton}
            disabled={followPending}
            onPress={(e) => {
              e.stopPropagation();
              onToggleFollow();
            }}
            accessibilityRole="button"
            accessibilityLabel={isFollowed ? "Unfollow this exam" : "Follow this exam"}
          >
            <Ionicons
              name={isFollowed ? "star" : "star-outline"}
              size={20}
              color={isFollowed ? colors.semantic.warning : colors.text.muted}
            />
          </Pressable>
        </View>
      </View>

      <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
        <Text style={[styles.statusText, { color: tone.color }]}>{statusLabel(exam.status)}</Text>
        {exam.closingSoon && exam.daysUntilDeadline !== null ? (
          <Text style={[styles.statusText, { color: tone.color }]}>
            {" "}
            · {exam.daysUntilDeadline} {exam.daysUntilDeadline === 1 ? "day" : "days"} left
          </Text>
        ) : null}
      </View>

      {(deadlineFact || exam.vacancyCount) ? (
        <View style={styles.factsRow}>
          {deadlineFact ? <StatPill icon="calendar-outline" value={deadlineFact.value} label={deadlineFact.label} /> : null}
          {exam.vacancyCount ? (
            <StatPill icon="people-outline" value={String(exam.vacancyCount)} label="vacancies" />
          ) : null}
        </View>
      ) : null}

      {exam.demo ? <Text style={styles.demoNote}>Demo content — for preview only</Text> : null}

      <Button
        variant="secondary"
        size="md"
        icon={primaryActionIcon(exam.primaryAction)}
        onPress={onPrimaryAction}
        style={styles.actionButton}
      >
        {primaryActionLabel(exam.primaryAction)}
      </Button>
    </Card>
  );
}

const buildStyles = ({ colors, radius }: Theme) =>
  StyleSheet.create({
    card: {
      gap: spacing.sm + 2,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    titleBlock: {
      flex: 1,
    },
    examName: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text.primary,
    },
    category: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
    },
    headerTrailing: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    starButton: {
      padding: spacing.xs + 2,
    },
    statusPill: {
      flexDirection: "row",
      alignSelf: "flex-start",
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 4,
    },
    statusText: {
      fontSize: 12,
      fontWeight: "600",
    },
    factsRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    demoNote: {
      fontSize: 11,
      fontStyle: "italic",
      color: colors.text.muted,
    },
    actionButton: {
      alignSelf: "flex-start",
    },
  });
