import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { getPriorityTopics, type PriorityTopic } from "../db/topicIntelligence";
import { Card } from "./Card";
import { PressableScale } from "./PressableScale";
import { MasteryChip, TrendChip } from "./TopicInsightChips";
import { colors, radius, spacing, typography } from "./theme";

/** How many topics the card shows. Enough to be a plan, few enough not to be a list. */
const TOPIC_COUNT = 4;

type PreparationPlanCardProps = {
  examCode: string | null;
  examName: string | null;
  /** Bumped when a sync or a finished quiz changes the underlying data. */
  refreshKey?: number;
};

/**
 * "Focus next" — the first user-facing slice of the Preparation Plan (Epic L).
 *
 * Shows the highest-priority topics for the exam the student is preparing for, ranked by the
 * server's `finalPriority` (which already resolves an admin override over the computed score —
 * the app does not re-derive that precedence).
 *
 * <p>Renders nothing at all when there is no exam followed or nothing computed. That is the
 * common case on a fresh install and for an exam whose topic map has never been curated, and an
 * empty "Focus next" card would read as a broken feature rather than an absent one. The naming
 * follows the terminology decision in preparation-os-requirements.md §18.1 — "Preparation Plan",
 * not "Roadmap", because many aspirants will not recognise the latter.
 */
export function PreparationPlanCard({ examCode, examName, refreshKey }: PreparationPlanCardProps) {
  const router = useRouter();
  /*
   * The loaded rows are stored *with the exam they belong to*, rather than as a bare list.
   *
   * That removes a synchronous setState from the effect body (which `react-hooks/set-state-in-effect`
   * correctly flags as a cascading render), and in doing so fixes a real latent bug it exposed:
   * clearing the list for a null exam via setState meant that switching followed exam briefly
   * rendered the *previous* exam's topics until the new fetch resolved. Comparing the stored code
   * against the current prop makes a mismatch render nothing, with no extra state write at all.
   */
  const [loaded, setLoaded] = useState<{ examCode: string; topics: PriorityTopic[] } | null>(null);

  useEffect(() => {
    if (!examCode) return;
    let cancelled = false;
    getPriorityTopics(examCode, TOPIC_COUNT)
      .then((rows) => {
        if (!cancelled) setLoaded({ examCode, topics: rows });
      })
      .catch((err) => {
        // Swallowed to an empty list rather than surfaced: this card is additive, and a failure
        // to read it must not take down Home, which is the app's entry point.
        console.warn("Failed to load preparation plan", err);
        if (!cancelled) setLoaded({ examCode, topics: [] });
      });
    // Guards against a slow response for a previous exam landing after a newer one.
    return () => {
      cancelled = true;
    };
  }, [examCode, refreshKey]);

  const topics = loaded && loaded.examCode === examCode ? loaded.topics : null;

  // `null` = still loading, or the followed exam changed and the new rows have not arrived. No
  // skeleton: the card is optional, and flashing a placeholder that may then vanish entirely is
  // worse than appearing once there is something to appear for.
  if (!examCode || topics === null || topics.length === 0) return null;

  const openTopic = (topic: PriorityTopic) => {
    router.push({
      pathname: "/practice/levels",
      params: {
        examCode: examCode ?? undefined,
        examLabel: examName ?? undefined,
        subjectName: topic.subjectName,
        topicId: topic.topicId,
        topicName: topic.topicName,
      },
    });
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Focus next</Text>
          <Text style={styles.subtitle}>
            Highest-weightage topics for {examName ?? "your exam"}
          </Text>
        </View>
        <Ionicons name="compass-outline" size={18} color={colors.brand.light} />
      </View>

      <View style={styles.list}>
        {topics.map((topic, index) => (
          <PressableScale key={topic.topicId} style={styles.row} onPress={() => openTopic(topic)}>
            <Text style={styles.rank}>{index + 1}</Text>
            <View style={styles.rowText}>
              <Text style={styles.topicName} numberOfLines={1}>
                {topic.topicName}
              </Text>
              <Text style={styles.subjectName} numberOfLines={1}>
                {topic.subjectName}
              </Text>
            </View>
            <View style={styles.rowChips}>
              <TrendChip direction={topic.trendDirection} />
              <MasteryChip state={topic.state} accuracyPercent={topic.accuracyPercent} />
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
          </PressableScale>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.base,
    gap: spacing.md,
    marginBottom: spacing.base,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...typography.sectionTitle,
  },
  subtitle: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    backgroundColor: colors.surfaceElevated2,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  rank: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.brand.light,
    width: 14,
    textAlign: "center",
  },
  rowText: {
    flex: 1,
  },
  topicName: {
    fontSize: 13.5,
    fontWeight: "600",
    color: colors.text.primary,
  },
  subjectName: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 1,
  },
  rowChips: {
    // Column, not row: two chips side by side on a narrow row would push the topic name into an
    // ellipsis on a small phone, and the name is the thing being chosen between.
    alignItems: "flex-end",
    gap: 3,
  },
});
