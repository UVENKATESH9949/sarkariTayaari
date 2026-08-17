import { useEffect, useMemo, useState } from "react";
import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { getDifficultyCounts, type DifficultyCounts } from "../../../db/practiceContent";
import { getDifficultyLevels, type DifficultyLevel } from "../../../db/examStructure";
import { useSyncStatus } from "../../../sync/SyncContext";
import { PressableScale } from "../../../ui/PressableScale";
import { FadeInItem } from "../../../ui/FadeInList";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type Level = {
  key: string;
  label: string;
  icon: IoniconName;
  color: string;
  bg: string;
  count: number;
};

// Used only where a level has no colour/icon set by the admin.
const FALLBACK_LEVEL_STYLE = { icon: "ellipse-outline" as IoniconName, color: "#5a6a85", bg: "#eef1f8" };

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

  const { syncVersion } = useSyncStatus();

  useEffect(() => {
    if (!topicId) return;
    getDifficultyCounts(topicId, examCode ?? null).then(setCounts);
  }, [topicId, examCode, syncVersion]);

  useEffect(() => {
    getDifficultyLevels().then(setSyncedLevels).catch(() => setSyncedLevels([]));
  }, [syncVersion]);

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

        <PressableScale
          disabled={allLevelsTotal === 0}
          onPress={() => openQuiz("all", "All Levels")}
          style={[styles.allLevelsCard, allLevelsTotal === 0 && styles.allLevelsCardDisabled]}
        >
          <View style={[styles.iconCircle, styles.allLevelsIconCircle]}>
            <Ionicons name="layers-outline" size={24} color="#ffffff" />
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.allLevelsTitle}>All Levels</Text>
            <Text style={styles.allLevelsSubtitle}>
              {allLevelsTotal === 0 ? "No questions yet" : `${questionsLabel(allLevelsTotal)} · mixed difficulty`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
        </PressableScale>

        <Text style={styles.sectionLabel}>Practice by difficulty</Text>
        <View style={styles.list}>
          {levels.map((level, index) => {
            const disabled = level.count === 0;
            return (
              <FadeInItem key={level.key} index={index}>
              <PressableScale
                disabled={disabled}
                onPress={() => openQuiz(level.key, level.label)}
                style={[styles.card, disabled && styles.cardDisabled]}
              >
                <View style={[styles.iconCircle, { backgroundColor: level.bg }]}>
                  <Ionicons name={level.icon} size={22} color={level.color} />
                </View>
                <View style={styles.textBlock}>
                  <Text style={styles.levelName}>{level.label}</Text>
                  <Text style={styles.levelStats}>{disabled ? "No questions yet" : questionsLabel(level.count)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#c3cadb" />
              </PressableScale>
              </FadeInItem>
            );
          })}
        </View>
      </ScrollView>
    </>
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
    marginTop: 4,
    fontSize: 13,
    color: "#8a94a6",
    marginBottom: 20,
  },
  allLevelsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#1a2b4a",
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  allLevelsCardPressed: {
    backgroundColor: "#142138",
  },
  allLevelsCardDisabled: {
    opacity: 0.5,
  },
  allLevelsIconCircle: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  allLevelsTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  allLevelsSubtitle: {
    fontSize: 12,
    color: "#c3cadb",
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8a94a6",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  list: {
    gap: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 14,
    padding: 14,
  },
  cardPressed: {
    backgroundColor: "#f5f6f9",
  },
  cardDisabled: {
    backgroundColor: "#f5f6f9",
    opacity: 0.5,
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
    color: "#1a2b4a",
  },
  levelStats: {
    fontSize: 12,
    color: "#8a94a6",
    marginTop: 2,
  },
});
