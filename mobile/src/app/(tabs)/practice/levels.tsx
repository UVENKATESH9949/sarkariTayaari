import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { getDifficultyCounts, getDifficultyLevels, type DifficultyCounts, type DifficultyLevel } from "../../../data/practiceData";
import { useHybridMode } from "../../../data/hybridSource";
import { useSyncStatus } from "../../../sync/SyncContext";
import { ContextualLoading } from "../../../ui/ContextualLoading";
import { FadeInItem } from "../../../ui/FadeInList";
import { OfflineNoDataNotice } from "../../../ui/OfflineNoDataNotice";
import { Card } from "../../../ui/Card";
import { ListSkeleton } from "../../../ui/Skeleton";
import { colors, spacing, typography } from "../../../ui/theme";
import type { IoniconName } from "../../../constants/subjects";

type Level = {
  key: string;
  label: string;
  icon: IoniconName;
  color: string;
  bg: string;
  count: number;
};

// Used only where a level has no colour/icon set by the admin.
const FALLBACK_LEVEL_STYLE = { icon: "ellipse-outline" as IoniconName, color: colors.text.secondary, bg: colors.surfaceElevated2 };

function questionsLabel(count: number): string {
  return count === 1 ? "1 question" : `${count} questions`;
}

export default function Levels() {
  const router = useRouter();
  const { examCode, examLabel, subjectName, topicId, topicName } = useLocalSearchParams<{
    examCode: string;
    examLabel: string;
    subjectName: string;
    topicId: string;
    topicName: string;
  }>();
  const [counts, setCounts] = useState<DifficultyCounts>({});
  // Whatever levels were synced, in the admin's order — not a fixed three.
  const [syncedLevels, setSyncedLevels] = useState<DifficultyLevel[]>([]);
  const [countsLoading, setCountsLoading] = useState(true);
  const [levelsLoading, setLevelsLoading] = useState(true);

  const { syncVersion } = useSyncStatus();
  const mode = useHybridMode();

  useEffect(() => {
    if (!topicId) return;
    getDifficultyCounts(topicId, examCode ?? null, mode).then((result) => {
      setCounts(result);
      setCountsLoading(false);
    });
  }, [topicId, examCode, syncVersion, mode]);

  useEffect(() => {
    getDifficultyLevels(mode)
      .then(setSyncedLevels)
      .catch(() => setSyncedLevels([]))
      .finally(() => setLevelsLoading(false));
  }, [syncVersion, mode]);

  const loading = countsLoading || levelsLoading;

  const levels = useMemo<Level[]>(
    () =>
      syncedLevels.map((level) => ({
        key: level.code,
        label: level.label,
        icon: (level.icon as IoniconName) || FALLBACK_LEVEL_STYLE.icon,
        color: level.color || FALLBACK_LEVEL_STYLE.color,
        bg: level.colorBg || FALLBACK_LEVEL_STYLE.bg,
        count: counts[level.code] ?? 0,
      })),
    [counts, syncedLevels],
  );

  // Summed from the real counts so "All Levels" always matches the levels below it,
  // including any level added after this screen was written.
  const allLevelsTotal = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const openQuiz = (levelKey: string, levelLabel: string) => {
    router.push({
      pathname: "/practice/quiz",
      params: { examCode, examLabel, subjectName, topicId, topicName, levelKey, levelLabel },
    });
  };

  return (
    <>
      <Stack.Screen options={{ title: topicName ?? "Levels" }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Choose a level</Text>
        <Text style={styles.subheading}>{topicName}</Text>

        {loading ? (
          <ContextualLoading message="Getting your practice levels ready..." skeleton={<ListSkeleton count={4} />} />
        ) : (
        <>
        <Card
          variant="filled"
          disabled={allLevelsTotal === 0}
          onPress={() => openQuiz("all", "All Levels")}
          style={styles.allLevelsCard}
        >
          <View style={[styles.iconCircle, styles.allLevelsIconCircle]}>
            <Ionicons name="layers-outline" size={24} color={colors.text.onAccent} />
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.allLevelsTitle}>All Levels</Text>
            <Text style={styles.allLevelsSubtitle}>
              {allLevelsTotal === 0 ? "No questions yet" : `${questionsLabel(allLevelsTotal)} · mixed difficulty`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
        </Card>

        <Text style={[typography.label, styles.sectionLabel]}>Practice by difficulty</Text>
        <View style={styles.list}>
          {levels.map((level, index) => {
            const disabled = level.count === 0;
            return (
              <FadeInItem key={level.key} index={index}>
                <Card disabled={disabled} onPress={() => openQuiz(level.key, level.label)} style={styles.card}>
                  <View style={[styles.iconCircle, { backgroundColor: level.bg }]}>
                    <Ionicons name={level.icon} size={22} color={level.color} />
                  </View>
                  <View style={styles.textBlock}>
                    <Text style={styles.levelName}>{level.label}</Text>
                    <Text style={styles.levelStats}>{disabled ? "No questions yet" : questionsLabel(level.count)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
                </Card>
              </FadeInItem>
            );
          })}
        </View>
        {allLevelsTotal === 0 && mode === "unavailable" && <OfflineNoDataNotice />}
        </>
        )}
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
  heading: {
    ...typography.pageTitle,
    fontSize: 22,
  },
  subheading: {
    ...typography.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  allLevelsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md + 2,
    marginBottom: spacing.xl,
  },
  allLevelsIconCircle: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  allLevelsTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.onAccent,
  },
  allLevelsSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  sectionLabel: {
    marginBottom: spacing.sm + 2,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md + 2,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    flex: 1,
  },
  levelName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.primary,
  },
  levelStats: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
});
