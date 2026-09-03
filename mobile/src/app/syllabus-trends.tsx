import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { getSubjectStats, getTopicStats, type SubjectStat, type TopicStat } from "../data/practiceData";
import { useHybridMode } from "../data/hybridSource";
import { getTopicInsights, type TopicInsight } from "../db/topicIntelligence";
import { useAuth } from "../practice/authContext";
import { useSyncStatus } from "../sync/SyncContext";
import { Card } from "../ui/Card";
import { ContextualLoading } from "../ui/ContextualLoading";
import { EmptyState } from "../ui/EmptyState";
import { ListSkeleton } from "../ui/Skeleton";
import { MasteryChip, PriorityChip, TrendChip, WeightageChip } from "../ui/TopicInsightChips";
import { spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { trackEvent } from "../telemetry/analytics";

type TopicRow = TopicStat & { insight: TopicInsight | null };

/**
 * Exams module Phase 6 — the dedicated syllabus page this whole build grew out of:
 * Subject → Topic → Sub-topic, each row showing admin-curated weightage and PYQ trend,
 * reached from Exam Guide's "Syllabus & Trends" button (renamed from "Syllabus &
 * Practice", which used to jump straight into Practice with no overview at all).
 *
 * Deliberately reuses Epic L's existing topic-intelligence data (`getTopicInsights`,
 * the same local-only read `(tabs)/practice/topics.tsx` already uses) rather than
 * building a second intelligence model — this screen adds an exam-wide overview one
 * level above that per-subject screen, not a competing one. Tapping a topic still opens
 * the same Practice topic screen everything else does.
 */
export default function SyllabusTrendsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const router = useRouter();
  const mode = useHybridMode();
  const { examCode, examName } = useLocalSearchParams<{ examCode: string; examName?: string }>();
  const { syncVersion } = useSyncStatus();
  const { progressVersion } = useAuth();

  const [subjects, setSubjects] = useState<SubjectStat[]>([]);
  const [topicsBySubject, setTopicsBySubject] = useState<Map<string, TopicRow[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (examCode) trackEvent("syllabus_trends_opened", { examCode });
  }, [examCode]);

  useEffect(() => {
    if (!examCode) return;
    let cancelled = false;

    (async () => {
      const subjectList = await getSubjectStats(examCode, mode);
      if (cancelled) return;
      setSubjects(subjectList);

      const perSubject = await Promise.all(
        subjectList.map(async (subject) => {
          const [stats, insights] = await Promise.all([
            getTopicStats(subject.id, examCode, mode),
            getTopicInsights(subject.id, examCode).catch(() => new Map<string, TopicInsight>()),
          ]);
          const rows: TopicRow[] = stats.map((topic) => ({ ...topic, insight: insights.get(topic.id) ?? null }));
          return [subject.id, rows] as const;
        }),
      );
      if (cancelled) return;
      setTopicsBySubject(new Map(perSubject));
      // Every subject starts expanded — this is an overview page, not a drill-down list;
      // collapsing is for a syllabus the reader already knows, not the first view of it.
      setExpanded(new Set(subjectList.map((s) => s.id)));
    })().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [examCode, mode, syncVersion, progressVersion]);

  function toggle(subjectId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  }

  function openTopic(subject: SubjectStat, topic: TopicRow) {
    trackEvent("syllabus_topic_opened", { examCode, topicId: topic.id });
    router.push({
      pathname: "/practice/levels",
      params: { examCode, examLabel: examName ?? "", subjectName: subject.name, topicId: topic.id, topicName: topic.name },
    });
  }

  const totalTopics = useMemo(
    () => Array.from(topicsBySubject.values()).reduce((sum, rows) => sum + rows.length, 0),
    [topicsBySubject],
  );

  return (
    <>
      <Stack.Screen options={{ title: "Syllabus & Trends" }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>{examName ?? "Syllabus"}</Text>
        <Text style={styles.subheading}>
          {subjects.length} subjects · {totalTopics} topics
        </Text>

        {loading ? (
          <ContextualLoading message="Loading syllabus..." skeleton={<ListSkeleton count={6} />} />
        ) : subjects.length === 0 ? (
          <EmptyState
            icon="book-outline"
            title="No syllabus yet"
            body="This exam doesn't have a curated syllabus configured yet."
          />
        ) : (
          subjects.map((subject) => {
            const rows = topicsBySubject.get(subject.id) ?? [];
            const isExpanded = expanded.has(subject.id);
            // Sub-topics (a topic whose parent is also in this subject) render nested under
            // their parent's row — same hierarchy Practice's own Topics screen groups by.
            const byId = new Map(rows.map((r) => [r.id, r]));
            const topLevel = rows.filter((r) => !(r.insight?.parentId && byId.has(r.insight.parentId)));
            const childrenOf = (parentId: string) => rows.filter((r) => r.insight?.parentId === parentId);

            return (
              <Card key={subject.id} variant="container" style={styles.subjectCard}>
                <Pressable
                  style={styles.subjectHeader}
                  onPress={() => toggle(subject.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${subject.name}, ${rows.length} topics`}
                >
                  <Text style={styles.subjectName}>{subject.name}</Text>
                  <View style={styles.subjectHeaderTrailing}>
                    <Text style={styles.subjectMeta}>{rows.length} topics</Text>
                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.text.muted} />
                  </View>
                </Pressable>

                {isExpanded && (
                  <View style={styles.topicList}>
                    {topLevel.length === 0 ? (
                      <Text style={styles.emptyTopics}>No topics curated for this subject yet.</Text>
                    ) : (
                      topLevel.map((topic) => (
                        <View key={topic.id}>
                          {renderTopicRow(topic, subject, () => openTopic(subject, topic), styles, colors)}
                          {childrenOf(topic.id).map((child) => (
                            <View key={child.id} style={styles.childIndent}>
                              {renderTopicRow(child, subject, () => openTopic(subject, child), styles, colors)}
                            </View>
                          ))}
                        </View>
                      ))
                    )}
                  </View>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

function renderTopicRow(
  topic: TopicRow,
  subject: SubjectStat,
  onPress: () => void,
  styles: ReturnType<typeof buildStyles>,
  colors: Theme["colors"],
) {
  const insight = topic.insight;
  return (
    <Pressable style={styles.topicRow} onPress={onPress} accessibilityRole="button">
      <View style={styles.topicRowMain}>
        <Text style={styles.topicName} numberOfLines={1}>
          {topic.name}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
      </View>
      {insight && (
        <View style={styles.chipRow}>
          <WeightageChip
            curatedWeightagePercent={insight.curatedWeightagePercent}
            computedWeightagePercent={insight.computedWeightagePercent}
          />
          <TrendChip direction={insight.trendDirection} />
          <PriorityChip finalPriority={insight.finalPriority} adminOverride={insight.adminOverride} />
          <MasteryChip state={insight.state} accuracyPercent={insight.accuracyPercent} />
        </View>
      )}
    </Pressable>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: {
      padding: spacing.xl,
      paddingBottom: spacing["3xl"],
    },
    heading: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.text.primary,
    },
    subheading: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    subjectCard: {
      marginBottom: spacing.sm + 2,
    },
    subjectHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: spacing.md,
    },
    subjectName: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
    },
    subjectHeaderTrailing: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    subjectMeta: {
      fontSize: 12,
      color: colors.text.muted,
    },
    topicList: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    emptyTopics: {
      fontSize: 12,
      color: colors.text.muted,
      paddingVertical: spacing.md,
    },
    childIndent: {
      marginLeft: spacing.lg,
    },
    topicRow: {
      paddingVertical: spacing.sm + 2,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
      gap: spacing.xs + 2,
    },
    topicRowMain: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    topicName: {
      flex: 1,
      fontSize: 13.5,
      fontWeight: "600",
      color: colors.text.primary,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs + 2,
    },
  });
